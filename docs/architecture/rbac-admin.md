# RBAC + Admin v1

> **Status:** Planned / in-progress. This document is the implementation reference for the RBAC + admin subsystem. After PR 2 merges, the "Implementation order" and any moot "Risks" entries should be trimmed and a short "Currently implemented" snapshot added so it matches the shape of `oauth-multi-provider.md` and `transaction-patterns.md`.

## Context

Trove currently has no concept of privileged users. Every authenticated request is treated identically and ownership is enforced per-resource via `{ _id, userId }` query filters in the service layer. There are no admin endpoints, no role field on `User`, and no audit log.

This subsystem introduces **Role-Based Access Control (RBAC)** with three roles (`user | admin | superadmin`) and the first set of admin endpoints needed to operate the platform: list users, view details, force-logout, suspend/unsuspend, change roles, soft- and hard-delete, and a system overview dashboard. An admin audit log is deliberately **not** part of v1; see "Out of scope" for the rationale.

The intent is to lay the **foundation** for future admin tooling cleanly — extending the role enum, adding new admin endpoints, or migrating to fine-grained permissions later should all be small follow-ups, not rewrites.

---

## Scope

**In scope (v1):**
- Role field on `User` with hierarchy: `superadmin > admin > user`
- Suspension state on `User` tracked via `suspendedAt` / `suspendedBy` timestamps (status is derived, not stored)
- 9 admin endpoints under `/api/admin/*`
- CLI seed script to create the first superadmin
- `authorize` middleware (role-aware) layered on top of existing `authenticate`
- `authenticate` middleware updated to reject suspended and soft-deleted users (`suspendedAt`/`deletedAt` checks); the populated `req.user` carries `role`/`suspendedAt`/`deletedAt` automatically
- Backfill of `role: 'user'`, `suspendedAt: null`, `deletedAt: null` on existing users (idempotent, runs from seed script)
- Atlas schema mirror documented as a manual deploy step

**Explicitly out of scope (deferred):**
- **Admin audit log (`AdminAuditLog` collection + `GET /admin/audit` endpoint + write call sites).** Deferred to a follow-up PR. Rationale: at single-admin scale the "who did what" trail collapses to "I did it." When a second admin is onboarded — or a compliance posture is needed — re-add as PR 3. The mutation handlers will need to be re-touched to wire in audit writes, but each touch is small.
- Fine-grained permissions array (revisit if multiple admin tiers ever need to be split)
- Rate limiting on admin routes (deferred globally)
- Zod validation (deferred globally)
- Overview time-series, charts, signup funnels — v1 is point-in-time counters only
- Email notifications to suspended/deleted users
- Cron sweeper for soft-deleted users → hard-delete after retention window

---

## Locked design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Role model | Single enum: `user / admin / superadmin` | Smallest model that fits the use case; permissions array can be retrofitted later in ~50 LOC. |
| Hierarchy | `superadmin > admin > user`. Higher passes lower role checks. | Industry-standard semantics. `requireRole('admin')` accepts both admin and superadmin. |
| Bootstrap | One-time CLI seed script: `npm run seed:superadmin -- --email=x@y.com` | SaaS-deploy pattern. Explicit, auditable, no runtime cost, idempotent. |
| Suspend semantics | Block new logins **and** revoke all active sessions immediately | Industry standard (Slack/Linear-style). Suspended user is fully locked out. |
| Self-action rules | Cannot suspend/demote/soft-delete/purge **self**. Force-logout self is allowed (harmless). | Prevents accidental self-lockout. |
| Last-superadmin guard | Demote / delete / purge that would leave zero superadmins → 403 | Prevents bricking the platform. |
| Hierarchy enforcement | Admins cannot act on other admins or superadmins; only superadmin can act on admins. Both can act on regular users. | Limits admin blast radius. |
| Hard-delete cascade | Wipe `User`, `File`, `Directory`, `Session` (DB) + physical disk files. | Irreversible by design — this is the only place admin-driven disk space is freed. |
| Code organization | `src/routes/admin/`, `src/controllers/admin/`, `src/services/admin/` | Mirrors existing layer discipline; isolates admin surface for future review/permission tightening. |

---

## Data model

### `User` schema additions (`src/models/user.model.js`)

```js
role: {
  type: String,
  enum: Object.values(ROLES),          // ['user', 'admin', 'superadmin']
  default: ROLES.USER,
  required: true,
  index: true,                          // queried in admin user list + last-superadmin guard
},
suspendedAt: {
  type: Date,
  default: null,
  index: true,                          // queried in authenticate (reject if suspended) + list filtering
},
suspendedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
deletedAt: {
  type: Date,
  default: null,
  index: true,                          // queried in authenticate (reject if deleted) + list filtering
},
```

