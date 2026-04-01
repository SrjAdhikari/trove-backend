# Directory Update (Rename) Architecture

This document outlines the architecture, data flow, and security mechanisms behind the Trove backend's Directory rename system.

## 🏗️ Architecture

The Directory update logic adheres to the Controller-Service pattern, with authentication and validation enforced at the router level before any handler executes.

- **Authentication (`auth.middleware.js`)**: Applied router-wide via `directoryRouter.use(authenticate)`. Every directory endpoint requires a valid session — unauthenticated requests are rejected before reaching any controller.
- **Middleware (`validateId.middleware.js`)**: Registered via `router.param()` on `id`. Validates MongoDB ObjectId format using `isValidObjectId`, throwing a `BAD_REQUEST` error before the request reaches the controller.
- **Controller (`directory.controller.js`)**: Extracts route parameters and request body, performs input validation, delegates to the Service layer. Contains zero business logic or database access.
- **Service (`directory.service.js`)**: Executes an atomic ownership-scoped update and returns the renamed directory.

---

## 🛣️ API Endpoints

### 1. Rename a Directory

- **Route:** `PATCH /api/directories/:id`
- **Params:** `id` (required) — MongoDB ObjectId of the directory to rename
- **Body:** `{ "newDirName": "Updated Name" }` (required)
- **Authentication:** Required (session-based)
- **Flow:**
  1. `authenticate` middleware validates the user's session and populates `req.user`.
  2. `validateId` middleware confirms `:id` is a valid ObjectId format.
  3. Controller reads `req.body?.newDirName` with safe optional chaining.
  4. **Input Validation:** If `newDirName` is missing or not a string, the controller throws `AppError` with `BAD_REQUEST` and `INVALID_INPUT`.
  5. Calls `updateDirectory(directoryId, newDirName, userId)` in the Service layer.
  6. Returns the updated directory document.

- **Service Logic (`updateDirectory`):**
  1. Uses `Directory.findOneAndUpdate({ _id: directoryId, userId }, { name: newDirName }, { new: true, runValidators: true })` — a single atomic operation that combines lookup, ownership check, and update.
  2. `runValidators: true` ensures schema constraints (`minlength`, `maxlength`, `trim`) are enforced on the new name.
  3. If no document matches (wrong ID or wrong owner), throws `AppError` with `NOT_FOUND` and `DIRECTORY_NOT_FOUND`.
  4. `.lean()` returns a plain object for efficient serialization.
  5. Returns the updated directory document.

- **Response:**
  ```json
  {
    "success": true,
    "message": "Directory renamed successfully",
    "data": {
      "_id": "...",
      "name": "Updated Name",
      "parentDirId": "...",
      "userId": "...",
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
  ```

---

## 🚀 Performance & Scalability Considerations

### Atomic Update with `findOneAndUpdate`

Uses a single `findOneAndUpdate` instead of `findOne` + manual `.save()`. This avoids two round-trips and eliminates race conditions where another request could modify the document between the read and the write.

---

## 🛡️ Security Mechanisms

### Ownership-Scoped Update

The `findOneAndUpdate` query includes `userId` in the filter. This ensures a user cannot rename another user's directory even if they know the ObjectId — the query simply returns `null` and the service throws `NOT_FOUND`.

### Schema Validation on Update

`runValidators: true` re-applies Mongoose schema validators on the updated fields. Without this flag, `findOneAndUpdate` bypasses schema validation by default, which could allow invalid names (too short, too long) to be saved.

### Input Validation at Controller Level

The controller explicitly checks that `newDirName` exists and is a string before delegating to the service. This prevents empty renames and type-coercion bugs. This validation will move to Zod middleware once input validation is set up.

---
