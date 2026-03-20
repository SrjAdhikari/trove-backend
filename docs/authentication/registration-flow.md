# Authentication & OTP Verification Flow

This document outlines the architecture, data flow, and edge cases handled by the Trove backend during the User Registration and OTP Verification process.

## 🏗️ Architecture

The authentication logic is separated into a clean Controller-Service architecture:

- **Controllers (`auth.controller.js`)**: Handles HTTP requests, ensures required fields are present, and formulates HTTP responses.
- **Auth Service (`auth.service.js`)**: Handles core business logic (user creation, directory initialization, edge cases).
- **OTP Service (`otp.service.js`)**: A lean, isolated utility class that purely handles cryptography, hashing, and email dispatching.

---

## 🛣️ API Endpoints

### 1. Request OTP (Registration)

- **Route:** `POST /api/auth/register`
- **Payload:** `{ name, email, password }`
- **Flow:**
  1. Validates inputs.
  2. Calls `createUser` in Auth Service.
  3. Checks if a fully verified user already exists (`USER_ALREADY_EXISTS`).
  4. Generates a 6-digit OTP using `crypto.randomInt` and hashes it securely via SHA-256.
  5. **Edge Case Handled:** If the user is unverified and trying to register again, it explicitly updates their `name`, `password`, and extends their `otpExpiresAt` without crashing.
  6. Sends the raw OTP to the provided email Address.

### 2. Verify OTP

- **Route:** `POST /api/auth/register/verify-otp`
- **Payload:** `{ email, otp }`
- **Flow:**
  1. Fetches the unverified user, specifically bypassing `select: false` using `.select('+otp +otpExpiresAt')`.
  2. Verifies the OTP hasn't expired (10-minute window).
  3. Uses `crypto.timingSafeEqual()` against Buffer equivalents to securely prevent Timing Attacks while comparing the input hash with the stored hash.
  4. **Atomic Transaction:** Opens a MongoDB session:
     - Creates the user's default `root-email` Directory.
     - Updates the user to `isVerified: true`.
     - Securely unsets the `otp`, `otpExpiresAt`, and `verificationExpiresAt` fields.
  5. If ANY step fails (e.g., Directory creation crashes), the entire process rolls back, preventing an orphaned directory or an improperly verified user.

### 3. Resend OTP

- **Route:** `POST /api/auth/register/resend-otp`
- **Payload:** `{ email }`
- **Flow:**
  1. Validates the unverified user exists.
  2. **Anti-Spam Cooldown:** Checks if `isOTPCooldownActive` is triggered (60-second limit). If triggered, throws an error to prevent the user from spamming the email service.
  3. Generates a fresh OTP and hash.
  4. Updates the user's `otpExpiresAt` to another 10 minutes.
  5. Sends the new OTP via email.

---

## 🧹 Database Mechanisms

### TTL Auto-Cleanup

To prevent the database from filling up with abandoned, unverified accounts:

- A `verificationExpiresAt` field is created during registration with a `1 hour` expiration limit.
- A Mongo TTL Index is attached to `verificationExpiresAt` (`expireAfterSeconds: 0`).
- If a user doesn't verify within 1 hour, MongoDB automatically deletes the user document.
- Upon successful verification, `$unset` removes the `verificationExpiresAt` field, permanently saving the user from auto-deletion.

### Security by Default (`select: false`)

Sensitive fields like `password`, `otp`, `otpExpiresAt`, and `verificationExpiresAt` are hard-coded in the Mongoose Schema with `select: false`.

- **Why?** This ensures that accidentally returning `User.findOne()` in a generic future endpoint will _never_ leak the password or OTP to the frontend.
- **How we override:** We use `.select('+otp')` internally within the `auth.service.js` only when we absolutely need to access them for verification.

---
