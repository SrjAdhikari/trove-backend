# Directory Creation Architecture

This document outlines the architecture, data flow, and security mechanisms behind the Trove backend's Directory creation system.

## 🏗️ Architecture

The Directory creation logic adheres to the Controller-Service pattern, with authentication and validation enforced at the router level before any handler executes.

- **Authentication (`auth.middleware.js`)**: Applied router-wide via `directoryRouter.use(authenticate)`. Every directory endpoint requires a valid session — unauthenticated requests are rejected before reaching any controller.
- **Middleware (`validate.middleware.js`)**: `validateId` is registered via `router.param()` on `parentDirId` (ObjectId format check), and `validateBody(createDirectorySchema)` sanitizes the body — both run before the request reaches the controller.
- **Controller (`directory.controller.js`)**: Extracts route parameters and request body, delegates to the Service layer. Contains zero business logic or database access.
- **Service (`directory.service.js`)**: Validates parent directory ownership and creates the new directory document.

---

## 🛣️ API Endpoints

### 1. Create a New Directory

- **Route:** `POST /api/directories/{:parentDirId}`
- **Params:** `parentDirId` (optional) — MongoDB ObjectId of the parent directory
- **Body:** `{ "name": "Folder Name" }` (optional — defaults to `"New Folder"`)
- **Authentication:** Required (session-based)
- **Flow:**
  1. `authenticate` middleware validates the user's session and populates `req.user`.
  2. If `:parentDirId` is present, `validateId` middleware confirms it is a valid ObjectId format.
  3. `validateBody(createDirectorySchema)` sanitizes the body at the route — `name` is optional; it's trimmed, stripped of control characters and path dividers, and capped at 255 chars, defaulting to `"New Folder"` when absent, blank, or non-string. The controller reads the already-clean `req.body.name`.
  4. **Edge Case Handled:** If `parentDirId` is omitted, the controller falls back to `req.user.rootDirId` — the user's permanent root directory created during registration.
  5. Calls `createDirectory(parentDirId, dirname, userId)` in the Service layer.
  6. Returns the newly created directory document with `201 Created`.

- **Service Logic (`createDirectory`):**
  1. Queries `Directory.findOne({ _id: parentDirId, userId })` to verify the parent directory exists and belongs to the authenticated user.
  2. If no document matches, throws `AppError` with `NOT_FOUND` and `DIRECTORY_NOT_FOUND`.
  3. Inside a `session.withTransaction()`: creates the new directory via `Directory.create([{ name, parentDirId, userId, ancestorIds }], { session })`, then calls `updateAncestorDirectoryStats(parentDirId, { folders: 1 }, session)` to increment the denormalized `folderCount` of every ancestor folder. The walk starts at the parent, so the new folder's own `folderCount` stays at the schema default `0`. Added in PR #69.
  4. Returns the created directory document (with `size`, `fileCount`, and `folderCount` all `0`).

- **Response:**
  ```json
  {
    "success": true,
    "message": "Directory created successfully",
    "data": {
      "_id": "...",
      "name": "New Folder",
      "parentDirId": "...",
      "userId": "...",
      "size": 0,
      "fileCount": 0,
      "folderCount": 0,
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
  ```

---

## 🛡️ Security Mechanisms

### Parent Directory Ownership Verification

Before creating a child directory, the service verifies that the parent directory belongs to the authenticated user. This prevents users from injecting directories into another user's folder structure by guessing a `parentDirId`.

### Schema-Level Validation

The Directory model enforces `minlength: 3` and `maxlength: 50` on the `name` field, with `trim: true` to strip leading/trailing whitespace. The `strict: "throw"` option rejects any fields not defined in the schema. The Zod `createDirectorySchema` sanitizes and caps the name at 255 chars upstream, but the Mongoose `3..50` bounds remain the authoritative backstop — a name of 51–255 chars passes Zod yet is rejected by Mongoose as `422 VALIDATION_ERROR`.

### Duplicate Directory Handling (Pending)

A unique compound index on `{ parentDirId, userId, name }` is planned to prevent duplicate directory names under the same parent. The global error middleware already handles `E11000` → `DUPLICATE_FIELD`.

---
