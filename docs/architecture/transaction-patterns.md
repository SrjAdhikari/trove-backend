# Transaction Patterns

> **Status:** As-built (2026-06-14). Documents the MongoDB transaction usage adopted in PRs #11 (Google OAuth), #14 (shared OAuth helper), #25 (password reset), #33 (admin suspend / soft-delete / hard-delete), #62 (denormalized folder-size maintenance), #66 (per-user storage-quota check on upload), and #69 (recursive folder-count maintenance + helper rename). Used in `verifyOTP` since the original auth implementation.

Captures a subtle pattern that recurs across the codebase: when a flow needs to **atomically commit two or more cross-document writes** (User + Directory creation, User update + Session wipe, multi-collection user purge, a file write + its ancestor folder-counter updates), the database writes happen inside a `withTransaction` block. Where a flow also issues a `Session`, that **`Session.create` happens outside the transaction**. Where a flow also performs non-idempotent side effects on disk, **those happen outside the transaction too**. This document explains why, and what to do if a new call site needs the same shape.

---

## 🏗️ The Pattern

```js
const mongooseSession = await mongoose.startSession();
const rootDirId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();

try {
	await mongooseSession.withTransaction(async () => {
		await User.create([{ _id: userId /* ... */ }], {
			session: mongooseSession,
		});
		await Directory.create(
			[{ _id: rootDirId, name: `root-${email}`, userId, parentDirId: null }],
			{ session: mongooseSession },
		);
	});
} finally {
	await mongooseSession.endSession();
}

// Session.create runs OUTSIDE the transaction
const session = await Session.create({ userId, deviceInfo });
```

Two important shapes here:

1. **IDs generated up front.** `userId` and `rootDirId` are `new mongoose.Types.ObjectId()` calls _before_ the transaction opens, so they're available for the cross-document references (`User.rootDirId` → `Directory._id`, `Directory.userId` → `User._id`) at insert time. No round trip to discover an inserted ID.
2. **Session.create is outside the transaction.** This is the non-obvious part — see the next section.

---

## 🧭 Why Session.create is Outside

Mongoose's `withTransaction` automatically retries the callback on **transient transaction errors** — typically `WriteConflict` errors when two transactions touched the same documents concurrently. The retry behavior is unconditional and silent: if a conflict happens, the entire callback runs again from the top, and the previous attempt's writes (which were rolled back) are repeated.

If `Session.create` were inside the transaction:

- A retry would run `Session.create({ userId, deviceInfo })` a second time.
- Even though Session.create itself doesn't conflict (each session is a fresh document), the retry would create **two session documents** for one sign-in attempt.
- The user's cookie would only point to the second session; the first would be orphaned, never cleaned up except by the natural TTL.

Putting `Session.create` after `withTransaction` returns guarantees it runs exactly once per sign-in, regardless of how many times the User+Directory transaction had to retry.

The User and Directory writes inside the transaction are safe to retry because:

- Both inserts use **explicit IDs we generated**. A retry uses the same IDs. The second attempt either finds the documents already there (because the previous attempt actually committed before rollback) — which would error and abort the retry cleanly — or successfully inserts them.
- Mongoose's transaction wrapper handles the rollback semantics; if the callback throws on retry, the transaction aborts cleanly.

---

## 🔄 The Flow

### Happy path

1. Generate `userId` and (where applicable) `rootDirId`.
2. Open `withTransaction`.
3. Insert User (with the generated `_id`, plus `rootDirId` reference).
4. Insert Directory (with the generated `_id`, plus `userId` reference).
5. Transaction commits. Both documents are now persisted atomically.
6. Outside the transaction, create the Session.
7. Return `{ session, isNewUser: true }` to the caller.

### Failure modes

| Where it fails                                          | What rolls back                                                           | What persists                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| User.create throws                                      | Nothing was committed; rollback is automatic (transaction aborts)         | Nothing                                                     |
| Directory.create throws after User.create               | User insert is rolled back (still inside the transaction)                 | Nothing                                                     |
| Transaction commit succeeds, then Session.create throws | Nothing rolls back — User + Directory are persisted, no Session exists    | User + Directory; user has an account but no active session |
| Network blip during transaction                         | `withTransaction` retries automatically; if retries are exhausted, throws | Same as "transaction commit fails" — nothing                |

The "transaction commits, Session.create fails" case is the only one with **partial success**. It's recoverable — the user can simply re-attempt sign-in, hit the existing-user path of `loginOrCreateOAuthUser`, and get a session for the already-provisioned account. Acceptable trade-off.

---

## 📍 Where It's Used

Call sites in the codebase (as of 2026-06-13):

### 1. `verifyOTP` in `src/services/auth.service.js`

When an unverified email-password user enters the correct OTP, the verification flips `isVerified: true` AND creates the user's root Directory in one transaction. Pattern is identical except: the User already exists (it's being mutated, not inserted), so `user.save({ session })` is used instead of `User.create([...], { session })`. The Session is not created in this flow at all — verification is separate from login.

