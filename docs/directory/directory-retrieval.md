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
  3. **High-Performance Querying:** Uses `Promise.all()` to concurrently fetch child files and child directories instead of sequential awaits.
  4. **Defense-in-Depth:** Both child queries (`File.find`, `Directory.find`) include `userId` in the filter. Even though the parent directory is already ownership-verified, this guards against data leaks from orphaned documents caused by bugs in move/copy/migration operations.
  5. Returns a unified object: `{ ...directory, files, childDirectories }`.

- **Response:**
  ```json
  {
    "success": true,
    "message": "Directory fetched successfully",
    "data": {
      "_id": "...",
      "name": "...",
      "parentDirId": "...",
      "userId": "...",
      "files": [{ "_id": "...", "id": "...", "name": "...", "extension": "..." }],
      "childDirectories": [{ "_id": "...", "id": "...", "name": "..." }]
    }
  }
  ```

---

## 🚀 Performance & Scalability Considerations

### 1. Memory-Safe Reads (`.lean()`)

All read queries append `.lean()`, which returns plain JavaScript objects instead of Mongoose documents. This avoids hydrating change-tracking internals, virtuals, and prototype methods — reducing memory per document and improving JSON serialization speed.

### 2. Concurrent Child Fetching

`Promise.all([File.find(...), Directory.find(...)])` executes both queries in parallel against MongoDB, cutting response latency compared to sequential awaits.

### 3. Compound Indexes

Both `Directory` and `File` models define a compound index on `{ parentDirId: 1, userId: 1 }`. This directly supports the child-fetching queries in `getDirectory`, enabling index-only lookups instead of collection scans as data grows.

### 4. Unbounded Query Pagination (Pending)

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
