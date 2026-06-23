# Directory Retrieval Architecture

This document outlines the architecture, data flow, and security mechanisms behind the Trove backend's Directory and File retrieval system.

## 🏗️ Architecture

The Directory retrieval logic adheres to the Controller-Service pattern, with authentication and validation enforced at the router level before any handler executes.

- **Authentication (`auth.middleware.js`)**: Applied router-wide via `directoryRouter.use(authenticate)`. Every directory endpoint requires a valid session — unauthenticated requests are rejected before reaching any controller.
- **Middleware (`validate.middleware.js`)**: `validateId` is registered via `router.param()` on both `id` and `parentDirId` parameters. Validates MongoDB ObjectId format using `isValidObjectId`, throwing a `BAD_REQUEST` error before the request reaches the controller.
- **Controller (`directory.controller.js`)**: Extracts route parameters and delegates to the Service layer. Contains zero business logic or database access.
- **Service (`directory.service.js`)**: Executes ownership-scoped database queries and returns structured directory contents.

---

## 🛣️ API Endpoints

### 1. Retrieve Directory Contents

- **Route:** `GET /api/directories/{:id}`
- **Params:** `id` (optional) — MongoDB ObjectId of the target directory
- **Authentication:** Required (session-based)
- **Flow:**
  1. `authenticate` middleware validates the user's session and populates `req.user`.
  2. If `:id` is present, `validateId` middleware confirms it is a valid ObjectId format.
  3. Controller checks if `req.params.id` exists.
  4. **Edge Case Handled:** If `id` is omitted, the controller falls back to `req.user.rootDirId` — the user's permanent root directory created during registration.
  5. Calls `getDirectory(directoryId, userId)` in the Service layer.
  6. Returns the structured directory payload.

- **Service Logic (`getDirectory`):**
  1. Queries `Directory.findOne({ _id: directoryId, userId })` to fetch the target directory with ownership verification.
  2. If no document matches, throws `AppError` with `NOT_FOUND` and `DIRECTORY_NOT_FOUND`.
  3. **Concurrent batch (3-way `Promise.all`):**
     - `File.find({ parentDirId, userId })` — files directly inside the requested directory.
     - `Directory.find({ parentDirId, userId })` — immediate child folders (each carries its own stored `size`/`fileCount`/`folderCount`).
     - `resolveDirectoryNames(directory.ancestorIds, userId)` — resolves the directory's stored ancestor IDs (root → immediate parent) into `{ _id, name }` via a single indexed `$in` (no aggregation).
  4. **Stored subtree stats (no aggregation):** The requested directory's `size`/`fileCount` are read straight off its document, and each child folder's totals are read from its own stored `size`/`fileCount` in a synchronous `.map` — no per-child DB fanout. These fields are maintained on write (see below), so listings no longer recompute them.
  5. **Defense-in-Depth:** Every query includes `userId` as a filter. Even though the parent directory is ownership-verified, this guards against data leaks from orphaned documents and from any future bug in move/copy operations.
  6. Builds a self-inclusive `breadcrumb` (root → current folder) from the resolved ancestors via `generateBreadCrumb`, and a `path` display string via `generatePath`. Returns a unified object: `{ ...directory, totalSize, fileCount, breadcrumb, path, files, childDirectories }`. The stored `size` is surfaced as `totalSize`; the raw `size` and the internal `ancestorIds` are dropped (top-level and on each child).

- **Response:**
  ```json
  {
    "success": true,
    "message": "Directory fetched successfully",
    "data": {
      "_id": "...",
      "name": "Documents",
      "parentDirId": "...",
      "userId": "...",
      "createdAt": "...",
      "updatedAt": "...",
      "fileCount": 142,
      "folderCount": 8,
      "totalSize": 1234567890,
      "breadcrumb": [
        { "_id": "root-dir-id", "name": "My Files" },
        { "_id": "...", "name": "Documents" }
      ],
      "path": "/My Files/Documents",
      "files": [
        {
          "_id": "...",
          "id": "...",
          "name": "report.pdf",
          "extension": ".pdf",
          "size": 2457600,
          "parentDirId": "...",
          "userId": "...",
          "createdAt": "...",
          "updatedAt": "..."
        }
      ],
      "childDirectories": [
        {
          "_id": "...",
          "id": "...",
          "name": "Reports",
          "parentDirId": "...",
          "userId": "...",
          "createdAt": "...",
          "updatedAt": "...",
          "fileCount": 24,
          "folderCount": 3,
          "totalSize": 58982400
        }
      ]
    }
  }
  ```

  - `fileCount` / `folderCount` / `totalSize` on the top-level directory cover **the whole subtree** (every file and nested folder under it, recursively). Also present on each `childDirectories[]` entry, scoped to that child's own subtree. When viewing root, `breadcrumb` is just the folder itself and `path` is `"/My Files"`.

---

## 🔢 Subtree Stats (denormalized `size` / `fileCount` / `folderCount`)

`fileCount`, `folderCount`, and `totalSize` for a directory's whole subtree are **stored on the Directory document** (as `fileCount`, `folderCount`, and `size`) and read directly — no aggregation, no per-child fanout. The listing does zero extra work for stats.

