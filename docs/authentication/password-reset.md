# Password Reset Flow

This document outlines the architecture, data flow, and edge cases handled by the TroveCloud backend during the Forgot Password and Reset Password process. Shipped in PR #25 (2026-04-30).

## 🏗️ Architecture

The password-reset flow reuses the same Controller-Service split as registration, and deliberately reuses the **existing `otp` / `otpExpiresAt` fields on the `User` document** instead of introducing parallel reset-specific fields. Once a user is verified, those fields are idle, so they can carry the reset code without a schema migration.

- **Controller (`auth.controller.js`)**: Validates required body fields and calls into the service.
- **Auth Service (`auth.service.js`)**: Looks up the user, runs guards (verified, email-provider, cooldown), issues or verifies the OTP, and atomically commits the password change + session wipe.
- **OTP Service (`otp.service.js`)**: Provides the shared `issueOTPToUser`, `isOTPExpired`, `isValidOTP`, `isOTPCooldownActive`, and `sendPasswordResetOTP` helpers used by both the registration and reset flows.

---

## 🛣️ API Endpoints

Both endpoints are **public** (no `authenticate` middleware) — the user is by definition not signed in when resetting.

### 1. Request Reset OTP

- **Route:** `POST /api/auth/forgot-password`
- **Payload:** `{ email }`
- **Flow:**
  1. `validateRequestBody(forgotPasswordSchema)` validates `email` at the route (`400 VALIDATION_ERROR` if missing or malformed).
  2. Calls `forgotPassword(email)` in Auth Service.
  3. Service queries `User.findOne({ email, isVerified: true })` — unverified accounts are filtered out (the registration flow handles them) and surface as `USER_NOT_FOUND`.
  4. **Provider Guard:** Rejects OAuth-provisioned users with `400 PROVIDER_MISMATCH`. A Google/GitHub user has no stored password, so a reset code would be useless and confusing — the message steers them to their actual sign-in method.
  5. **Anti-Spam Cooldown:** Checks `isOTPCooldownActive(user.otpExpiresAt, ONE_MINUTE_MS)`. If a previous reset code was issued within the last 60 seconds, throws `429 OTP_COOLDOWN` to prevent email-service abuse.
  6. Calls the shared `issueOTPToUser(user)` helper, which generates a fresh 6-digit OTP, stores its SHA-256 hash on `user.otp`, sets `user.otpExpiresAt` to 10 minutes from now, and returns the plain code.
  7. Dispatches the plain code via `sendPasswordResetOTP(user.name, email, plainOTP)` — wrapped around the existing `PASSWORD_RESET_EMAIL_TEMPLATE`.
  8. Returns `200 OK` with a success message. **The plain OTP is never returned in the response** — it only travels via email.

### 2. Reset Password

