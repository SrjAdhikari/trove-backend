# File Retrieval Architecture

This document outlines the architecture, data flow, and security mechanisms behind the Trove backend's File retrieval system.

## 🏗️ Architecture

The File retrieval logic adheres to the Controller-Service pattern, with authentication and validation enforced at the router level before any handler executes.

- **Authentication (`auth.middleware.js`)**: Applied router-wide via `fileRouter.use(authenticate)`. Every file endpoint requires a valid session — unauthenticated requests are rejected before reaching any controller.
- **Middleware (`validateId.middleware.js`)**: Registered via `router.param()` on `id`. Validates MongoDB ObjectId format using `isValidObjectId`, throwing a `BAD_REQUEST` error before the request reaches the controller.
- **Controller (`file.controller.js`)**: Extracts route parameters and query flags, delegates to the Service layer. Decides whether to serve the file inline or as a download based on `req.query.action`. Contains zero business logic or database access.
- **Service (`file.service.js`)**: Executes ownership-scoped database queries and resolves the physical storage path.

---

## 🛣️ API Endpoints

### 1. Retrieve a File

- **Route:** `GET /api/files/:id`
- **Params:** `id` (required) — MongoDB ObjectId of the target file
- **Query:** `action=download` (optional) — triggers a download response with `Content-Disposition: attachment` instead of inline serving
- **Authentication:** Required (session-based)
- **Flow:**
  1. `authenticate` middleware validates the user's session and populates `req.user`.
  2. `validateId` middleware confirms `:id` is a valid ObjectId format.
  3. Controller calls `getFile(fileId, userId)` in the Service layer.
  4. Service returns `{ file, filePath }` — the file metadata and resolved disk path.
  5. **Branching Logic (Controller):** If `req.query.action === "download"`, the controller responds with `res.download(filePath, file.name)`. Otherwise, it serves the file inline via `res.sendFile(filePath)`.

- **Service Logic (`getFile`):**
  1. Queries `File.findOne({ _id: fileId, userId })` with ownership verification.
  2. If no document matches, throws `AppError` with `NOT_FOUND` and `FILE_NOT_FOUND`.
  3. Constructs the physical storage path: `STORAGE_ROOT/<fileId><extension>`.
  4. Returns `{ file, filePath }` — delegating the HTTP response decision to the controller.

- **Response (download):**
  Binary file content with `Content-Disposition: attachment; filename="original-name.ext"`.

- **Response (inline):**
  Binary file content served with the appropriate `Content-Type` header (determined by Express's `sendFile`).

---

## 🚀 Performance & Scalability Considerations

### Memory-Safe Reads (`.lean()`)

The file query appends `.lean()`, which returns a plain JavaScript object instead of a Mongoose document. This avoids hydrating change-tracking internals, virtuals, and prototype methods — reducing memory per document and improving JSON serialization speed.

### Storage Path Convention

Files are stored on disk using `<ObjectId><extension>` as the filename (e.g., `664a1f...b3.pdf`). This eliminates filename collisions across users and directories without needing nested folder structures on disk.

### Static File Serving via Express

`res.sendFile()` and `res.download()` delegate to Express's built-in static file serving, which handles `Content-Type` detection, `ETag` headers, and `Range` requests (partial content) automatically.

---

## 🛡️ Security Mechanisms

### Ownership-Scoped Queries

The database query includes `userId` as a filter condition. This prevents IDOR (Insecure Direct Object Reference) attacks where an authenticated user could access another user's file by guessing the ObjectId.

### Input Validation at Router Level

`router.param('id', validateId)` intercepts invalid ObjectId strings before they reach the controller. This prevents Mongoose `CastError` crashes and avoids sending malformed queries to the database.

### HTTP-Agnostic Service Layer

The service returns `{ file, filePath }` instead of calling `res.sendFile()` or `res.download()` directly. This keeps the service layer HTTP-agnostic, making it testable and reusable without mocking Express response objects.

---