### 2. `loginOrCreateOAuthUser` in `src/services/oauth.service.js` (new-user branch)

When a Google or GitHub OAuth sign-in is the user's first interaction, both User and Directory are inserted via the pattern above. Then Session.create runs outside. Used for both providers via the shared helper.

### 3. `resetPassword` in `src/services/auth.service.js`

When a user submits a valid reset OTP, the password is updated AND every active session is wiped in one transaction:

```js
const session = await mongoose.startSession();
try {
    await session.withTransaction(async () => {
        user.password = newPassword;
        user.otp = undefined;
        user.otpExpiresAt = undefined;
        await user.save({ session });
        await Session.deleteMany({ userId: user._id }, { session });
    });
} finally {
    await session.endSession();
}
```

If `Session.deleteMany` fails after `user.save`, the whole thing rolls back — the password change is reverted and the OTP fields stay populated, so the user can retry the same call cleanly with the same code. Without the transaction, a partial failure would leave the password updated but old sessions alive and the OTP consumed — a worse recovery story for the user. See PR #25 for the design discussion.

### 4. `suspendUser` in `src/services/admin/user.service.js`

Setting `suspendedAt = now` and revoking every active session for the target need to land together — a half-applied suspension where the timestamp is set but the user's existing sessions stay alive would leave the locked-out user temporarily able to use the app until those sessions expire on their own. Same shape as `resetPassword`: `user.save({ session })` plus `Session.deleteMany({ userId }, { session })`. Shipped in PR #33.

### 5. `softDeleteUser` in `src/services/admin/user.service.js`

Mirror image of suspend: set `deletedAt = now` and `Session.deleteMany` for the target in one transaction. Files and directories deliberately stay until hard-delete or restore.

### 6. `hardDeleteUser` in `src/services/admin/user.service.js`

The widest transaction in the codebase — a four-collection wipe (`Session.deleteMany` → `File.deleteMany` → `Directory.deleteMany` → `User.deleteOne`) all keyed by `userId`. Inside the same transaction, a pre-read `File.find(..., '_id extension')` snapshots the list of physical files to remove; that list is captured into a closure variable.

**Physical-file cleanup happens outside the transaction** via `Promise.allSettled(filesToWipe.map(file => rm(...)))`. Same reasoning as Session.create being outside: `rm` is a non-idempotent side effect against the filesystem, and `withTransaction`'s automatic retries would re-issue the deletes on a `WriteConflict`. `allSettled` ensures one disk failure doesn't stop the other deletes from running; rejected promises are warn-logged but never re-thrown — the DB is the source of truth and orphaned bytes are reconcilable later. Shipped in PR #33.

### 7. Folder-stats maintenance in `src/services/file.service.js` and `src/services/directory.service.js`

Shipped in PR #62 (folder count added in PR #69). Every directory stores denormalized `size`/`fileCount`/`folderCount` for its whole subtree, kept correct on each write inside a transaction. The shared primitive is `updateAncestorDirectoryStats(startDirId, { bytes, files, folders }, session)` in `directory.service.js` (renamed from `adjustAncestorStats` in PR #69), which walks the `parentDirId` chain to the root and `$inc`s each ancestor:

