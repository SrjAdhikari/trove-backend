# Directory Retrieval Architecture

This document outlines the architecture, data flow, and security mechanisms behind the Trove backend's Directory and File retrieval system.

## 🏗️ Architecture

The Directory retrieval logic adheres to the Controller-Service pattern, with authentication and validation enforced at the router level before any handler executes.

- **Authentication (`auth.middleware.js`)**: Applied router-wide via `directoryRouter.use(authenticate)`. Every directory endpoint requires a valid session — unauthenticated requests are rejected before reaching any controller.
- **Middleware (`validateId.middleware.js`)**: Registered via `router.param()` on both `id` and `parentDirId` parameters. Validates MongoDB ObjectId format using `isValidObjectId`, throwing a `BAD_REQUEST` error before the request reaches the controller.
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
  3. **Concurrent batch (4-way `Promise.all`):**
     - `File.find({ parentDirId, userId })` — files directly inside the requested directory.
     - `Directory.find({ parentDirId, userId })` — immediate child folders.
     - `getNestedSubtreeStats(directoryId, userId)` — recursive `fileCount` + `totalSize` for the requested directory's full subtree.
     - `getAncestors(directoryId, userId)` — ordered ancestor chain from root to the directory's immediate parent.
  4. **Per-child stats fanout:** For each immediate child folder, calls `getNestedSubtreeStats(childId, userId)` in parallel via `Promise.all` over `childDirs.map(...)` so each card on the listing carries its own recursive `fileCount` + `totalSize`.
  5. **Defense-in-Depth:** Every query (top-level + helpers + per-child) includes `userId` as a filter. Even though the parent directory is ownership-verified, this guards against data leaks from orphaned documents and from any future bug in move/copy operations.
  6. Returns a unified object: `{ ...directory, fileCount, totalSize, ancestors, files, childDirectories }`.

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
      "totalSize": 1234567890,
      "ancestors": [
        { "_id": "root-dir-id", "name": "My Files" }
      ],
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
          "totalSize": 58982400
        }
      ]
    }
  }
  ```

  - `fileCount` / `totalSize` on the top-level directory cover **the whole subtree** (every file under it, recursively). Also present on each `childDirectories[]` entry, scoped to that child's own subtree. `ancestors` is empty `[]` when viewing root.

---

## 🔢 Recursive Stats (`getNestedSubtreeStats`)

Computes `fileCount` and `totalSize` for a directory and every descendant folder, in two DB round-trips:

1. `getAllNestedDirectories(directoryId, userId)` — runs the same `$match` + `$graphLookup` aggregation used by `deleteDirectory` to flatten the subtree (target directory + every nested subdirectory) in one query.
2. `File.find({ parentDirId: { $in: allDirIds }, userId }).lean()` — one query for every file inside any directory in the flattened subtree.

Then in JS: `fileCount = files.length`, `totalSize = files.reduce(sum, file => sum + file.size, 0)`.

Stats are **computed on read** — no `fileCount`/`totalSize` field is persisted on the Directory document. This keeps writes cheap (a file upload does not have to walk up the tree updating ancestor counters) at the cost of doing the recursive count on every listing. Acceptable trade-off until a single subtree exceeds ~100k files; revisit with stored counters then.

## 🧭 Ancestor Chain (`getAncestors`)

Returns the ordered list `[root, …, immediate parent]` for breadcrumbs. **Single DB call** via an upward `$graphLookup`:

- `startWith: "$parentDirId"` — begin at the directory's immediate parent.
- `connectFromField: "parentDirId"`, `connectToField: "_id"` — follow each parent up the chain.
- `depthField: "depth"` — every returned ancestor carries its hop count from the start (depth 0 = immediate parent, highest depth = root).
- `restrictSearchWithMatch: { userId }` — confines the climb to the requesting user's tree.
- `maxDepth: 20` — matches the descendant-traversal cap elsewhere; bounds even pathological nests.

After the aggregate, JS sorts ancestors by **descending depth** so the array reads root-first. Root directories return `ancestors: []` because `parentDirId === null` and the graph traversal yields nothing.

## 🚀 Performance & Scalability Considerations

### 1. Memory-Safe Reads (`.lean()`)

All read queries append `.lean()`, which returns plain JavaScript objects instead of Mongoose documents. This avoids hydrating change-tracking internals, virtuals, and prototype methods — reducing memory per document and improving JSON serialization speed.

### 2. Concurrent Top-Level Batch

The four operations at the top of `getDirectory` (direct files, direct children, recursive stats, ancestors) run in parallel via `Promise.all`. Wall-clock latency is dominated by the slowest single path, not the sum.

### 3. Per-Child Stats Fanout

Each immediate child folder gets its own `getNestedSubtreeStats` call (2 DB queries) so its card carries its own recursive `fileCount` + `totalSize`. These run concurrently via `Promise.all` over `childDirs.map(...)`.

Total query count for a listing with N direct children is `2N + 6`:
- 1 — top-level `Directory.findOne`
- 1 — direct files (`File.find`)
- 1 — direct children (`Directory.find`)
- 2 — `getNestedSubtreeStats` for the requested directory (graphLookup + File.find)
- 1 — `getAncestors` (single aggregate)
- 2N — `getNestedSubtreeStats` per child folder

Wall time is roughly one round-trip of work because everything fans out in parallel and Mongo's default connection pool of 100 covers typical N. A folder with 1000+ direct children would queue queries — flagged for a future `p-limit` cap or pagination.

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
