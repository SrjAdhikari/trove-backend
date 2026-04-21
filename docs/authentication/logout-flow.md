# Logout & Session Destruction Flow

This document outlines the architecture and execution logic for securely terminating active sessions across both single devices (standard logout) and globally across all authenticated devices (force disconnect).

> **Provider-agnostic scope:** Both endpoints operate on the `Session` document, not on the user's identity provider. Sessions issued via email/password login and via Google OAuth are indistinguishable at this layer — the `token` cookie holds an opaque session ID regardless of how the session was originally issued.

---

## 🛣️ API Endpoints

### 1. Standard Single-Device Logout

- **Route:** `POST /api/auth/logout`
- **Payload:** None (Requires signed HTTP-only `token` cookie)
- **Flow:**
  1. Validates and unpacks the signed token from `req.signedCookies.token`.
  2. Calls `logoutUser` in Auth Service.
  3. Executes `Session.deleteOne({ _id: sessionId })` to mathematically purge that specific session from MongoDB. (Silently completes even if the session naturally expired).
  4. Controller executes `res.clearCookie("token")` to wipe the cookie out of the user's active browser storage.
  5. Returns HTTP `200 OK` success response.

### 2. Global "Logout Everywhere"

- **Route:** `POST /api/auth/logout-all`
- **Payload:** None (Requires authenticated `req.user` via upstream Auth Middleware)
- **Flow:**
  1. Parses the authenticated user's ID (`req.user._id`).
  2. Calls `logoutAllUser` in Auth Service.
  3. Executes `Session.deleteMany({ userId })` to instantly terminate all tracking tokens globally.
  4. Controller executes `res.clearCookie("token")` to log out the current device alongside the database wipe.
  5. **Global Effect:** All other 3rd-party devices (tablets, old laptops, etc) will immediately fail verification checks on their next API request and be securely booted back to the login screen.

---

## 🛡️ Security Mechanisms

### CSRF Protection (Strictly POST)

Browsers are inherently susceptible to CSRF (Cross-Site Request Forgery) attacks where a malicious `<img src="https://api.trovecloud.com/logout" />` tag could silently log a user out of their account simply by visiting a malicious blog.

- Both logout actions are restricted natively to exactly HTTP **POST**.
- Browsers do not execute HTTP `POST` requests blindly via `href` or `img-src` elements.
- This creates a highly secure, intentional log out vector protecting users from annoyance-based DoS (Denial of Service) attacks.

---