**Status is derived, not stored.** A small helper in `src/utils/userStatus.js`:

```js
export const USER_STATUS = Object.freeze({
  ACTIVE:    'active',
  SUSPENDED: 'suspended',
  DELETED:   'deleted',
});

export const getUserStatus = (user) => {
  if (user.deletedAt)   return USER_STATUS.DELETED;
  if (user.suspendedAt) return USER_STATUS.SUSPENDED;
  return USER_STATUS.ACTIVE;
};
```

Single source of truth — the timestamps. Status is computed on the fly for API responses and filtering. There is no `status` field on the User schema; storing one would duplicate information already carried by `suspendedAt`/`deletedAt` and create a class of "field drifted out of sync with timestamp" bugs by construction.

> **All four new fields (`role`, `suspendedAt`, `suspendedBy`, `deletedAt`) are introduced in this work** — none exist today. The project's STACK.md declares `deletedAt` as the soft-delete convention, but no model in `src/models/` uses it yet. This change introduces it for User; File and Directory continue with their existing (hard-delete) behavior until a future soft-delete pass.

> **Atlas mirror required** per STACK.md — apply the same fields with matching validators in MongoDB Atlas after merge.

---

## File placement

| File | Path | Type | Purpose |
|---|---|---|---|
| Role constants | `src/constants/roles.js` | New | Frozen `ROLES` enum |
| User status helper | `src/utils/userStatus.js` | New | Exports `USER_STATUS` constants + `getUserStatus(user)` derived-status helper |
| Authorize middleware | `src/middlewares/authorize.middleware.js` | New | `requireRole(role)`, `requireSuperadmin()`, helpers for hierarchy + self-action checks |
| Auth middleware | `src/middlewares/auth.middleware.js` | Modified | Hydrate `role`/`suspendedAt`/`deletedAt`; reject suspended (`suspendedAt != null`) and deleted (`deletedAt != null`) accounts |
| User model | `src/models/user.model.js` | Modified | Add `role`, `suspendedAt`, `suspendedBy`, `deletedAt` |
| Admin user router | `src/routes/admin/user.routes.js` | New | Mounts user-related admin endpoints |
| Admin overview router | `src/routes/admin/overview.routes.js` | New | Mounts the system-overview endpoint |
| Admin index router | `src/routes/admin/index.js` | New | Mounts the two above under `/admin` |
| Root routes index | `src/routes/index.js` | Modified | Mount `/admin` router |
| Admin user controller | `src/controllers/admin/user.controller.js` | New | List/detail/suspend/unsuspend/role/logout-all/soft-delete/purge handlers |
| Admin overview controller | `src/controllers/admin/overview.controller.js` | New | Overview handler |
| Admin user service | `src/services/admin/user.service.js` | New | Business logic for user admin actions + cascades |
| Admin overview service | `src/services/admin/overview.service.js` | New | System-wide aggregations (counts, totals, recent-signup window) |
| Storage cleanup helper | (reuse existing if present, else `src/utils/storage.cleanup.js`) | Reuse / New | Wipes a user's physical files from disk during purge. Reuse whatever `file.service.js` uses for delete today; do not reinvent. |
| App error codes | `src/constants/appErrorCode.js` | Modified | Add `ACCOUNT_SUSPENDED`, `CANNOT_ACT_ON_SELF`, `CANNOT_ACT_ON_PEER`, `LAST_SUPERADMIN`, `INSUFFICIENT_ROLE`. `ACCESS_DENIED` already exists. |
| Seed script | `scripts/seed-superadmin.js` | New | CLI: backfill missing `role`/`suspendedAt`/`deletedAt` fields, then promote target user to superadmin |
| `package.json` | `package.json` | Modified | Add `"seed:superadmin": "node scripts/seed-superadmin.js"` |

---

## Endpoint specifications

All admin routes are mounted under `/api/admin`, require `authenticate` + `requireRole('admin')` (or `requireSuperadmin()` where noted). Suspended/soft-deleted users are rejected by `authenticate` before the role check fires.

### `GET /api/admin/users`
Paginated user list.
- **Query:** `page` (default 1), `limit` (default 20, max 100), `q` (search email/name, case-insensitive), `role` (filter), `status` (one of `active | suspended | deleted`), `includeDeleted` (default false — when true, the `deleted` status is included in results regardless of the `status` filter being absent).
- **Status filter maps to timestamp predicates:**
  - `status=active`    → `{ suspendedAt: null, deletedAt: null }`
  - `status=suspended` → `{ suspendedAt: { $ne: null }, deletedAt: null }`
  - `status=deleted`   → `{ deletedAt: { $ne: null } }`
