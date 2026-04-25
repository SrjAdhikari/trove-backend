# File Upload Architecture

This document outlines the architecture, data flow, and security mechanisms behind the Trove backend's File upload system.

## 🏗️ Architecture

The File upload logic adheres to the Controller-Service pattern, with authentication and validation enforced at the router level before any handler executes.

- **Authentication (`auth.middleware.js`)**: Applied router-wide via `fileRouter.use(authenticate)`. Every file endpoint requires a valid session — unauthenticated requests are rejected before reaching any controller.
- **Middleware (`validateId.middleware.js`)**: Registered via `router.param()` on `parentDirId`. Validates MongoDB ObjectId format using `isValidObjectId`, throwing a `BAD_REQUEST` error before the request reaches the controller.
- **Controller (`file.controller.js`)**: Extracts route parameters and request headers, delegates to the Service layer. Passes the request object as a readable stream to the service. Contains zero business logic or database access.
- **Service (`file.service.js`)**: Validates parent directory ownership, creates the file record, and streams the file data to disk.

---

## 🛣️ API Endpoints

### 1. Upload a File

- **Route:** `POST /api/files{/:parentDirId}`
- **Params:** `parentDirId` (optional) — MongoDB ObjectId of the target parent directory
- **Headers:**
  - `filename` (optional) — Original filename (e.g., `"report.pdf"`). Defaults to `"untitled"` if omitted.
  - `Content-Type` — Should reflect the file's MIME type (used by Express for request parsing).
- **Body:** Raw binary stream of the file data
- **Authentication:** Required (session-based)
- **Flow:**
  1. `authenticate` middleware validates the user's session and populates `req.user`.
  2. If `:parentDirId` is present, `validateId` middleware confirms it is a valid ObjectId format.
  3. Controller reads `req.headers.filename`, defaulting to `"untitled"` if absent.
  4. **Edge Case Handled:** If `parentDirId` is omitted, the controller falls back to `req.user.rootDirId` — the user's permanent root directory created during registration.
  5. Calls `uploadFile(parentDirId, userId, fileName, req)` in the Service layer, passing the request as a readable stream.
  6. Returns the newly created file document with `201 Created`.

- **Service Logic (`uploadFile`):**
  1. Queries `Directory.findOne({ _id: parentDirId, userId }).lean()` to verify the parent directory exists and belongs to the authenticated user.
  2. If no document matches, throws `AppError` with `NOT_FOUND` and `DIRECTORY_NOT_FOUND`.
  3. Extracts the file extension from the filename via `path.extname()`.
  4. Creates the file record via `File.create({ ..., size: 0 })` to obtain a unique `_id` for the storage filename. The `size` field is required by the schema; it gets overwritten with the real byte count after the pipeline succeeds.
  5. Constructs the storage path: `STORAGE_ROOT/<fileId><extension>`.
  6. Builds a byte-counting `Transform` via `createByteCounter(MAX_UPLOAD_SIZE_BYTES)` from `src/utils/byteCounter.js` (shared with the Drive import path).
  7. Streams file data through the pipeline: `pipeline(fileStream, counter.stream, createWriteStream(filePath))`. The counter trips with `state.tripped = true` if cumulative bytes exceed the 100 MB per-file cap.
  8. **Rollback on Failure:** If the pipeline rejects, both rollback steps (`File.deleteOne` + `rm`) run via `Promise.allSettled`. After rollback, the catch inspects `counter.state.tripped` — true ⇒ throws `AppError` with `BAD_REQUEST` and `FILE_TOO_LARGE`; otherwise throws `INTERNAL_SERVER_ERROR` with `FILE_UPLOAD_FAILED`. `allSettled` (not `all`) ensures a flaky DB or filesystem during rollback can't swallow the original cap-trip error.
  9. **Persist Size:** After a successful pipeline, the service sets `file.size = counter.state.bytes` and calls `file.save()` so the final byte count lands on the document.
  10. Returns the created file document (including `size`).

- **Response:**
  ```json
  {
    "success": true,
    "message": "File uploaded successfully",
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

  - `size` is the exact byte count produced by the in-pipeline counter — never trusted from headers or body fields. Required by both the Mongoose schema and the Atlas `$jsonSchema` validator.

---

## 📏 Per-File Size Cap & Byte Counting

`MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024` (100 MB) is enforced **mid-stream** rather than from a `Content-Length` header (which clients can lie about or omit on chunked uploads). The mechanism:

1. `createByteCounter(perFileCap, remainingBudget = Infinity)` from `src/utils/byteCounter.js` returns `{ stream, state }` where `stream` is a `Transform` that increments `state.bytes` per chunk and aborts the pipeline (`cb(error)`, `state.tripped = true`) the moment cumulative bytes exceed `perFileCap`.
2. Inserted between `req` and the disk writer in the pipeline, so the writable side never sees over-cap chunks.
3. After a successful pipeline, `state.bytes` is the authoritative size — written back to the doc via `file.size = counter.state.bytes; await file.save()`.

The same helper powers the Drive import path (`drive.service.js`), where the second argument (`remainingBudget`) lets it also enforce a cumulative 500 MB aggregate cap across a multi-item import.

## 🚀 Performance & Scalability Considerations

### Stream-Based Upload with `pipeline()`

The service uses Node.js `stream/promises.pipeline()` instead of manual `req.pipe()`. This provides:
- **Backpressure handling** — Automatically pauses the readable stream when the writable stream's buffer is full, preventing memory exhaustion on large uploads.
- **Error propagation** — If either stream errors, `pipeline` rejects the promise immediately. Manual `.pipe()` silently ignores errors on the readable side.
- **Automatic cleanup** — On error, `pipeline` destroys both streams, releasing file descriptors.

### DB-Record-First Strategy

The file record is created in MongoDB **before** the stream write begins. This is necessary because the `_id` is used as the physical filename. The tradeoff is that a failed stream write requires rolling back the DB record — handled by the `catch` block.

### Best-Effort Rollback on Failure

The rollback uses `Promise.allSettled([File.deleteOne(), rm()])` to clean up the DB record and partial file concurrently, minimising the window of inconsistency. `allSettled` (not `all`) ensures both steps always run even if one fails — and crucially, that a rollback rejection can't replace the original cap-trip error before the catch reaches the `if (counter.state.tripped)` branch.

### Storage Path Convention

Files are stored as `<ObjectId><extension>` (e.g., `664a1f...b3.pdf`). This avoids filename collisions entirely — no two files share the same ObjectId regardless of original name, user, or directory.

---

## 🛡️ Security Mechanisms

### Parent Directory Ownership Verification

Before uploading, the service verifies that the parent directory belongs to the authenticated user. This prevents users from injecting files into another user's directory by guessing a `parentDirId`.

### Schema-Level Validation

The File model enforces `minlength: 3` on the `name` field, `required: true` on all fields, and `strict: "throw"` to reject any fields not defined in the schema.

### HTTP-Agnostic Service Layer

The service accepts a generic `Readable` stream parameter (`fileStream`) rather than the Express `req` object directly. While the controller currently passes `req` as the stream, this interface is intentionally generic to support future migration to S3 or other storage backends without changing the service signature.

---
