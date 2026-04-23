# Branch & Commit Strategy

This document defines the day-to-day rules for branching, committing, and opening pull requests. It pairs with [`release-workflow.md`](./release-workflow.md):

- **This doc** — how individual changes flow from local edits → branch → PR → `develop`.
- **`release-workflow.md`** — how the accumulated state on `develop` flows → `main` → tagged release.

Read top to bottom to learn the model; jump to specific sections when you need a procedural reference.

---

## 🌿 Branch Naming

Every change starts on a topic branch cut from `develop`. Branch names follow the format:

```
<type>/<short-slug>
```

- **`<type>`** — matches the corresponding commit type (see next section). Communicates the nature of the change at a glance.
- **`<short-slug>`** — kebab-case, descriptive, ≤ 50 characters. Should make the branch's purpose obvious without opening it.

### Branch type table

| Type        | Purpose                                                        | Example                              |
| ----------- | -------------------------------------------------------------- | ------------------------------------ |
| `feat/`     | New user-visible feature or capability                         | `feat/google-oauth`                  |
| `fix/`      | Bug fix in existing behavior                                   | `fix/atlas-profile-picture-null`     |
| `chore/`    | Maintenance tasks (deps, config, gitignore, repo housekeeping) | `chore/gitignore`                    |
| `docs/`     | Documentation-only changes                                     | `docs/github-oauth`                  |
| `refactor/` | Code change that neither fixes a bug nor adds a feature        | `refactor/services-shared-helpers`   |
| `style/`    | Formatting, whitespace, semicolons — no logic change           | `style/lint-fixes`                   |
| `test/`     | Adding or updating tests                                       | `test/auth-controller-coverage`      |
| `perf/`     | Performance improvement                                        | `perf/directory-graphlookup-indexes` |
| `ci/`       | CI/CD configuration changes                                    | `ci/github-actions-node-matrix`      |
| `revert/`   | Reverts a previous commit / PR                                 | `revert/pr-22-rate-limit-changes`    |

### Naming rules

- **Always lowercase**, kebab-case in the slug. Branch names are case-sensitive on some filesystems and inconsistent casing causes real bugs.
- **One topic per branch.** If a change spans multiple types (e.g., a feature plus its docs), pick the dominant one and put both in one PR rather than splitting branches.
- **Short and specific over long and exhaustive.** `feat/oauth-cleanup` is better than `feat/clean-up-oauth-token-handling-and-refactor-callbacks`.
- **No issue numbers in the branch name** unless the workflow specifically uses them. Branch names age; issue references belong in PR descriptions.

---

## 📝 Commit Messages

Conventional Commits format. Every commit (not just PR titles) follows the same structure:

```
<type>(<scope>): <subject>

[optional body, wrapped at 72 cols]

[optional footer]
```

### Subject line rules

- **Maximum 72 characters** including the type and scope prefix.
- **Imperative mood**: "add", "fix", "extract" — not "added", "fixed", "extracts". Reads as instruction-to-the-codebase, not past-tense narration.
- **Lowercase**, except for proper nouns (`Google`, `GitHub`, `MongoDB`).
- **No trailing period.**
- Should make sense as the completion of the sentence "If applied, this commit will…"

### Body rules

- **Optional.** Skip for trivial changes; include for anything non-obvious.
- **Wrap at 72 columns** so it reads cleanly in `git log`, GitHub, and terminal viewers.
- **Explain the why, not the what.** The diff already shows what changed; the body adds the reasoning that won't be obvious months later.
- **Blank line between subject and body.**

### Footer rules

- **Optional.** Used for breaking-change notices and external references.
- `BREAKING CHANGE: <description>` (mandatory for any breaking change post-1.0).
- `Refs: #<issue>`, `Closes: #<issue>`, etc. when the project uses GitHub issues.
- **No AI / co-author attribution.** Don't append `Co-Authored-By` lines for AI assistants in this project.

### Type table

| Type       | When to use                                                       |
| ---------- | ----------------------------------------------------------------- |
| `feat`     | New user-visible feature or new behavior                          |
| `fix`      | Bug fix                                                           |
| `refactor` | Code change that neither fixes a bug nor adds a feature           |
| `chore`    | Maintenance: build process, dependency updates, config, gitignore |
| `docs`     | Documentation only                                                |
| `style`    | Formatting, whitespace, missing semicolons (no logic change)      |
| `test`     | Adding or updating tests                                          |
| `perf`     | Performance improvement                                           |
| `ci`       | CI/CD configuration changes                                       |
| `revert`   | Reverts a previous commit                                         |

