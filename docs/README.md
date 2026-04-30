# TroveCloud Backend Documentation

Welcome to the TroveCloud backend documentation! This folder contains all the technical documentation necessary to understand, run, and scale the application.

Please navigate to the specific domain you need below:

### 📂 [Architecture](./architecture)

- [`database-schema.md`](./architecture/database-schema.md) - Models, indexes, TTLs, hidden-field convention, and cross-model relationships.
- [`oauth-multi-provider.md`](./architecture/oauth-multi-provider.md) - Shared OAuth sign-in helper, provider-specific divergences, and account-takeover guards.
- [`transaction-patterns.md`](./architecture/transaction-patterns.md) - Atomic User+Directory creation, why Session.create runs outside the transaction, Mongoose mechanics.
- [`email-template-system.md`](./architecture/email-template-system.md) - Transactional email composition model, brand tokens, client-compatibility rules.
- [`drive-import.md`](./architecture/drive-import.md) - As-built design for the Google Drive import feature (`POST /api/drive/import`).

### 📂 [Authentication](./authentication)

- [`registration-flow.md`](./authentication/registration-flow.md) - User registration via email + OTP, plus Google and GitHub OAuth alternative paths.
- [`login-and-sessions.md`](./authentication/login-and-sessions.md) - Session issuance for email/password login, Google OAuth, and GitHub OAuth sign-in, the identity-provider model, and cookie-based session strategy.
- [`logout-flow.md`](./authentication/logout-flow.md) - Single-device and global logout, provider-agnostic session destruction.
- [`password-reset.md`](./authentication/password-reset.md) - Forgot password and reset password flow (OTP-based, reuses User OTP fields, atomic password update + session wipe).

### 📂 [Workflow](./workflow)

- [`release-workflow.md`](./workflow/release-workflow.md) - Versioning (semver), branch model, release cadence, how to cut a release.
- [`branch-commit-strategy.md`](./workflow/branch-commit-strategy.md) - Branch naming, commit message conventions, PR workflow, post-merge cleanup.

### 📂 [API Documentation](./api)

- `endpoints.md` - Master list of all available API routes
- [`error-codes.md`](./api/error-codes.md) - Glossary for `appErrorCode` constants, HTTP-status conventions, framework-error mappings.
- `postman-collection.json` - Exported configurations for local testing

### 📂 [File](./file)

- [`file-retrieval.md`](./file/file-retrieval.md) - Retrieve and serve/download a file by ID
- [`file-upload.md`](./file/file-upload.md) - Stream-based file upload into a parent directory
- [`file-update.md`](./file/file-update.md) - Rename a file (atomic single-query update)
- [`file-deletion.md`](./file/file-deletion.md) - Delete a file's DB record and physical storage

### 📂 [Features](./features)

- `directory-management.md` - Logic for managing nested recursive directories
- `file-upload.md` - Logic for handling S3/Multer uploads

### 📂 [Deployment](./deployment)

- `local-setup.md` - Guide for spinning up the development server locally
- `production.md` - Production CI/CD strategies
