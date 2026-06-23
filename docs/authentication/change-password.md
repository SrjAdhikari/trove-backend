# Change Password Flow

This document outlines the architecture, data flow, and edge cases handled by the TroveCloud backend when a **signed-in** email/password user changes their password. Shipped 2026-06-23.

It is the authenticated counterpart to the [password-reset flow](./password-reset.md): reset is a public, OTP-driven recovery path for users who are locked out, whereas change-password requires an active session and proof of the **current** password.

## 🏗️ Architecture

The flow follows the same Controller-Service split as the rest of the auth surface, with authentication, rate limiting, and validation enforced at the router before the handler runs.

- **Route (`src/routes/auth.routes.js`)**: Registers `PATCH /api/auth/change-password` behind `authenticate → authLimiter → validateBody(changePasswordSchema)`. `authenticate` runs **first** so `req.user` and `req.sessionId` are populated before the limiter and validator execute.
- **Controller (`src/controllers/auth.controller.js`)**: `changePasswordHandler` extracts `currentPassword` / `newPassword` from the body and `userId` / `sessionId` from the authenticated request, then calls the service. No business logic, no DB access.
- **Auth Service (`src/services/auth.service.js`)**: `changePassword(userId, currentPassword, newPassword, currentSessionId)` re-queries the user with `+password`, runs the provider and credential guards, and atomically commits the password change + other-session wipe.

The service deliberately mirrors `resetPassword`'s shape — same `withTransaction` boundary, same pre-save re-hash — with two differences: it verifies the **current password** instead of an OTP, and it **keeps the current session alive** (revoking only the others).

---

## 🛣️ API Endpoint

### Change Password

