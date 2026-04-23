# TroveCloud Backend Documentation

Welcome to the TroveCloud backend documentation! This folder contains all the technical documentation necessary to understand, run, and scale the application.

Please navigate to the specific domain you need below:

### 📂 [Architecture](./architecture)

- `system-design.md` - High-level overview of services
- `database-schema.md` - Explanations of core mongoose models
- `folder-structure.md` - Express JS folder conventions

### 📂 [Authentication](./authentication)

- [`registration-flow.md`](./authentication/registration-flow.md) - User registration via email + OTP, plus Google and GitHub OAuth alternative paths.
- [`login-and-sessions.md`](./authentication/login-and-sessions.md) - Session issuance for email/password login, Google OAuth, and GitHub OAuth sign-in, the identity-provider model, and cookie-based session strategy.
- [`logout-flow.md`](./authentication/logout-flow.md) - Single-device and global logout, provider-agnostic session destruction.
- `password-reset.md` - Forget password logic _(not yet implemented)_.

### 📂 [API Documentation](./api)

- `endpoints.md` - Master list of all available API routes
- `error-codes.md` - Glossary for `AppErrorCode` constants
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