- **Response:** `{ items: [...], pagination: { page, limit, total, totalPages } }`. Each item has a computed `status` field via `getUserStatus(user)`.
- Excludes `password`, `otp`, etc. (schema-level `select: false`).

### `GET /api/admin/users/:id`
Single user detail with computed fields: storage used (sum of `File.size` where `userId === :id`), file count, directory count, active session count, last login (from most recent `Session.createdAt`).

### `GET /api/admin/overview`

**Scope: system-wide, not per-user.** This is the "admin dashboard home" endpoint — point-in-time aggregates across the entire platform. Contrast with the two preceding endpoints:

| Endpoint | Scope | Answers... |
|---|---|---|
| `GET /admin/users` | All users (paginated) | "Show me everyone on the platform" |
| `GET /admin/users/:id` | One specific user | "Tell me everything about user X" |
| `GET /admin/overview` | **The whole system** | "How is the platform doing overall?" |

Each `users.*` count is computed from timestamps, not a stored status field:
```json
{
  "users":   { "total": N, "active": N, "suspended": N, "softDeleted": N,
               "byRole": { "user": N, "admin": N, "superadmin": N } },
  "storage": { "totalBytes": N, "totalFiles": N, "totalDirectories": N },
  "signups": { "last7d": N, "last30d": N },
  "sessions":{ "active": N }
}
```
- `users.active`      = `countDocuments({ suspendedAt: null, deletedAt: null })`
- `users.suspended`   = `countDocuments({ suspendedAt: { $ne: null }, deletedAt: null })`
- `users.softDeleted` = `countDocuments({ deletedAt: { $ne: null } })`

### `PATCH /api/admin/users/:id/role` — **superadmin only**
- **Body:** `{ role: 'user' | 'admin' | 'superadmin' }`.
- **Pre-checks:**
  1. Caller is superadmin
  2. Target is not the caller (no self-demote)
  3. If demoting current superadmin and they are the **last** superadmin → 403 `LAST_SUPERADMIN`
  4. Target is not soft-deleted
- **Side effects:** none beyond the role write. Role is read from `req.user.role` per request, so the change is effective on the next request without session revocation. (If a compromised-account scenario is suspected, the admin can additionally call force-logout — explicit and auditable.)

### `PATCH /api/admin/users/:id/suspend`
- **Pre-checks:** target is not self; caller role > target role (admin can't suspend admin/superadmin; superadmin can suspend admins); target is not already suspended (`suspendedAt == null`); target is not soft-deleted (`deletedAt == null`).
- **Side effects:** set `suspendedAt = now`, `suspendedBy = caller._id`; revoke all active sessions for target.

### `PATCH /api/admin/users/:id/unsuspend`
- **Pre-checks:** target is currently suspended (`suspendedAt != null`); caller role > target role; target is not soft-deleted.
- **Side effects:** clear `suspendedAt = null`, `suspendedBy = null`.

### `POST /api/admin/users/:id/logout`
Force-revoke every active session for the target. Lighter than suspend — user can log back in immediately.
- **Pre-checks:** target is self (always allowed — harmless), OR caller role **strictly greater than** target role. Admins **cannot** force-logout other admins (apply the strict hierarchy consistently); only superadmin can. Target must not be soft-deleted.
- **Side effects:** `Session.deleteMany({ userId: target._id })`.
- **Response:** `{ sessionsRevoked: N }`.

### `DELETE /api/admin/users/:id/soft-delete`
Soft delete. Sets `deletedAt`. Cascades to revoking sessions only (files/directories stay until hard-delete or restore).
- **Pre-checks:** target is not self; caller role > target role; target is not already soft-deleted; **last-superadmin guard** if target is superadmin.
- **Side effects:** set `deletedAt=now`; revoke all sessions.

### `DELETE /api/admin/users/:id/hard-delete`
Hard delete. Irreversible. Removes user + all their data from DB and disk.
- **Pre-checks:** same as soft delete + last-superadmin guard always applies.
- **Side effects (in this exact order):**
  1. **MongoDB transaction** (`session.withTransaction()` per STACK.md):
     - `Session.deleteMany({ userId })`
     - `File.deleteMany({ userId })`
     - `Directory.deleteMany({ userId })`
     - `User.deleteOne({ _id: userId })`
  2. **After commit:** delete the user's physical files from disk via the existing file-deletion utility used by `file.service.js`. If disk delete fails: log a warning, leave orphans for manual cleanup (DB is source of truth).
- **Response:** `{ filesDeleted, directoriesDeleted, bytesFreed }` (tallied during the transaction so the response itself gives the admin a confirmation of what was wiped).

---

## Middleware

### `authenticate` (modified, `src/middlewares/auth.middleware.js`)

The existing populate select string already strips `password`/`otp`/etc. and returns everything else, so `role`, `suspendedAt`, `suspendedBy`, and `deletedAt` will be on `req.user` automatically once the schema fields exist. No populate change needed.

After session/user lookup, add two guards before `next()`:
```js
if (session.userId.deletedAt) {
  clearAuthCookie(res);
  throw new AppError('Account no longer exists', UNAUTHORIZED, UNAUTHORIZED_ACCESS);
}
if (session.userId.suspendedAt) {
  clearAuthCookie(res);
  throw new AppError('Account is suspended', FORBIDDEN, ACCOUNT_SUSPENDED);
}
```

Order matters: `deletedAt` is checked first because a deleted user shouldn't get a "suspended" error even if both timestamps happen to be set (defensive — the mutation handlers shouldn't create that state, but the guard is order-stable anyway).