- **Route:** `PATCH /api/auth/change-password`
- **Authentication:** Required (session cookie). Distinct from the reset flow, which is public.
- **Payload:** `{ currentPassword, newPassword }`
- **Flow:**
  1. `authenticate` validates the session cookie and attaches `req.user` + `req.sessionId`. A missing/invalid session is rejected with `401 UNAUTHORIZED_ACCESS` before any later middleware runs.
  2. `authLimiter` applies the auth-tier rate limit (≈10 requests / 15 min) — this is a credential operation, so it shares the auth bucket with login/reset.
  3. `validateBody(changePasswordSchema)` validates the body at the route: `currentPassword` must be a non-empty string, and `newPassword` must satisfy the shared complexity rules (min 8 + lowercase + uppercase + number + special character). A failure throws `400 VALIDATION_ERROR`.
  4. The controller calls `changePassword(req.user._id, currentPassword, newPassword, req.sessionId)`.
  5. Service fetches the user with `User.findById(userId).select("+password")` to bypass the schema's `select: false` on the hash. A missing document (rare TOCTOU — the account was deleted mid-request) surfaces as `404 USER_NOT_FOUND`.
  6. **Provider Guard:** Rejects OAuth-provisioned users (`provider !== "email"`) with `400 PROVIDER_MISMATCH`. This runs **before** the password comparison — an OAuth account has no stored hash, so `comparePassword` would otherwise run `bcrypt.compare` against `undefined` and throw a raw error.
  7. **Credential Check:** `user.comparePassword(currentPassword)` runs `bcrypt.compare` against the stored hash. A mismatch returns `401 INVALID_CREDENTIALS` (matches `loginUser`'s code for a bad password).
  8. **Reuse Guard:** If `newPassword === currentPassword`, throws `400 PASSWORD_REUSE` — the new password must differ from the one just confirmed.
  9. **Atomic Commit:** Opens a MongoDB transaction and runs two writes inside the callback:
     - Sets `user.password = newPassword` and `await user.save({ session })` — Mongoose's pre-save hook re-hashes via `bcrypt`. Complexity was already enforced by the Zod schema at the route; the model's `minlength: 8` remains a last-resort backstop (`422 VALIDATION_ERROR`).
     - `await Session.deleteMany({ userId: user._id, _id: { $ne: currentSessionId } }, { session })` — revokes every active session **except** the current device's.
  10. Returns `200 OK` with `{ success: true, message: "Password changed successfully" }` — no `data`, matching the logout handlers. The current device stays signed in; all other devices are logged out.

---

## 🛡️ Security Mechanisms

### Why the current session is preserved (unlike reset)

The reset flow wipes **every** session because it doubles as compromise recovery — an attacker may have triggered it. Change-password is different: the caller is already authenticated **and** has just proven knowledge of the current password on this device. Logging them out of the device they're actively using would be pure friction. So the current session is kept and only the **other** sessions are revoked — which still kills any stale or stolen session living on another device, the property that actually matters after a credential rotation. This matches the behavior of mainstream providers (e.g., Google, GitHub) on an authenticated password change.

### Why the provider guard runs before the credential check

OAuth-provisioned users (`provider !== "email"`) have `password: undefined`. If the guard ran after `comparePassword`, `bcrypt.compare(currentPassword, undefined)` would throw a raw bcrypt error instead of a clean `PROVIDER_MISMATCH`. Ordering the guard first keeps the failure path a typed `AppError`, identical to the guard in `loginUser` / `forgotPassword` / `resetPassword`.

### Why the reuse check runs after the credential check

`PASSWORD_REUSE` is only reachable once the current password has been confirmed correct. This ordering means a wrong `currentPassword` always returns `INVALID_CREDENTIALS` and never leaks, via the reuse branch, that the attacker's guess happened to equal the submitted new password. The check itself compares two plaintext values from the **same request** (`newPassword === currentPassword`) — no server-side secret is involved, so a constant-time comparison is unnecessary here; the actual secret comparison (against the stored hash) uses `bcrypt`.

### Why the writes are wrapped in a transaction

If `Session.deleteMany` failed after `user.save`, a non-transactional flow would leave the password changed but the user's other sessions still alive — a worse state than not changing it at all. Wrapping both writes in `withTransaction` means a partial failure rolls the password change back too, so the user simply retries cleanly. See [`../architecture/transaction-patterns.md`](../architecture/transaction-patterns.md) for the shared pattern and its retry-safety.

### Why the endpoint is rate-limited

`change-password` accepts the current password as input, which makes it a brute-force surface. Sitting it behind the `auth` tier limiter bounds the number of current-password guesses an authenticated caller can make in a window.

---

## 🔄 Edge Cases & Failure Modes

| Scenario | Outcome |
| --- | --- |
| No / invalid session cookie | `401 UNAUTHORIZED_ACCESS` (from `authenticate`, before the handler) |
| `currentPassword` missing or empty/whitespace | `400 VALIDATION_ERROR` (Zod `nonempty` after `trim`) |
| `newPassword` fails the complexity rules | `400 VALIDATION_ERROR` (Zod composition rules) |
| Account was created via Google/GitHub | `400 PROVIDER_MISMATCH` — no password to change |
| `currentPassword` is wrong | `401 INVALID_CREDENTIALS` |
| `newPassword` identical to `currentPassword` | `400 PASSWORD_REUSE` |
| User deleted mid-request (TOCTOU) | `404 USER_NOT_FOUND` |
| `user.save` succeeds but `Session.deleteMany` fails | Whole transaction rolls back — password unchanged, all sessions intact, user retries cleanly |
| User double-clicks submit | Each request runs its own transaction; the second sees the already-rotated password and returns `401 INVALID_CREDENTIALS` (the old `currentPassword` no longer matches) |

---

## 🧹 Database Mechanisms

The flow is read-modify-write on existing `User` fields. **No new schema fields, no new indexes, no migration** — and therefore no Atlas `$jsonSchema` mirror change.

- The existing `select: false` on `password` keeps the hash out of every response by default; `changePassword` opts in with `.select("+password")` exactly once per call to run `comparePassword` and `save`. See [`../architecture/database-schema.md`](../architecture/database-schema.md).
- `Session.deleteMany` with the `_id: { $ne: currentSessionId }` filter is the only session write — `Session` documents otherwise TTL out at 7 days (defined in `session.model.js`).

---

## 🔀 Alternative: OAuth Users

OAuth-provisioned users (Google, GitHub) have no password, so `changePassword` rejects them with `PROVIDER_MISMATCH` — the same guard the reset flow applies. The frontend should detect this code and hide the change-password form for OAuth accounts.

For users who are signed out and have forgotten their password, see the [password-reset flow](./password-reset.md). For the session model and login paths, see [`login-and-sessions.md`](./login-and-sessions.md).

---