### Scope rules

The scope is **the primary folder being modified**, in lowercase, as a single word. It tells reviewers which area of the codebase is touched without opening the diff.

- `feat(routes): map authentication endpoints`
- `fix(services): resolve async transaction rollback leak`
- `refactor(controllers): harden name sanitization and add getCurrentUser`
- `docs(authentication): document Google OAuth sign-in flow`

If a change genuinely spans multiple folders with no clear primary, pick the folder with the most lines changed or the one that anchors the change conceptually. Don't combine scopes (`feat(controllers,routes)`) — pick one.

### Examples from the project's history

```
feat(auth): add Google OAuth sign-in
fix(models): replace immutable flag on provider with pre-save hook
refactor(services): extract shared OAuth and session-limit helpers
docs(authentication): document GitHub OAuth sign-in flow
chore: ignore local storage and AI tool directories
```

### Subject + body example

```
fix(models): replace immutable flag on provider with pre-save hook

Mongoose 9's applyDefaults runs during document construction (findOne
and friends, not save). When a schema has strict: "throw" and a field
has immutable: true, applyDefaults calls doc.invalidate on the
immutable field unconditionally — even for cleanly-loaded docs whose
stored value matches the default. Every User.findOne was throwing
"Path `provider` is immutable and strict mode is set to throw",
breaking resend OTP and any flow that loads-then-saves a user.

Drop immutable: true to avoid the construction-time invalidation.
Add an async pre-save hook using isDirectModified to preserve the
account-takeover guard.
```

The body explains the _why_ (Mongoose internal behavior) that the diff alone wouldn't reveal.

---

## 🔄 PR Workflow

### Standard sequence

```bash
# 1. Start from a fresh develop
git checkout develop && git pull origin develop

# 2. Branch off
git checkout -b <type>/<slug>

# 3. ... make changes, commit ...

# 4. Push with upstream tracking
git push -u origin <type>/<slug>

# 5. Open PR targeting develop
gh pr create --base develop \
  --title "<commit subject>" \
  --body "..."
```

### PR title rules

- For single-commit PRs, **the PR title equals the commit subject** (verbatim).
- For multi-commit PRs, write a title that summarizes the batch — still using the same `<type>(<scope>): <subject>` format.
- Same length, casing, and tense rules as commit subjects.

### PR body rules

Keep the PR body **glanceable**. The commit message carries the detail; the PR body is a summary, not a second copy.

**Include only:**

- A short `## Summary` — 3 to 6 bullets, each describing one thing this PR actually changes.
- A short `## Test plan` — bullet list of what to verify before merging. Focused on this feature; not exhaustive regression.

**Exclude:**

- Deferred / future-work sections. (Those belong in tracking docs, not the PR.)
- Architectural philosophy already documented elsewhere in the repo.
- Items that are NOT in this PR.
- AI / co-author attribution.
- Long copy-paste of code that's already in the diff.

### Always target `develop`, never `main`

- All feature, fix, docs, refactor, and chore PRs target `develop`.
- The only PR that targets `main` is the periodic release PR (`Release vX.Y.Z`), governed by [`release-workflow.md`](./release-workflow.md).

### Keep changes scoped

- One PR = one concern. A feature PR and an unrelated bug-fix PR are two PRs, even if they touch overlapping files.
- If a PR review surfaces additional issues, decide: in-scope tweak (fix in the PR), or follow-up work (open a tracking note and let the PR ship)? Avoid scope creep that delays the merge.
- Reviewers and future archaeologists benefit when one PR explains one change.

---

## 🧹 Post-Merge Cleanup

The local + remote state both need cleanup after a PR merges. Standard sequence:

```bash
# 1. Sync develop with the merged work
git checkout develop && git pull origin develop

# 2. Delete the local topic branch
git branch -d <type>/<slug>

# 3. Prune the stale remote-tracking ref
git remote prune origin
```

When **GitHub's "Automatically delete head branches" setting is enabled** (recommended), the remote branch is deleted server-side at merge time. The local prune cleans up the no-longer-existing tracking ref.

If the auto-delete setting is off, add an explicit step:

```bash
git push origin --delete <type>/<slug>
```

between local delete and prune.