### `authorize` (new, `src/middlewares/authorize.middleware.js`)

Exports composable middleware factories:

```js
requireRole(minRole)            // 'user' | 'admin' | 'superadmin' — hierarchical
requireSuperadmin()             // shorthand for requireRole('superadmin')
```

**Why a numeric rank?** Comparing role strings directly to enforce a hierarchy is verbose and error-prone — every gate would have to enumerate which roles pass:

```js
// Without ranks (ugly, bug-prone):
if (req.user.role === 'admin' || req.user.role === 'superadmin') { ok }
```

With ranks, the hierarchy collapses to a single number comparison:

```js
const ROLE_RANK = { user: 1, admin: 2, superadmin: 3 };

export const requireRole = (minRole) => (req, res, next) => {
  const callerRank   = ROLE_RANK[req.user.role];
  const requiredRank = ROLE_RANK[minRole];

  if (callerRank < requiredRank) {
    throw new AppError(
      'Insufficient role',
      httpStatus.FORBIDDEN,
      appErrorCode.INSUFFICIENT_ROLE,
    );
  }
  next();
};
```

**How that plays out:**

| Route gate | user (1) | admin (2) | superadmin (3) |
|---|---|---|---|
| `requireRole('user')` — needs ≥ 1 | ✓ | ✓ | ✓ |
| `requireRole('admin')` — needs ≥ 2 | ✗ 403 | ✓ | ✓ |
| `requireRole('superadmin')` — needs ≥ 3 | ✗ 403 | ✗ 403 | ✓ |

The "higher rank passes lower checks" rule from the hierarchy decision falls out of `callerRank >= requiredRank` automatically — there's no per-route enumeration of which roles are allowed.

**Failure response.** When `requireRole` throws, Express 5 catches the rejected promise and routes to `globalErrorHandler`, which produces HTTP 403 with the standard envelope:

```json
{
  "success": false,
  "error": "Insufficient role",
  "errorCode": "INSUFFICIENT_ROLE"
}
```

**The same rank trick is reused in the service layer** for "can act on" checks. For example, the suspend handler in `admin/user.service.js`:

```js
if (ROLE_RANK[caller.role] <= ROLE_RANK[target.role]) {
  throw new AppError(
    'Cannot act on a peer or higher',
    httpStatus.FORBIDDEN,
    appErrorCode.CANNOT_ACT_ON_PEER,
  );
}
```

