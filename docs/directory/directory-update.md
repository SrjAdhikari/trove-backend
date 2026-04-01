# Directory Update (Rename) Architecture

This document outlines the architecture, data flow, and security mechanisms behind the Trove backend's Directory rename system.

## 🏗️ Architecture

The Directory update logic adheres to the Controller-Service pattern, with authentication and validation enforced at the router level before any handler executes.

- **Authentication (`auth.middleware.js`)**: Applied router-wide via `directoryRouter.use(authenticate)`. Every directory endpoint requires a valid session — unauthenticated requests are rejected before reaching any controller.
- **Middleware (`validateId.middleware.js`)**: Registered via `router.param()` on `id`. Validates MongoDB ObjectId format using `isValidObjectId`, throwing a `BAD_REQUEST` error before the request reaches the controller.
- **Controller (`directory.controller.js`)**: Extracts route parameters and request body, performs input validation, delegates to the Service layer. Contains zero business logic or database access.
- **Service (`directory.service.js`)**: Verifies ownership, guards against root directory rename, and performs the update.

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
  1. Queries `Directory.findOne({ _id: directoryId, userId })` to fetch the directory with ownership verification.
  2. If no document matches (wrong ID or wrong owner), throws `AppError` with `NOT_FOUND` and `DIRECTORY_NOT_FOUND`.
  3. **Edge Case Handled:** If the directory has no `parentDirId` (i.e., it's the root directory), throws `AppError` with `BAD_REQUEST` and `DIRECTORY_RENAME_FAILED`. Root directories are permanent and cannot be renamed.
  4. Uses `Directory.findOneAndUpdate({ _id: directoryId, userId }, { name: newDirName }, { new: true, runValidators: true })` to perform the rename.
  5. `runValidators: true` ensures schema constraints (`minlength`, `maxlength`, `trim`) are enforced on the new name.
  6. `.lean()` on both queries returns plain objects for efficient serialization.
  7. Returns the updated directory document.

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

### Two-Step Read-Then-Update

The service uses `findOne` followed by `findOneAndUpdate` instead of a single atomic operation. The extra query is necessary to check the root directory guard before performing the update. This adds one round-trip but keeps the guard explicit and consistent with the delete pattern.

---

## 🛡️ Security Mechanisms

### Root Directory Rename Guard

The service explicitly checks `!directory.parentDirId` before proceeding. Root directories (created during user registration, `parentDirId: null`) are permanent anchors of the user's file tree and cannot be renamed.

### Ownership-Scoped Queries

Both the `findOne` and `findOneAndUpdate` queries include `userId` in the filter. This ensures a user cannot rename another user's directory even if they know the ObjectId — the query returns `null` and the service throws `NOT_FOUND`.

### Schema Validation on Update

`runValidators: true` re-applies Mongoose schema validators on the updated fields. Without this flag, `findOneAndUpdate` bypasses schema validation by default, which could allow invalid names (too short, too long) to be saved.

### Input Validation at Controller Level

The controller explicitly checks that `newDirName` exists and is a string before delegating to the service. This prevents empty renames and type-coercion bugs. This validation will move to Zod middleware once input validation is set up.

---
