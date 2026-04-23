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
  3. **Shared OAuth flow.** Delegates the rest of the work (user lookup, provider guard, profile refresh, session issuance) to `loginOrCreateOAuthUser` in `src/services/oauth.service.js` — the provider-agnostic helper shared with the GitHub path. See section 7 below for that flow.

---

### 5. GitHub OAuth Login

- **Route:** `POST /api/auth/github`
- **Payload:** `{ code }` — GitHub OAuth authorization code delivered to the frontend's callback URL after the user approves access on github.com.
- **Flow:**
  1. Validates that `code` is present (rejects with `400 INVALID_GITHUB_CODE` otherwise).
  2. Builds the `deviceInfo` object using the shared `buildDeviceInfo(req)` helper.
  3. Calls `loginOrCreateGithubUser(code, deviceInfo)` in Auth Service.
  4. Sets the same `httpOnly` session cookie as the password and Google paths.
  5. Returns `201 Created` when the call provisioned a brand-new account, `200 OK` when an existing GitHub user was logged in.

### 6. Service Logic (`loginOrCreateGithubUser`)

- **Flow:**
  1. **Code exchange + profile fetch.** Delegates to `verifyGithubCodeAndFetchProfile` in `src/lib/githubAuth.js`, which performs the three-step GitHub handshake using native `fetch`:
     - `POST https://github.com/login/oauth/access_token` with `client_id`, `client_secret`, and the user's `code` to receive an access token.
     - `GET https://api.github.com/user` to fetch the profile (name, login, avatar_url).
     - `GET https://api.github.com/user/emails` to locate the primary + verified email. GitHub's `/user` may return `email: null` when the user has hidden their address publicly, so `/user/emails` is the authoritative source.
  2. **Hardening on every outbound call.** All three requests carry an 8-second `AbortSignal.timeout` (so a slow GitHub can't hang a request slot) and an explicit `User-Agent: TroveCloud` header (GitHub's API mandates a UA). On any non-2xx response or a network/JSON failure, the call throws `400 INVALID_GITHUB_CODE`. In development the underlying fetch error is `console.error`'d for ops visibility — distinguishes real GitHub outages from genuinely bad codes. Semantic AppErrors (e.g. `GITHUB_EMAIL_NOT_VERIFIED`) pass through the outer catch untouched.
  3. **Verified-email gate.** If no entry in `/user/emails` is both `primary: true` and `verified: true`, rejects with `400 GITHUB_EMAIL_NOT_VERIFIED`. Protects against GitHub accounts that have no verifiable email.
  4. **Normalization.** Returns `{ name: userData.name || userData.login, email, picture: userData.avatar_url }` — display names are nullable on GitHub, so the username is the fallback.
  5. **Shared OAuth flow.** Delegates the rest to `loginOrCreateOAuthUser` — same helper as the Google path.

### 7. Shared Service Logic (`loginOrCreateOAuthUser`)

Lives in `src/services/oauth.service.js`. Takes a provider name (`"google"` or `"github"`) and a normalized profile (`{ name, email, picture }`) and runs the find-or-create + session flow that's identical across providers.

- **User lookup.** Fetches the existing user by `email` using `.lean()`.
- **Existing user path:**
  - **Account-takeover guard.** If `existingUser.provider !== provider` — i.e., the email is already registered via password or a different OAuth provider — rejects with `409 PROVIDER_MISMATCH`. This is the hardest edge case in multi-provider auth: without this check, anyone holding a provider identity tied to Alice's email could silently take over Alice's password-registered account.
  - **Profile refresh.** Provider display names and avatars change over time; we keep our denormalized copy in sync by comparing the payload's `name`/`picture` against the stored values and issuing a single `User.updateOne` (with `runValidators: true`) only when something changed. The common no-op case skips the write entirely.
  - **Max devices.** Delegated to `enforceDeviceLimit(userId)` in `src/services/session.service.js` — evicts the oldest session when `MAX_ALLOWED_DEVICES` is already reached, using `findOneAndDelete` scoped by `userId` and sorted by `createdAt` ascending. Same helper the password `loginUser` path uses.
  - Creates a `Session` and returns `{ session, isNewUser: false }`.
- **New user path:**
  - Opens a MongoDB transaction that atomically creates the `User` (with the correct `provider`, `isVerified: true`, no password, `profilePicture` from the payload) and their default root `Directory`. If either write fails, both roll back — no orphaned directory or half-provisioned user.
  - **Session creation happens _outside_ the transaction.** `withTransaction` automatically retries on write conflicts; if we created the session inside, a retry would produce duplicate session documents. A session-creation failure after the user/directory commit is recoverable by simply re-calling the endpoint.
  - Returns `{ session, isNewUser: true }`.

---

## 🪪 Identity Providers

TroveCloud tracks the sign-in method on each user via `User.provider`:

| Value      | Meaning                                                                            |
| ---------- | ---------------------------------------------------------------------------------- |
| `"email"`  | Registered with email + password, verified via OTP.                                |
| `"google"` | Registered via Google OAuth. No stored password; `isVerified: true` from creation. |
| `"github"` | Registered via GitHub OAuth. No stored password; `isVerified: true` from creation. |

**`provider` cannot be changed after creation.** Enforced by an async pre-save hook in `user.model.js` that uses `this.isDirectModified("provider")` to reject any explicit code path trying to assign a new value on an existing document. This prevents a bug or stray update from flipping an account between providers — which would either permanently lock the user out (e.g. Google → email without a password) or bypass authentication entirely (e.g. email → google without password re-verification). The schema-level `immutable: true` flag isn't used because Mongoose 9's `applyDefaults` runs that check during document construction in `findOne` and invalidates cleanly-loaded docs under `strict: "throw"`; the pre-save hook sidesteps that construction-time bug while preserving the same security invariant.

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