---

## 🚫 Direct-to-Develop Commits

The default flow is always: branch → PR → merge. **Direct commits to `develop` are reserved for narrow, exceptional cases** and should be visibly rare in `git log`.

Acceptable exceptions:

- A single-file urgent unblocker that a PR review would only delay.
- A typo or comment fix isolated to one file.
- A change so trivial that "open a PR for this" is meaningfully more work than the change itself.

When making a direct-to-develop commit:

- Write the commit message exactly as you would for a PR — same Conventional Commits format, same body discipline.
- Note in the commit body that it skipped the PR flow, and why.
- Don't make a habit of it.

If `git log --oneline --no-merges develop ^main` ever shows more than a couple of direct commits, the project is implicitly drifting toward trunk-based — re-evaluate the workflow rather than continuing to bypass PRs ad-hoc.

---

## ⚠️ Common Pitfalls

- **Branching from a stale `develop`.** Always `git pull origin develop` before `git checkout -b`. Branching off a local develop that's behind the remote means your PR will need a rebase or merge before it can land cleanly.
- **Mixing unrelated changes in one PR.** A feature plus a refactor plus a docs update plus a bug fix in one PR is four PRs of cognitive load on the reviewer. Split.
- **Force-pushing a shared branch.** If anyone else has pulled the branch, your force-push silently invalidates their copy. Force-push only on branches you own and that no one else has fetched.
- **Amending pushed commits.** Same problem as force-push, plus it breaks the PR's commit history that GitHub's notes generation relies on. Amend only locally before the first push; after that, add a new commit.
- **Long-lived feature branches.** A branch that lives for weeks accumulates merge conflicts and drifts from develop's reality. Keep PRs small enough to land within days.
- **PRs without a clear merge state.** Don't let PRs sit "almost ready" indefinitely. Either drive to merge or close with a note about why.
- **Skipping the post-merge cleanup.** Stale local branches accumulate; stale tracking refs make `git branch -a` noisy. Run the cleanup sequence after every merge.
- **Reverting via UI without context.** GitHub's "Revert" button creates a revert commit, but the message defaults to `Revert "<original subject>"` with no explanation of why. Always edit the revert commit message to say what went wrong and what should happen next.

---

## 📌 Project Context

This section holds TroveCloud-specific facts that the surrounding rules apply to. Update here as conventions evolve.

### Repos

Both TroveCloud repos use the same branch and commit conventions described above:

- `SrjAdhikari/TroveCloud-Backend`
- `SrjAdhikari/TroveCloud-Frontend`

### Default branches

Both repos have `develop` as the default branch on GitHub. PRs default to targeting `develop` without needing the `--base develop` flag once the GitHub repo settings are correct.

### Auto-delete head branches

**Enabled** on the backend repo (and recommended on the frontend) under Settings → General → Pull Requests → "Automatically delete head branches." Post-merge cleanup on the local side reduces to:

```bash
git checkout develop && git pull origin develop
git branch -d <type>/<slug>
git remote prune origin
```

### Scopes commonly used

For commit and PR scopes, the backend follows the folder layout described in `CLAUDE.md` §2:

```
constants, controllers, database, errors, lib, middlewares,
models, routes, schemas, services, templates, utils, validators
```

Plus a few cross-cutting scopes that don't map to a single folder:

- `auth` — when the change spans `controllers/auth.controller.js`, `services/auth.service.js`, `routes/auth.routes.js`, etc., and "auth" is a more meaningful summary than any single folder.
- `chore` (no scope) — for repo-level housekeeping like `.gitignore`.

### No AI / co-author attribution

Commit messages and PR bodies in this project **must not** include any AI co-author trailer (`Co-Authored-By: Claude…`, etc.) or AI-attribution language. Commits should appear as solo-authored work.

### Direct-to-develop precedent

The project has exactly one intentional direct-to-`develop` commit in its history (commit `7609136`, `fix(models): replace immutable flag on provider with pre-save hook`, 2026-04-22). It was a one-file urgent unblocker — Mongoose 9 + `strict: "throw"` was breaking every `User.findOne` call, blocking the entire login flow. The commit body documents the trade-off explicitly. Treat this as the standard for "what counts as exceptional," not as license to bypass PRs more often.

### Cross-reference

For how `develop` flows into `main` and how releases are tagged, see [`release-workflow.md`](./release-workflow.md).

---
