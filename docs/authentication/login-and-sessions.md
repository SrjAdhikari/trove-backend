# Login and Session Management Architecture

This document outlines the architecture, data flow, and security mechanisms behind the TroveCloud backend's User Login and device-tracking Session structure.

---

## 🏗️ Architecture

The login logic uses the standard Controller-Service pattern but introduces complex header parsing in the controller to abstract "internet traffic" logic away from the pure database layer.

- **Controller (`auth.controller.js`)**: Parses raw HTTP Headers (like `User-Agent` and IP Address) to build a structured `deviceInfo` object.
- **Service (`auth.service.js`)**: Validates credentials using `bcrypt` and handles MongoDB `Session` document creation while enforcing concurrency limits.
- **Utility (`cookies.js`)**: Isolated wrapper to strictly enforce configuration rules (like `httpOnly` and `SameSite`) when issuing Session cookies.

---

## 🛣️ API Endpoints

### 1. User Login

- **Route:** `POST /api/auth/login`
- **Payload:** `{ email, password }`
- **Flow:**
  1. Validates that `email` and `password` are present.
  2. Extracts the `User-Agent` string and raw IP from the inbound `req.headers`.
  3. Uses `ua-parser-js` to mathematically break down the messy User-Agent string into a clean `deviceInfo` object (containing `deviceOS`, `browser`, `ipAddress`, etc.).
  4. Calls the `loginUser` service, passing the `deviceInfo` object.

### 2. Service Logic (`loginUser`)

- **Flow:**
  1. Queries MongoDB. Note: Because `password` has `select: false` in the schema for security, the service explicitly adds an "additive query" (`.select('+password')`) so bcrypt can compare the hashes.
  2. **Provider Guard:** Checks `if (user.provider !== "email")`. OAuth-provisioned users (e.g., Google) have no stored password — without this guard, `bcrypt.compare` would throw against an undefined hash. Rejects with `400 PROVIDER_MISMATCH` telling the user to sign in via their OAuth provider instead.
  3. **Security Edge Case:** Checks `if (!user.isVerified)`. This explicitly prevents malicious actors from registering a fake email address and logging in with a matching password during the 1-hour auto-deletion grace period.
  4. Validates the password using Mongoose's built-in `user.comparePassword(password)`.
  5. Counts the number of active sessions for this user in the database.
  6. **Max Devices Check:** If `activeSessionCount` exceeds `MAX_ALLOWED_DEVICES` (imported from `env.js`), the oldest session is evicted to keep concurrent-device counts bounded.
  7. Creates a `Session` document in MongoDB with the enriched `deviceInfo`.
  8. Returns the `session._id` back to the Controller.

---

### 3. Google OAuth Login

- **Route:** `POST /api/auth/google`
- **Payload:** `{ idToken }` — Google ID token obtained from the frontend's Google Sign-In button (credentials response).
- **Flow:**
  1. Validates that `idToken` is present (rejects with `400 INVALID_ID_TOKEN` otherwise).
  2. Builds the `deviceInfo` object using the shared `buildDeviceInfo(req)` helper — the same helper used by the password login path, extracted to `src/utils/deviceInfo.js`.
  3. Calls `loginOrCreateGoogleUser(idToken, deviceInfo)` in Auth Service.
  4. Sets the same `httpOnly` session cookie as the password path.
  5. Returns `201 Created` when the call provisioned a brand-new account, `200 OK` when an existing Google user was logged in.

### 4. Service Logic (`loginOrCreateGoogleUser`)