- admin (2) trying to suspend admin (2) → `2 <= 2` is true → 403 (peers can't act on each other)
- superadmin (3) trying to suspend admin (2) → `3 <= 2` is false → proceed

Strict `>` (not `≥`) because acting *on* a peer is disallowed, per the strict-hierarchy decision.

**Hierarchy + self-action checks** (`canActOn`, `assertLastSuperadminInvariant`) live in `src/services/admin/user.service.js` rather than middleware — they need DB lookups (target role + superadmin count) and belong in the service layer per the project's layer-discipline rule.

---

## Bootstrap procedure (CLI seed script)

`scripts/seed-superadmin.js`:

1. Load env, connect to MongoDB.
2. **Backfill** the new fields on existing users (idempotent — `$exists: false` only matches docs missing the field):
   - `User.updateMany({ role:        { $exists: false } }, { $set: { role:        'user' } })`
   - `User.updateMany({ suspendedAt: { $exists: false } }, { $set: { suspendedAt: null   } })`
   - `User.updateMany({ deletedAt:   { $exists: false } }, { $set: { deletedAt:   null   } })`
3. Read `--email` arg. Find verified user with that email. Reject if not found or not verified.
4. If already superadmin → log and exit 0 (idempotent).
5. Promote: `user.role = 'superadmin'; await user.save()`.
6. Print: `"Promoted alice@example.com to superadmin."`
7. Exit 0.

**Usage:** `npm run seed:superadmin -- --email=admin@example.com`

Document this in README under a new "First Deploy" section.

---

## Implementation order — split into two PRs sharing this feature branch

Both PRs target `develop`. Branch: `feat/rbac-admin-v1`.

### PR 1 — Foundation + reads
1. `roles.js`, `appErrorCode.js` additions.
2. `User` schema: `role`, `suspendedAt`, `suspendedBy`, `deletedAt`. Plus `src/utils/userStatus.js` (the derived-status helper).
3. `authorize.middleware.js`.
4. `authenticate.middleware.js` updates (suspended + deleted guards).
5. `scripts/seed-superadmin.js` + `package.json` script.
6. Read endpoints: `GET /admin/users`, `GET /admin/users/:id`, `GET /admin/overview`.
7. Atlas mirror applied manually.
8. Run seed script in dev → verify first superadmin can hit read endpoints.

### PR 2 — Mutations
1. `PATCH /admin/users/:id/role` (with last-superadmin guard).
2. `PATCH /admin/users/:id/suspend`, `unsuspend`.
3. `POST /admin/users/:id/logout`.
4. `DELETE /admin/users/:id/soft-delete` (soft).
5. `DELETE /admin/users/:id/hard-delete` (transaction + disk cleanup).

---

## Critical files to read before implementing

- `src/middlewares/auth.middleware.js` — pattern to extend (populate + guards)
- `src/models/user.model.js` — schema style, hooks, `select: false` pattern
- `src/models/session.model.js` — Session TTL + userId ref
- `src/services/file.service.js` — existing disk-deletion logic to **reuse** in purge cascade (do not reinvent)
- `src/services/auth.service.js` — example of `session.withTransaction()` usage and `AppError` throwing
- `src/errors/AppError.js` — constructor signature `(message, statusCode, code)`
- `src/constants/httpStatus.js` + `src/constants/appErrorCode.js` — naming conventions
- `src/routes/auth.routes.js` — middleware composition style (`router.use(authenticate)` vs per-route)
- `docs/architecture/transaction-patterns.md` — required reading before writing the purge transaction
- `.claude/STACK.md` — Known Constraints (Atlas mirror, soft-delete default, transaction rule)

---

## Verification

### After PR 1
- `npm test` (or whatever runs the existing suite) passes.
- Run seed script: `npm run seed:superadmin -- --email=<your-verified-email>`. Verify console output and DB role=superadmin.
- Boot server. As the superadmin, hit:
  - `GET /api/admin/users?page=1&limit=20` → paginated list, role field visible.
  - `GET /api/admin/users/<some-id>` → detail with storage/file/session counts.
  - `GET /api/admin/overview` → counters return valid shape.
- As a regular user, hit `GET /api/admin/users` → 403 `INSUFFICIENT_ROLE`.
- Manually set a user's `suspendedAt = ISODate('2026-01-01T00:00:00Z')` in Atlas, then try to log in or use a session → 403 `ACCOUNT_SUSPENDED`, cookie cleared.

### After PR 2
- Promote a second user to admin via `PATCH /admin/users/:id/role` → confirm role updated, next request from that user reaches admin routes.
- Suspend a user → confirm `suspendedAt` set, sessions revoked, login blocked.
- Force-logout a user → confirm sessions count returned matches DB.
- Soft-delete a user → confirm `deletedAt` set, login blocked; files still on disk.
- Hard-delete a user with at least 1 file + 1 directory → confirm User/File/Directory/Session docs gone, disk files gone, response payload tallies match.
- Try to demote the only superadmin → 403 `LAST_SUPERADMIN`.
- Try to suspend self → 403 `CANNOT_ACT_ON_SELF`.
- As admin (not superadmin), try to suspend another admin → 403 `CANNOT_ACT_ON_PEER`.

### Smoke test the regression surface
- Existing auth flows (login, logout, OAuth, /me) still work — `authenticate` middleware changes shouldn't break them.
- Existing file/directory CRUD for regular users unaffected — admin code is fully additive.

---

## Post-merge housekeeping

- Apply Atlas schema mirror manually for `User.role`, `User.suspendedAt`, `User.suspendedBy`, `User.deletedAt`.
- Document the seed script invocation in `README.md` under a new "First Deploy" or "Bootstrapping Admin" section.
- Consider an ADR under `docs/adr/` recording the role-vs-permissions choice and last-superadmin guard for future engineers (optional but recommended).

---
