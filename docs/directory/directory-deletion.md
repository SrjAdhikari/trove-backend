# Directory Deletion Architecture

This document outlines the architecture, data flow, and security mechanisms behind the Trove backend's Directory deletion system, including recursive subdirectory collection, atomic database cleanup, and physical file removal.

## 🏗️ Architecture

The Directory deletion logic adheres to the Controller-Service pattern, with authentication and validation enforced at the router level before any handler executes.

- **Authentication (`auth.middleware.js`)**: Applied router-wide via `directoryRouter.use(authenticate)`. Every directory endpoint requires a valid session — unauthenticated requests are rejected before reaching any controller.
- **Middleware (`validate.middleware.js`)**: `validateId` is registered via `router.param()` on `id`. Validates MongoDB ObjectId format using `isValidObjectId`, throwing a `BAD_REQUEST` error before the request reaches the controller.
- **Controller (`directory.controller.js`)**: Extracts route parameters, delegates to the Service layer. Contains zero business logic or database access.
- **Service (`directory.service.js`)**: Orchestrates the full deletion pipeline — recursive directory collection, path validation, atomic DB deletes, and physical file cleanup.

---

## 🛣️ API Endpoints

### 1. Delete a Directory and All Its Contents

- **Route:** `DELETE /api/directories/:id`
- **Params:** `id` (required) — MongoDB ObjectId of the directory to delete
- **Authentication:** Required (session-based)
- **Flow:**
  1. `authenticate` middleware validates the user's session and populates `req.user`.
  2. `validateId` middleware confirms `:id` is a valid ObjectId format.
  3. Controller calls `deleteDirectory(directoryId, userId)` in the Service layer.
  4. Returns the deleted directory document.

- **Service Logic (`deleteDirectory`):**
  1. Calls `getAllNestedDirectories(directoryId, userId)` to fetch the target directory and all nested subdirectories via `$graphLookup` aggregation.
  2. If no document matches, throws `AppError` with `NOT_FOUND` and `DIRECTORY_NOT_FOUND`.
  3. **Edge Case Handled:** If the target directory has no `parentDirId` (i.e., it's the root directory), throws `AppError` with `BAD_REQUEST` and `DIRECTORY_DELETE_FAILED`. Root directories are permanent and cannot be deleted.
  4. Collects all directory IDs (target + nested) into `allDirIds`.
  5. Fetches all files within those directories via `File.find({ parentDirId: { $in: allDirIds }, userId })`.
  6. **Path Validation:** Builds every physical file path via `buildFilePath`, which throws if a path escapes `STORAGE_ROOT`. This runs before any deletion, so a malicious entry aborts the entire operation before the DB transaction.
  7. **Atomic DB Deletion:** Deletes all file and directory records within a `session.withTransaction()`, then — in the same transaction — calls `updateAncestorDirectoryStats(rootDir.parentDirId, { bytes: -rootDir.size, files: -rootDir.fileCount, folders: -allDirIds.length }, session)` to subtract the deleted subtree's denormalized totals — bytes, file count, and folder count — from every ancestor folder above it (PR #62; folder count added in PR #69). If any step fails, all roll back together.
  8. **Physical File Cleanup:** After successful DB transaction, deletes physical files via `Promise.allSettled()`. Failures here do not roll back the DB operation — orphaned physical files are less harmful than phantom DB records.
  9. Returns the deleted root directory document.

- **Response:**
  ```json
  {
    "success": true,
    "message": "Directory deleted successfully",
    "data": {
      "_id": "...",
      "name": "...",
      "parentDirId": "...",
      "userId": "...",
      "subDirectories": [{ "_id": "...", "name": "..." }]
    }
  }
  ```

---

## 🔄 Recursive Directory Collection (`getAllNestedDirectories`)

Uses MongoDB's `$graphLookup` aggregation to recursively collect all nested subdirectories in a single database round-trip.

1. **`$match`** — Finds the target directory with ownership verification (`_id` + `userId`).
2. **`$graphLookup`** — Starting from the matched directory's `_id`, traverses the `directories` collection by following `parentDirId` → `_id` relationships recursively. Results are stored in the `subDirectories` array.
   - `maxDepth: 20` — Caps recursion to prevent runaway traversal.
   - `restrictSearchWithMatch: { userId }` — Ensures only directories owned by the authenticated user are collected.

### Why `$graphLookup` Over Custom Recursive Queries

| | `$graphLookup` | Custom BFS (loop + queries) |
|---|---|---|
| DB round-trips | **1** | 1 per depth level |
| Complexity | Single pipeline stage | Loop + accumulator logic |
| Index usage | Uses `parentDirId` index | Same |

**Scalability Note:** `$graphLookup` loads all subdirectories into a single aggregation document. MongoDB's 16MB document limit applies. For users with thousands of nested directories, this could theoretically fail — but is not a realistic concern at current scale.

---

## 🚀 Performance & Scalability Considerations

### Atomic Transactions with `session.withTransaction()`

File and directory `deleteMany` operations — plus the `updateAncestorDirectoryStats` ancestor-counter decrement added in PR #62 (extended to folder count in PR #69) — run inside a single transaction. If any operation fails, all roll back, preventing partial deletes where files exist without their parent directory, or ancestor `size`/`fileCount`/`folderCount` totals drift out of sync with what was actually removed.

### Session Lifecycle Safety

The session is wrapped in `try/finally` to guarantee `session.endSession()` runs even if the transaction throws. This prevents session leaks that could exhaust MongoDB's connection pool.

### DB-First, Physical-Second Deletion Order

Physical file deletion happens **after** the DB transaction succeeds. This ordering ensures:
- If the DB transaction fails, no physical files are lost.
- If physical deletion fails, the DB is already clean — orphaned files on disk are a minor cleanup task, not a data integrity issue.

### `Promise.allSettled` for Physical Cleanup

Uses `Promise.allSettled` instead of `Promise.all` for physical file deletion. If some files are missing from disk (already deleted, never written), the operation completes without throwing — remaining files are still cleaned up.

---

## 🛡️ Security Mechanisms

### Root Directory Deletion Guard

The service explicitly checks `!rootDir.parentDirId` before proceeding. Root directories (created during user registration, `parentDirId: null`) are permanent anchors of the user's file tree and cannot be deleted.

### Ownership-Scoped Queries at Every Level

- The `$graphLookup` aggregation includes `restrictSearchWithMatch: { userId }` — only directories belonging to the authenticated user are collected.
- The `File.find` query includes `userId` in the filter — even though parent directories are already verified.
- The `deleteMany` operations include `userId` in the filter — defense-in-depth against IDOR attacks.

### Path Traversal Guard

Path construction is centralized in `buildFilePath` (`src/utils/storagePath.js`), which rejects any path that escapes `STORAGE_ROOT` — compared as `STORAGE_ROOT + path.sep` so a same-prefixed sibling like `storage-evil` can't slip past. A malicious `extension` field (e.g., `/../../../etc/passwd`) produces such a path; `buildFilePath` throws `AppError(BAD_REQUEST, INVALID_INPUT)` during Step 4, aborting the entire operation before any DB or disk deletion occurs.

### Input Validation at Router Level

`router.param('id', validateId)` intercepts invalid ObjectId strings before they reach the controller. This prevents Mongoose `CastError` crashes and avoids sending malformed queries to the database.

---