- **`uploadFile`** mints the file `_id` up front, streams the bytes to disk **outside** the transaction (a non-retryable side effect — on stream failure the partial file is `rm`'d and no DB row was created yet), then inside the transaction does `File.create([{ _id, size, ... }], { session })` plus `updateAncestorDirectoryStats(parentDirId, { bytes, files: 1 }, session)`. Retry-safe for the same reason as the User+Directory pattern: the fixed `_id` and the constant delta re-apply cleanly after a `WriteConflict` rollback.
- **`deleteFile`** does `File.deleteOne({ _id, userId }, { session })` plus the inverse `updateAncestorDirectoryStats(parentDirId, { bytes: -size, files: -1 }, session)` inside the transaction; the physical `rm` happens **after** commit (DB is the source of truth — same "side effects outside" rule).
- **`deleteDirectory`**'s existing delete transaction gained one more in-transaction step: `updateAncestorDirectoryStats(rootDir.parentDirId, { bytes: -rootDir.size, files: -rootDir.fileCount, folders: -allDirIds.length }, session)`, subtracting the deleted subtree's stored totals (bytes, file count, and folder count) from every ancestor above it.
- **`createDirectory`** (PR #69) became transactional: it inserts the new folder with `Directory.create([{ ... }], { session })` and pairs it with `updateAncestorDirectoryStats(parentDirId, { folders: 1 }, session)`, bumping every ancestor's `folderCount`. The walk starts at the parent, so the new folder's own `folderCount` stays at the schema default `0`. It does no disk I/O, so nothing sits outside the transaction.

`updateAncestorDirectoryStats` is intentionally **not** `userId`-scoped: every `parentDirId` points to a same-user directory by construction (`createDirectory` verifies ownership before linking; there is no move/re-parent feature), so the ancestor walk cannot cross tenants.

The call sites are **structurally similar but not identical**. `verifyOTP`, `resetPassword`, `suspendUser`, and `softDeleteUser` all mutate an existing user; OAuth new-user creates a fresh one; `hardDeleteUser` is the multi-collection variant that also performs irreversible disk work outside the transaction; the PR #62 folder-size sites pair a single `File` write/delete with a multi-document `$inc` across the ancestor chain, again keeping disk I/O (stream-before / `rm`-after) outside. The "Session.create outside" and "filesystem cleanup outside" rules are the same principle — anything that isn't safely retry-able stays out. A premature abstraction extracting them into a single helper would have to branch on "create vs update", "single vs cross-collection", and "with vs without external side effects" inside, which is exactly the kind of false-DRY that makes code worse. The pattern is documented; the call sites stay separate.

---

## ⚙️ Mongoose Mechanics

A few details worth knowing if you're new to MongoDB transactions in Mongoose:

- **`withTransaction` requires a replica set.** MongoDB transactions only work against a replica-set deployment, not a standalone `mongod`. Atlas clusters (free or paid) are replica sets by default. Local development typically uses `mongodb://localhost:27017/...` against a standalone — that will throw on transaction calls. Solution: Atlas (recommended) or a local replica set via `mongodb-memory-server-replica-set` for tests.
- **`{ session }` option must be passed to every operation inside the transaction.** Mongoose does not infer it from the surrounding `withTransaction` callback. Forgetting to pass `{ session }` on a `User.create` or `Directory.create` means that write **does not participate in the transaction** — it commits independently and is not rolled back if the rest of the transaction fails. Subtle and dangerous; double-check on review.
- **Use `.create([...], { session })` (array form), not `.create({...}, { session })`.** Mongoose's `Model.create` has two signatures: `create(docs, options)` where `docs` is an array, or `create(doc, callback)` for backwards compat. Passing `{ session }` as the second argument to a single-doc `create` works in some versions and silently fails in others. The array form is unambiguous.
- **Always `endSession()` in `finally`.** Sessions are connection resources; not releasing them leaks. The `try/finally` wrapping is mandatory, not optional.

---

## 🚧 Non-Goals

- **Distributed transactions across services.** Out of scope. The pattern is single-database, single-replica-set.
- **Long-lived transactions.** Each transaction is short — at most two `create` calls. MongoDB transactions have a 60-second default lifetime, but anything more than a few hundred ms is suspect.
- **Optimistic concurrency control on User documents.** No `__v`-based optimistic locking is enforced beyond Mongoose defaults. Concurrent writes to the same user from different requests will land last-write-wins.
- **Cross-collection cascading deletes via transactions.** `directory.service.js`'s recursive delete uses a transaction for the User + Directory deletes but performs physical file cleanup outside (with `Promise.allSettled`). Same principle as Session.create being outside — anything that's not safely retry-able stays out.

---

## 📌 Project Context

### Current call sites

- `src/services/auth.service.js` — `verifyOTP` (since project inception)
- `src/services/oauth.service.js` — `loginOrCreateOAuthUser` new-user branch (since PR #14, originally PR #11)
- `src/services/auth.service.js` — `resetPassword` (since PR #25; password update + session wipe atomic)
- `src/services/admin/user.service.js` — `suspendUser` (since PR #33; suspendedAt + session wipe atomic)
- `src/services/admin/user.service.js` — `softDeleteUser` (since PR #33; deletedAt + session wipe atomic)
- `src/services/admin/user.service.js` — `hardDeleteUser` (since PR #33; multi-collection wipe inside the transaction, disk-file cleanup outside via `Promise.allSettled`)
- `src/services/directory.service.js` — `createDirectory` (since PR #69; inserts the new folder + an ancestor `folderCount` `$inc` inside the transaction)
- `src/services/directory.service.js` — recursive directory delete (separate pattern; transaction wraps DB deletes + an `updateAncestorDirectoryStats` ancestor decrement since PR #62, physical-file cleanup happens outside via `Promise.allSettled`)
- `src/services/file.service.js` — `uploadFile` and `deleteFile` (since PR #62; a `File` create/delete plus an `updateAncestorDirectoryStats` ancestor `$inc` inside the transaction, with disk I/O kept outside — stream-before on upload, `rm`-after on delete). Since PR #66, `uploadFile` also reads the root-directory `size` and enforces the per-user storage quota inside the same transaction — because that quota read shares the root doc the ancestor `$inc` writes, two concurrent uploads write-conflict on it and `withTransaction` retries the loser against the fresh size, so the cap holds without an explicit lock.

### Deployment requirement

Production MongoDB must be a replica set. Current target is MongoDB Atlas, which is replica-set by default on every tier.

### When to add a new transaction

If a future feature needs to atomically create or mutate two or more documents that reference each other, it should adopt this pattern. Examples that might need it later:

- Sharing a directory with another user (creates a `Permission` document; updates the shared-with user's view metadata).
- Atomic file move across directories (the move plus any associated audit log entry).

If the feature also needs to create a Session as a side effect, follow the "Session outside" rule.

---