- **Flow:**
  1. **Token verification.** Delegates to `verifyGoogleIdToken` in `src/lib/googleAuth.js`, which wraps the official `google-auth-library` `OAuth2Client`. The audience is pinned to `GOOGLE_CLIENT_ID` so tokens minted for other apps are rejected. Any failure — malformed token, bad signature, wrong audience, expired, Google network outage — surfaces as `400 INVALID_ID_TOKEN`. In development the underlying library error is `console.error`'d so real outages are distinguishable from malformed client tokens.
  2. **Verified-email gate.** Inspects `payload.email_verified`. Rejects with `400 GOOGLE_EMAIL_NOT_VERIFIED` when Google itself has not verified the address (possible for some Workspace accounts). This prevents a domain admin from asserting arbitrary emails they don't own.
  3. **User lookup.** Fetches the existing user by `email` using `.lean()`.
  4. **Existing user path:**
     - **Account-takeover guard.** If `existingUser.provider !== "google"` — i.e., the email is already registered via password (or a different OAuth provider) — rejects with `409 PROVIDER_MISMATCH`. This is the hardest edge case in multi-provider auth: without this check, anyone holding a Google identity tied to Alice's email could silently take over Alice's password-registered account.
     - **Profile refresh.** Google display names and avatars change over time; we keep our denormalized copy in sync by comparing the payload's `name`/`picture` against the stored values and issuing a single `User.updateOne` only when something changed. The common no-op case skips the write entirely.
     - **Max devices.** Same logic as `loginUser` — evicts the oldest session when `MAX_ALLOWED_DEVICES` is already reached, using `findOneAndDelete` scoped by `userId` and sorted by `createdAt` ascending.
     - Creates a `Session` and returns `{ session, isNewUser: false }`.
  5. **New user path:**
     - Opens a MongoDB transaction that atomically creates the `User` (with `provider: "google"`, `isVerified: true`, no password, `profilePicture` from the Google payload) and their default root `Directory`. If either write fails, both roll back — no orphaned directory or half-provisioned user.
     - **Session creation happens _outside_ the transaction.** `withTransaction` automatically retries on write conflicts; if we created the session inside, a retry would produce duplicate session documents. A session-creation failure after the user/directory commit is recoverable by simply re-calling the endpoint.
     - Returns `{ session, isNewUser: true }`.

---

## 🪪 Identity Providers

TroveCloud tracks the sign-in method on each user via `User.provider`:

| Value      | Meaning                                                                            |
| ---------- | ---------------------------------------------------------------------------------- |
| `"email"`  | Registered with email + password, verified via OTP.                                |
| `"google"` | Registered via Google OAuth. No stored password; `isVerified: true` from creation. |
| `"github"` | Enum value reserved for future GitHub OAuth. No endpoint yet.                      |

**`provider` is immutable.** Once set at user creation it cannot be changed (`immutable: true` at the schema level). This prevents a bug or stray update from flipping an account between providers — which would either permanently lock the user out (Google → email without a password) or bypass authentication entirely (email → google without password re-verification).

**`password` is conditionally required.** The Mongoose schema declares `password: { required: function () { return this.provider === "email"; } }` — password is enforced for email signups and deliberately omitted for OAuth users. The Atlas `$jsonSchema` is intentionally lenient here (doesn't encode the conditional) — Mongoose catches all API-driven writes, and the asymmetry is documented.

---

## 🍪 Session Strategy

Unlike stateless JWTs, TroveCloud uses an **Opaque Session ID Tracking System**.

### Why Database Sessions instead of JWTs?

- **Revocation:** JWTs cannot be easily revoked before they expire. By storing Sessions in MongoDB, we can instantly kick a user out of their account remotely by querying `Session.deleteOne()`.
- **Max Device Caps:** MongoDB tracking explicitly powers the `MAX_ALLOWED_DEVICES` metric. This is impossible to track accurately with stateless, disconnected JWTs.

### Cookie Security

When the backend successfully verifies the password, it tells Express to attach a hardened cookie to the HTTP response using `res.cookie('token', sessionId)`:

- `httpOnly: true`: The cookie is mathematically invisible to JavaScript on the frontend. This prevents XSS (Cross-Site Scripting) attacks from stealing the token.
- `secure: true`: Enforced exclusively in production environments to ensure the cookie never transmits over an unencrypted HTTP connection.
- `maxAge`: Tied functionally to the uniform `SEVEN_DAYS_MS` runtime constant to maintain global consistency.
- `sameSite: "lax"`: Protects against heavy CSRF attacks while allowing top-level navigation to still securely boot the app.

---

## 🧹 Database Auto-Cleanup

- The `Session` schema assigns an `expiresAt` parameter (defaulting to 7 days).
- A MongoDB **TTL Index** is attached to this `expiresAt` field (`{ expireAfterSeconds: 0 }`).
- As soon as a user's cookie dies mathematically, MongoDB automatically detects the expired timestamp and permanently wipes the Session document from the database, preventing DB bloat without writing cron-jobs.

---