- **Route:** `POST /api/auth/reset-password`
- **Payload:** `{ email, otp, newPassword }`
- **Flow:**
  1. `validateRequestBody(resetPasswordSchema)` validates `email`, `otp`, and `newPassword` at the route (`400 VALIDATION_ERROR` if any are missing or malformed).
  2. Calls `resetPassword(email, otp, newPassword)` in Auth Service.
  3. Service fetches the user with `.select("+otp +otpExpiresAt")` to bypass the schema's `select: false` security on those fields.
  4. **User filter:** Same `{ email, isVerified: true }` query as `forgotPassword` — keeps both endpoints consistent on which accounts are eligible.
  5. **Provider Guard:** Same `PROVIDER_MISMATCH` rejection — defense in depth, matches the guard in `forgotPassword` so a malicious caller can't bypass it by going straight to reset.
  6. **Expiry Check:** `isOTPExpired(user.otpExpiresAt)` returns `true` for `undefined` (the field is unset on a verified user who hasn't requested a reset), expired timestamps, or anywhere in between — all surface as `400 OTP_EXPIRED`.
  7. **OTP Verification:** `isValidOTP(otp, user.otp)` uses `crypto.timingSafeEqual` against Buffer equivalents to prevent timing attacks while comparing the input hash against the stored hash. Mismatch returns `400 INVALID_OTP`.
  8. **Atomic Commit:** Opens a MongoDB transaction (mirrors `verifyOTP`'s pattern) and runs three writes inside the callback:
     - Sets `user.password = newPassword` — Mongoose's pre-save hook re-hashes via `bcrypt`.
     - Sets `user.otp = undefined` and `user.otpExpiresAt = undefined` — clears the reset code so it can't be replayed.
     - `await user.save({ session })` — password strength was already enforced by the Zod `resetPasswordSchema` at the route (min 8 + composition, `400 VALIDATION_ERROR`); Mongoose's `minlength: 8` remains a last-resort backstop (`422 VALIDATION_ERROR`).
     - `await Session.deleteMany({ userId: user._id }, { session })` — wipes every active session for the user.
  9. Returns `200 OK` with a success message. The user must log in again on every device.

---

## 🛡️ Security Mechanisms

### Why OTP fields are reused, not duplicated

A verified user's `otp` / `otpExpiresAt` are idle — registration cleared them inside `verifyOTP`'s transaction. Adding a parallel `passwordResetOtp` / `passwordResetOtpExpiresAt` would bloat the schema for a feature that has the same shape as registration's OTP. Reuse is safe because:

- **No collision with registration:** Verified users don't go through `verifyOTP` again. Unverified users are filtered out of the reset flow by `isVerified: true` on the query, so a reset request can't overwrite an active registration OTP.
- **The cooldown helper sees through it:** `isOTPCooldownActive(undefined, ms)` returns `false`, so a verified user who has never requested a reset is immediately eligible. There's no fake-cooldown leak from registration history.

### Why all sessions are invalidated on success

The reset flow doubles as compromise recovery. If an attacker triggered the reset (e.g., they found a forgotten weak password, or stole an OTP delivery), wiping every session makes sure they get logged out alongside the legitimate user. The legitimate user's only cost is logging in fresh on each device — a tolerable inconvenience.

`Session.deleteMany` is inside the transaction so a partial failure doesn't leave the password updated but the attacker's sessions still alive — the password change rolls back too, and the user retries cleanly with the same OTP (which is still valid because the rollback restores `user.otp`).

### Why the OTP plain value never crosses the controller

The plain code is created and consumed entirely inside the service layer — `forgotPassword` captures it from `issueOTPToUser`, hands it to `sendPasswordResetOTP`, and the local variable goes out of scope. The controller only learns "the call succeeded." This makes it structurally impossible to leak the OTP through a JSON response.

### Why `isOTPExpired(undefined) === true`

Defensive default in `otp.service.js`. A verified user who hits `/reset-password` without first calling `/forgot-password` has `user.otpExpiresAt === undefined`. Returning `true` here ensures the path `OTP_EXPIRED` is taken and the request is rejected, even though the more accurate semantics would be "no reset was requested." The current behavior has two upsides:

- **Matches `verifyOTP`'s contract** — same helper, same edge case, same outcome. One mental model.
- **Slightly less information leakage** — an attacker probing the endpoint can't distinguish "user has requested a reset and OTP expired" from "user has never requested a reset."

A bespoke `OTP_NOT_REQUESTED` code was considered (see CodeRabbit review on PR #25) and declined for these reasons.

### Why the cooldown is enforced on send, not on verify

A 60-second cooldown on `forgot-password` blocks email-service abuse. There is **no** per-account / per-IP attempt counter on `reset-password` — the OTP space is 6 digits (1M values) over a 10-minute window, which a high-volume attacker could theoretically bruteforce. The intended mitigation is a network-layer rate limiter applied to all auth endpoints; that work is deferred until the broader security pass and is intentionally not added piecemeal here.

---

## 🔄 Edge Cases & Failure Modes

| Scenario | Outcome |
| --- | --- |
| User submits unknown email | `404 USER_NOT_FOUND` — chosen over the privacy-preserving "always 200" alternative because the frontend uses a clear error surface for this case; trades a minor email-enumeration leak for clearer UX |
| User signed up via Google/GitHub | `400 PROVIDER_MISMATCH` with a hint to use the OAuth flow |
| User submits forgot-password twice within 60s | First call succeeds; second returns `429 OTP_COOLDOWN` |
| OTP arrives 11 minutes later | `400 OTP_EXPIRED` on submit |
| User submits the wrong OTP | `400 INVALID_OTP` (no per-account lockout — see brute-force note above) |
| Two simultaneous reset-password calls win the OTP race | Mongoose's `__v` versioning catches the second commit; in practice the realistic scenario is "user double-clicked submit" and both attempts target the same password, so the outcome is correct either way |
| Password shorter than 8 chars | `422 VALIDATION_ERROR` (Mongoose schema rejection, mapped by `globalErrorHandler`) |
| Reset succeeds but `Session.deleteMany` fails mid-way | The whole transaction rolls back — password unchanged, OTP still valid, user retries the same call cleanly |
| User attempts to replay the same OTP twice | First call clears `user.otp`; second call sees `otpExpiresAt: undefined` → `400 OTP_EXPIRED` |

---

## 🔁 Replay Protection

Three independent layers of replay protection on a successful reset:

1. **`user.otp = undefined`** — the next verification call sees no OTP and falls through to `OTP_EXPIRED`.
2. **`user.otpExpiresAt = undefined`** — even if the hash were somehow preserved, `isOTPExpired(undefined)` returns `true`.
3. **`Session.deleteMany`** — every existing session is wiped, so any in-flight requests holding the old cookie hit the auth middleware's "no session" path on their next request.

All three are inside the same MongoDB transaction; if any one fails, none commit.

---

## 🧹 Database Mechanisms

The reset flow is intentionally read-modify-write on existing User fields. **No new schema fields, no new indexes, no migration.**

- The existing `select: false` on `otp` and `otpExpiresAt` keeps them out of every response by default. The reset service uses `.select("+otp +otpExpiresAt")` exactly once per call.
- `Session` documents continue to TTL out at 7 days (defined in `session.model.js`); `Session.deleteMany` is the explicit-removal counterpart.

---

## 🔀 Alternative: OAuth Users

OAuth-provisioned users (Google, GitHub) cannot reset a password because they don't have one. Both `forgotPassword` and `resetPassword` reject them with `PROVIDER_MISMATCH` after the verified-user lookup. The frontend should detect this code and surface a "Sign in with Google/GitHub" CTA instead of presenting the reset form.

See [`login-and-sessions.md`](./login-and-sessions.md) for the full OAuth flows, the shared service helper, and the identity-provider model.

---
