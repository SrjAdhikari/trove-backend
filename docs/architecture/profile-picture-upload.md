# Profile Picture Upload

> **Status:** As-built (2026-06-02). Lets users upload and replace their profile picture in the `/api/users` module, served via public capability URLs. No schema migration — reuses the existing `profilePicture` field. *(Informally "avatar"; all API identifiers use `profilePicture` / `profile-picture`.)*

## Context

Today a user's photo lives in `User.profilePicture` (`String`, default `null`). The **only** writer is OAuth: `oauth.service.js` seeds it at account creation and **re-writes it on every Google/GitHub login** (along with `name`) to the provider's current values. Email/password users have no way to set a photo at all.

Two facts make that login re-sync a problem now: `name` became user-editable via `PATCH /profile`, and this work makes the picture user-editable too. A login re-sync would clobber whichever the user changed in our app. So this work both adds picture upload **and disables the login re-sync**, making our app the source of truth for `name` and `profilePicture` after signup.

The frontend continues to read a single field — `profilePicture` — and render it directly in an `<img>`, whether it points at a provider URL or at our own serving route. The design is dependency-free: it reuses the raw-stream upload pattern from `file.service.js` (no multipart parser) and adds no image-processing library.

---

## Scope

**In scope:**
- `POST /api/users/profile-picture` — upload **and replace** the authenticated user's picture (raw image body).
- `GET /api/users/profile-picture/:id` — **public, unauthenticated** route that streams picture bytes by capability token.
- Disable the OAuth login re-sync of `name` + `profilePicture` (commented out, retained for future use).
- New required env var `API_URL` (the API's own public origin) for building absolute picture URLs.
- Magic-byte image validation (JPEG / PNG / WEBP only), an environment-configured size cap, old-file cleanup on replace.

**Explicitly out of scope (deferred):**
- **`DELETE /api/users/profile-picture` (clear photo back to `null`).** Follow-up PR. Replacement already cleans up the old file, so deferring this does not leak disk — it only postpones the "remove my photo entirely" action.
- **Image resizing / normalization (e.g. `sharp`).** Stored as-uploaded. Add later only if thumbnail variants are needed.
- Docs sync (`docs/api/error-codes.md` and the frontend API handoff reference) — ships in the post-feature docs PR, consistent with the already-parked profile docs.

> The earlier "OAuth `name`-clobber" follow-up is no longer separate — disabling the login re-sync (below) handles it directly.

---

## Locked design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Photo field | Reuse the one `profilePicture` field; no new schema field, no Atlas migration | A profile picture is a profile picture — the field already holds "a URL you can render"; uploads just store our URL there. |
| Source-of-truth conflict | After signup the app owns the photo. OAuth **seeds** `profilePicture` (and `name`) once at account creation; the **login re-sync is disabled** (commented out) | Dissolves the two-writers clobber for both fields now that each is user-editable. Cost: provider-side changes won't auto-propagate (user can re-upload / re-edit). |
| Visibility | Any party the app shows the URL to can view the picture (owner + other users) | Pictures are meant to be seen. |
| Serving model | **Public capability URL** — a random unguessable token is the route `:id`; a public no-auth route streams by token | An `<img>` can't carry custom auth, so a no-auth token URL renders directly wherever the app shows a user — no cookie dependency (works the same whether the FE is same-site or cross-origin). Non-enumerable. New token per upload gives free cache-busting. |
| Route param | `:id` is a **128-bit random hex token, not a Mongo ObjectId**; validated inline by `^[a-f0-9]{32}$`. `validateId` is deliberately **not** applied | A guessable ObjectId would defeat the non-enumerable capability design. Named `:id` for route-convention consistency only. |
| Storage layout | `storage/profile-pictures/<token>` — **no extension on disk**; MIME derived by sniffing the file head on read | Keeps the URL an extensionless id and makes cleanup a single exact-path delete. The same `mimeType` sniffer runs on upload (validate) and serve (set `Content-Type`). |
| Upload transport | Raw image body streamed to disk (`pipeline(req, …)`), same as `file.service.js` | Zero new dependencies; one consistent upload pattern across the codebase. |
| Type validation | **Magic-byte sniff** of the first bytes, not `Content-Type`/filename. Allow JPEG / PNG / WEBP. Reject SVG and GIF | The bytes must genuinely be a supported raster image. SVG is XML and can carry executable script — explicitly excluded. |
| Size cap | `MAX_PROFILE_PICTURE_SIZE` (currently 2 MB), enforced mid-stream via the existing `createByteCounter` | Plenty for a picture; bounds disk/bandwidth. Raw stream bypasses the 1 MB `express.json` limit, so the counter is the real guard. Read from the environment through `getNumberEnv` in `src/constants/env.js`, so clients should surface the error rather than mirror the number. |
| URL form | **Absolute** — `https://<API_URL>/api/users/profile-picture/<token>`, from a new required `API_URL` env var | Makes `profilePicture` a uniform "render directly" field; FE treats provider and uploaded URLs identically. Required env var fails loud at boot if misconfigured. |
| Old-file cleanup | On replace, parse the token from the previous `profilePicture` **only when it matches our `/api/users/profile-picture/` prefix** (validated by strict regex), then delete that file. Remote/`null` previous values → nothing to delete | Prevents orphaned files without adding a schema field; preserves the "zero migration" promise. |
| Caching | `Cache-Control: public, max-age=31536000, immutable` + correct sniffed `Content-Type` + `X-Content-Type-Options: nosniff` | Safe because the URL changes on every re-upload. `nosniff` is safe because we send the real, sniffed type. |
| Code organization | All endpoints in existing `user.service.js` / `user.controller.js` / `user.routes.js`. Public serve route registered **before** `userRouter.use(authenticate)`. Generic image sniffing in new `src/utils/mimeType.js`; path/URL/token helpers added to existing `src/utils/storagePath.js` | Profile-picture data belongs to the user module; only the image-type sniffer is generic enough to live on its own. `routes/index.js` needs no change. |

---

## Data model

**No schema change.** `User.profilePicture` is reused as-is:

```js
profilePicture: { type: String, default: null }
```

It holds one of: a provider photo URL (OAuth-seeded), an absolute URL we built (`https://<API_URL>/api/users/profile-picture/<token>`), or `null`.

The only model-layer change is in `oauth.service.js` — the existing-user **login re-sync is commented out** so a login cannot clobber a user-edited name or an uploaded picture. The seed at `User.create` is untouched.

```js
// Refresh denormalized profile fields only when they've changed.
// DISABLED: name (PR #47) and profilePicture are now user-editable in-app, so the app is the
// source of truth after signup. Re-syncing here would clobber the user's own changes on every
// login. Kept commented in case provider-profile re-sync is ever wanted again.
// if (existingUser.name !== name || existingUser.profilePicture !== picture) {
//     await User.updateOne(
//         { _id: existingUser._id },
//         { name, profilePicture: picture },
//         { runValidators: true },
//     );
// }
```

---

## Endpoints

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/users/profile-picture` | session (`userRouter.use(authenticate)`) | Upload / replace own picture; returns the updated user (same projection as `PATCH /profile`) |
| `GET /api/users/profile-picture/:id` | **public** (registered before `authenticate`) | Stream picture bytes by capability token |
| `GET /api/auth/me` | session | **Unchanged** — already returns `profilePicture` |

**Route ordering invariant:** the public `GET /profile-picture/:id` must be registered in `user.routes.js` **before** `userRouter.use(authenticate)`. Moving it below the middleware would silently make it require a session and break `<img>` loading.

---

## Upload flow (`POST /api/users/profile-picture`)

1. **Stream with validation:** `pipeline(req, typeValidator.stream, counter.stream, createWriteStream(path))`, after `mkdir(profilePicturesDir, { recursive: true })`.
   - `typeValidator` (from `mimeType.js`) sniffs the first 16 bytes: JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WEBP `RIFF…WEBP` **plus** a `VP8 `/`VP8L`/`VP8X` codec chunk at offset 12 (a bare `RIFF…WEBP` prefix is rejected). Unsupported → trips with `INVALID_IMAGE_TYPE` (400).
   - `createByteCounter(MAX_PROFILE_PICTURE_SIZE)` trips → `IMAGE_TOO_LARGE` (400).
   - `path` = `storage/profile-pictures/<token>`, `token = crypto.randomBytes(16).toString("hex")`.
   - Any trip rolls back the partial file (same pattern as `file.service.js`).
2. **Persist then clean up** (ordering avoids ever losing the picture): write new file → capture old `profilePicture` → set `profilePicture` to the new absolute URL → best-effort delete the **old local file** if it was one of ours.

Returns `{ success, message, data: <updated user, sensitive fields excluded> }`.

---

## Serving flow (`GET /api/users/profile-picture/:id`)

Thin and public:

1. Validate `:id` against `^[a-f0-9]{32}$` (path-traversal guard; not via `validateId`).
2. Resolve `storage/profile-pictures/<id>`; missing file → `PROFILE_PICTURE_NOT_FOUND` (404) via the global error handler.
3. Sniff MIME from the file head (reuse `mimeType.js`) → `res.type(mime)`, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`.
4. `res.sendFile(path)`.

---

## Security notes

- **No SVG/GIF, magic-byte enforced** — defeats `Content-Type`/extension spoofing and SVG-borne script.
- **Strict token regex** on the serving route and on cleanup parsing — no path traversal into `storage/`.
- **Capability tokens** (128-bit random) are unguessable and never enumerable by userId.
- **Size cap mid-stream** — the request is aborted as soon as it exceeds the configured cap, not after buffering.

---

## Files touched

| File | Type | Description |
|---|---|---|
| `src/utils/mimeType.js` | New | Magic-byte sniff (`detectImageType`) + a head-validating pass-through transform |
| `src/utils/storagePath.js` | Modified | Add `PROFILE_PICTURES_ROOT`, `buildProfilePicturePath`, `buildProfilePictureUrl`, `parseProfilePictureToken` |
| `src/services/user.service.js` | Modified | Add `uploadProfilePicture` (upload/replace + old-file cleanup) and `getProfilePicture` (serve resolver) |
| `src/controllers/user.controller.js` | Modified | Add `uploadProfilePictureHandler`, `getProfilePictureHandler` |
| `src/routes/user.routes.js` | Modified | Public `GET /profile-picture/:id` (before `authenticate`) + authed `POST /profile-picture` |
| `src/services/oauth.service.js` | Modified | Comment out the existing-user login re-sync block |
| `src/constants/appErrorCode.js` | Modified | Add `INVALID_IMAGE_TYPE`, `IMAGE_TOO_LARGE`, `PROFILE_PICTURE_NOT_FOUND` |
| `src/constants/env.js` | Modified | Add required `API_URL` |
| `.env` (local) | Modified | Add `API_URL` — gitignored, not in the PR diff; required at boot |
| `src/middlewares/error.middleware.js` | Modified | `globalErrorHandler` returns `next(err)` when `res.headersSent`, so a mid-stream `sendFile` failure delegates to Express's finalhandler instead of throwing `ERR_HTTP_HEADERS_SENT` (shipped as the `fix(error-middleware)` commit; also closes a pre-existing `getFileHandler` exposure) |
| `tests/services/user.service.test.js` | Modified | TDD profile-picture service behaviors |
| `tests/middlewares/error.middleware.test.js` | Modified | Test the `headersSent` delegation |
| `tests/services/oauth.service.test.js` | Modified | Swap refresh-truncation test for the no-clobber test |
| `tests/utils/mimeType.test.js` | New | TDD magic-byte validation |
| `tests/utils/storagePath.test.js` | New | TDD path/URL/token helpers |

`routes/index.js` — **no change** (the serve route rides on the already-mounted `/api/users`).

---

## Testing

TDD at the service + util layer (Vitest + `mongodb-memory-server`), matching existing `tests/services/*.test.js` and `tests/utils/*` conventions (no supertest in the repo → no HTTP-level tests). One behavior per red→green step:

- `mimeType`: accepts valid JPEG/PNG/WEBP signatures; rejects SVG, GIF, and truncated/garbage input.
- `user.service` `setProfilePicture`: writes a file and sets an absolute URL; trips the 2 MB cap and rolls back; replacing an existing picture deletes the old file; a remote/`null` previous `profilePicture` is left untouched on disk.
- `oauth.service`: a returning OAuth user's `name` **and** `profilePicture` are **not** overwritten on login.

---

## As-built notes (deltas from design)

A few details settled during implementation and review:

- **Naming:** the service functions are `uploadProfilePicture` / `getProfilePicture`; the controller handlers are `uploadProfilePictureHandler` / `getProfilePictureHandler`.
- **Serve existence check:** `getProfilePicture` opens the file with `fs.open()` and maps `ENOENT` → `PROFILE_PICTURE_NOT_FOUND` (404). Using `open` (rather than a separate `stat` + `open`) is one syscall and closes the check-then-use TOCTOU gap; any non-`ENOENT` `fs` error propagates to the global handler as a masked 500.
- **Serve error forwarding:** the handler sets the cache / `nosniff` headers, then `res.sendFile(path, cb)`. On a *pre-stream* failure the callback strips `Cache-Control` (so a transient error isn't cached for a year) and calls `next(err)`. *Mid-stream* failures (headers already sent) are terminated centrally by `globalErrorHandler`, which now returns `next(err)` when `res.headersSent` — shipped as the `fix(error-middleware)` commit, also closing a pre-existing `getFileHandler` exposure.
- **Verification:** dual-agent pre-commit review + `api-design` / `auth-and-security` / `error-handling` lens audits; 36 touched-file tests green (service + util + middleware layers; no supertest in the repo).

---

## Out of scope / follow-ups

- `DELETE /api/users/profile-picture` (clear to `null`) — next PR.
- Image resizing / thumbnails — only if needed later.
- Docs + frontend-api-reference sync — post-feature docs PR.
