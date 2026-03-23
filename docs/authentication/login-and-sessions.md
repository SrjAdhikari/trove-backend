# Login and Session Management Architecture

This document outlines the architecture, data flow, and security mechanisms behind the Trove backend's User Login and device-tracking Session structure.

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
  2. **Security Edge Case:** Checks `if (!user.isVerified)`. This explicitly prevents malicious actors from registering a fake email address and logging in with a matching password during the 1-hour auto-deletion grace period.
  3. Validates the password using Mongoose's built-in `user.comparePassword(password)`.
  4. Counts the number of active sessions for this user in the database.
  5. **Max Devices Check:** If `activeSessionCount` exceeds `MAX_ALLOWED_DEVICES` (imported from `env.js`), the request is rejected with a `400 Bad Request` to prevent password sharing or unauthorized bot setups.
  6. Creates a `Session` document in MongoDB with the enriched `deviceInfo`.
  7. Returns the `session._id` back to the Controller.

---

## 🍪 Session Strategy

Unlike stateless JWTs, Trove uses an **Opaque Session ID Tracking System**.

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
