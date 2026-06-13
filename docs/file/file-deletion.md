# File Deletion Architecture

This document outlines the architecture, data flow, and security mechanisms behind the Trove backend's File deletion system, including database cleanup and physical file removal.

## 🏗️ Architecture

The File deletion logic adheres to the Controller-Service pattern, with authentication and validation enforced at the router level before any handler executes.

- **Authentication (`auth.middleware.js`)**: Applied router-wide via `fileRouter.use(authenticate)`. Every file endpoint requires a valid session — unauthenticated requests are rejected before reaching any controller.
- **Middleware (`validate.middleware.js`)**: `validateId` is registered via `router.param()` on `id`. Validates MongoDB ObjectId format using `isValidObjectId`, throwing a `BAD_REQUEST` error before the request reaches the controller.
- **Controller (`file.controller.js`)**: Extracts route parameters, delegates to the Service layer. Contains zero business logic or database access.
- **Service (`file.service.js`)**: Verifies ownership, deletes the DB record and decrements the parent folders' denormalized sizes in a transaction, then removes the physical file.

---

## 🛣️ API Endpoints

### 1. Delete a File

- **Route:** `DELETE /api/files/:id`
- **Params:** `id` (required) — MongoDB ObjectId of the file to delete
- **Authentication:** Required (session-based)
- **Flow:**
  1. `authenticate` middleware validates the user's session and populates `req.user`.
  2. `validateId` middleware confirms `:id` is a valid ObjectId format.
  3. Controller calls `deleteFile(fileId, userId)` in the Service layer.
  4. Returns the deleted file document.

- **Service Logic (`deleteFile`):**
  1. Queries `File.findOne({ _id: fileId, userId }).lean()` to fetch the file with ownership verification.
  2. If no document matches, throws `AppError` with `NOT_FOUND` and `FILE_NOT_FOUND`.
  3. Constructs the physical storage path: `STORAGE_ROOT/<fileId><extension>`.
  4. **Atomic DB delete (transaction):** Inside `withTransaction`, runs `File.deleteOne({ _id, userId }, { session })` plus `adjustAncestorStats(file.parentDirId, { bytes: -file.size, files: -1 }, session)` — decrementing the parent folder and every ancestor's denormalized `size`/`fileCount` (PR #62). `endSession()` runs in `finally`.
  5. **Physical removal after commit:** Once the transaction commits, removes the on-disk file with `rm(filePath, { force: true })` — a non-retryable side effect kept outside the transaction; `{ force: true }` so a missing file doesn't throw.
  6. Returns the deleted file document (captured before deletion).

- **Response:**
  ```json
  {
    "success": true,
    "message": "File deleted successfully",
    "data": {
      "_id": "...",
      "name": "report.pdf",
      "extension": ".pdf",
      "size": 2457600,
      "parentDirId": "...",
      "userId": "...",
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
  ```

---

## 🚀 Performance & Scalability Considerations

### Transactional DB Delete, Then Physical Removal

PR #62 made the DB delete transactional: `File.deleteOne` and the `adjustAncestorStats` ancestor decrement run together inside `withTransaction`, so a file row can never disappear while its bytes stay counted in ancestor folder sizes (or vice versa). The physical `rm` happens **after** the transaction commits — the DB is the source of truth, and disk I/O is a non-retryable side effect that must stay outside the transaction (the same rule `uploadFile` and `deleteDirectory` follow).

### `{ force: true }` on `rm()`

The `force` flag prevents `rm` from throwing an `ENOENT` error if the physical file doesn't exist on disk (e.g., if a previous upload's stream failed, or the file was already cleaned up). This matches the resilience pattern used by `Promise.allSettled` in directory deletion.

### Ownership Verification Before Deletion

The `findOne` query is necessary before deletion to confirm the file exists and belongs to the user. `deleteOne` alone would silently succeed even if the file doesn't exist, preventing the service from returning a meaningful response or throwing the correct error.

---

## 🛡️ Security Mechanisms

### Ownership-Scoped Queries

Both the `findOne` and `deleteOne` queries include `userId` in the filter. This ensures a user cannot delete another user's file even if they know the ObjectId — defense-in-depth at both the read and write stages.

### Input Validation at Router Level

`router.param('id', validateId)` intercepts invalid ObjectId strings before they reach the controller. This prevents Mongoose `CastError` crashes and avoids sending malformed queries to the database.

---