The counters are **maintained on write, inside the same transaction as the file/directory change**, by `updateAncestorDirectoryStats(startDirId, { bytes, files, folders }, session)` in `directory.service.js`, which walks the `parentDirId` chain from the changed directory up to the root and `$inc`s `size`/`fileCount`/`folderCount` on every ancestor:

- `uploadFile` → `+bytes, +1 file` on the parent chain.
- `deleteFile` → `-bytes, -1 file`.
- `createDirectory` → `+1 folder` on the parent chain (the new folder's own count starts at 0).
- `deleteDirectory` → subtracts the deleted subtree's stored totals, including its folder count, from the ancestor chain.

This inverts the earlier trade-off: writes now do a bounded walk up the tree, but reads are O(1) field lookups regardless of subtree size. See `../architecture/transaction-patterns.md` for the transactional shape and retry-safety, and `../architecture/database-schema.md` for the Atlas `minimum: 0` underflow guard (the Mongoose model deliberately has no `min`, since `$inc` skips validators).

## 🧭 Breadcrumb & Path (stored `ancestorIds` + `resolveDirectoryNames`)

Each `Directory` stores **`ancestorIds`** — its ancestor IDs, root-first, **excluding itself** (root → `[]`). It's seeded on create (`createDirectory`, which also covers Drive import); the root gets `[]` from the schema `default`. So a child of root stores `[rootId]`, a grandchild `[rootId, childId]`, and so on. The field is indexed `{ ancestorIds: 1, userId: 1 }` (which also serves a future move's subtree query) and is **never returned raw** — it's stripped from the response.

On read, `resolveDirectoryNames(ancestorIds, userId)` turns that list into `[{ _id, name }]` (root → immediate parent) with a **single indexed `$in`** — no `$graphLookup`, no depth-sort. Input order is preserved client-side via a `Map` keyed by id, and the query is ownership-scoped by `userId`. Two pure helpers in `src/utils/path.js` then shape the response:

- `generateBreadCrumb(ancestors, directory)` → the clickable trail root → **current** folder (self-inclusive), `[{ _id, name }]`.
- `generatePath(breadcrumb)` → a display string, e.g. `"/My Files/Documents"`.

A root directory's `ancestorIds` is `[]`, so its breadcrumb is just the folder itself and its `path` is `"/My Files"`.

The root directory is stored internally as `root-<email>`; `getDirectory` masks it to `"My Files"` in the top-level `name`, the first breadcrumb crumb, and the `path`, so responses never expose the owner's email or the internal naming convention.

## 🚀 Performance & Scalability Considerations

### 1. Memory-Safe Reads (`.lean()`)

All read queries append `.lean()`, which returns plain JavaScript objects instead of Mongoose documents. This avoids hydrating change-tracking internals, virtuals, and prototype methods — reducing memory per document and improving JSON serialization speed.

### 2. Concurrent Top-Level Batch

The three operations at the top of `getDirectory` (direct files, direct children, ancestors) run in parallel via `Promise.all`. Wall-clock latency is dominated by the slowest single path, not the sum. (This was previously a 4-way batch that also recomputed subtree stats; those are now stored, so that query is gone.)

### 3. Constant Query Count (no per-child fanout)

Each child folder's `fileCount`/`totalSize` is read from its own stored fields in the `Directory.find` result — no per-child query. Total query count for a listing is a **constant 4**, independent of the number of children N:
- 1 — top-level `Directory.findOne`
- 1 — direct files (`File.find`)
- 1 — direct children (`Directory.find`) — each carries its stored stats
- 1 — `resolveDirectoryNames` (single indexed `$in`)

This was previously `2N + 6` — a `getNestedSubtreeStats` fanout of 2 queries per child that queued under the connection pool for folders with 1000+ children. That fanout, and the `p-limit`/pagination follow-up it would have needed, is gone; only the unbounded `.find()` result-size concern (below) remains.

### 4. Compound Indexes

Both `Directory` and `File` models define a compound index on `{ parentDirId: 1, userId: 1 }`. This directly supports the child-fetching queries in `getDirectory`, enabling index-only lookups instead of collection scans as data grows.

### 5. Unbounded Query Pagination (Pending)

The current `.find()` calls return all children in a single response. For directories with thousands of files, pagination via `.limit()` and `.skip()` (or cursor-based) will be needed to prevent memory exhaustion and response timeouts.

---

## 🛡️ Security Mechanisms

### Authentication Enforcement

All directory routes are gated behind `directoryRouter.use(authenticate)`. This runs before `router.param()` validation, ensuring that unauthenticated requests never trigger database queries or ObjectId validation.

### Ownership-Scoped Queries

Every database query includes `userId` as a filter condition — both for the target directory and its children. This prevents IDOR (Insecure Direct Object Reference) attacks where an authenticated user could access another user's directory by guessing the ObjectId.

### Input Validation at Router Level

`router.param('id', validateId)` intercepts invalid ObjectId strings before they reach the controller. This prevents Mongoose `CastError` crashes and avoids sending malformed queries to the database.

---
