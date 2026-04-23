# Release Workflow

This document describes how releases are versioned, cut, and published for the TroveCloud project. It's written to serve two audiences:

- **Newcomers** who want to understand the concepts — what a release is, what semver means, why two branches, etc.
- **Contributors** (including the repo owner) who need a procedural reference when it's time to cut a release.

Each section opens with the general principle, then points out the specific choices TroveCloud has adopted. Project-specific facts that change over time (current version, upcoming release gates, paired-repo state) are consolidated in the [**Project Context**](#-project-context) section at the bottom so updates stay localized.

---

## 🎯 Why Have a Release Workflow?

A **GitHub Release** is a git tag wrapped in a metadata object — title, notes, downloadable source archive. It does not change code, deploy anything, or affect runtime behavior. The application works identically whether or not a repo has ever cut a release.

So why bother? The value sits in organization and communication:

- **Project legibility.** Tagged releases give contributors and reviewers a stable mental map of progress. Every commit carries the same weight in raw `git log`; a release draws a line in the sand and says "this commit, right here, is version X."
- **Historical recall.** "v0.3.0 — OAuth wired" is more memorable than a commit SHA when someone comes back to the project months later.
- **Discrete targets for deployment and rollback.** CI/CD pipelines, deployment scripts, and manual "deploy the production release" workflows can pin to a tag rather than a floating branch tip. Makes "what's running in production right now?" a concrete question.
- **Semantic contract.** If the project ever gets external consumers (a package on npm, other services calling its API, another codebase depending on its types), versions let those consumers pin to a known-good state and migrate deliberately.
- **Workflow practice.** Release tagging is standard in any professional setting. Building the muscle memory on personal projects is cheap and pays off at work.

Skipping releases entirely is a legitimate choice for early-stage or throw-away projects. Once a project is meant to be referenced, deployed, or shared, releases start to earn their cost.

---

## 🔢 Semantic Versioning

Format: `vMAJOR.MINOR.PATCH` (e.g., `v0.1.0`, `v1.2.3`).

| Bump                          | When                               | Backwards-compatible? |
| ----------------------------- | ---------------------------------- | --------------------- |
| **Patch** (`v1.0.0 → v1.0.1`) | Bug fixes only                     | Yes                   |
| **Minor** (`v1.0.0 → v1.1.0`) | New features added                 | Yes                   |
| **Major** (`v1.0.0 → v2.0.0`) | Breaking changes to the public API | **No**                |

### The `0.x.x` pre-stable phase

Versions starting with `0.` ("zero-dot-x") are conventionally understood as **pre-stable**. While in 0.x:

- Breaking changes between minor versions (`0.2.0 → 0.3.0`) are **permitted** and expected.
- Consumers don't have a stability guarantee yet.
- The API surface is still in flux.

Once a project tags `v1.0.0`, semver semantics are in full effect — breaking changes require `v2.0.0`.

Staying in 0.x is the right choice while a project is still establishing its shape. Graduating to 1.0.0 is a statement: "this is stable enough that I'll pay the cost of bumping major version for every breaking change."

---

## 🌳 Branch Model

TroveCloud uses a **two-branch model**:

- **`develop`** — active development. All feature, fix, and docs branches merge here via PR. Default branch on GitHub; changes constantly.
- **`main`** — "latest released version." Moves only when a release is cut. Release tags live here.

### The key invariant

`main` is always an ancestor of `develop`. Changes flow one direction only: feature branches merge into `develop`, then periodically `develop` → `main` happens as a release PR.

A `develop → main` merge at release time should always be a fast-forward — zero conflicts by construction, because `develop` has accumulated all of `main`'s history plus new commits on top.

### Why two branches?

The split gives two roles to two pointers:

- `develop` = "latest state of what's being built." Volatile, advances with every PR.
- `main` = "what's been released to the world." Stable, advances only at release boundaries.

If both branches were kept in lockstep, one of them would be redundant — and the project would effectively be trunk-based with extra ceremony. The value of keeping them separate is precisely that `main` lags `develop` between releases, serving as a consistent "this is what was shipped" pointer.

### Alternatives

**Trunk-based (single branch):** small teams and solo devs sometimes skip `main` entirely, tag releases directly on `develop`, and deploy from tags. Valid. Less ceremony, but loses the "released-version pointer" concept.

**GitFlow (more branches):** adds `release/*` and `hotfix/*` branches on top of two-branch. Valuable when there's parallel release-preparation work to coordinate. Overkill for most solo or small-team projects.

TroveCloud sits between trunk-based and full GitFlow — the two-branch model is the minimum that supports a stable-vs-active distinction.

### Prohibited operations

Keep the model coherent:

- **Don't push directly to `main`.** All updates to `main` come through `develop → main` PRs. One direct-commit exception in TroveCloud's history exists (a single-file urgent unblocker); treat this as genuinely exceptional, not a pattern.
- **Don't tag from `develop`.** Tags go on `main` commits. This matters even more once CI/CD deploys from tagged main.
- **Don't merge `main → develop`.** The flow is one-directional. If `main` ever gets ahead of `develop` (via a direct commit), rebase or cherry-pick the commit onto `develop` instead of a reverse merge.

---

## ⏰ Release Cadence

There is no universally correct release cadence. Pick one and stick to it:

| Strategy            | Cadence                                                | When it fits                                                   |
| ------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| **Feature-based**   | After each user-visible feature lands (2–5 merged PRs) | Most solo and small-team projects. What TroveCloud uses.       |
| **Time-based**      | Weekly or biweekly cuts                                | Teams shipping on a regular schedule. Too much ceremony solo.  |
| **Milestone-based** | Only at named milestones (beta, 1.0)                   | Works if milestones are close together; bad if months apart.   |

### The "main drift" rule of thumb

A useful guardrail: if `main` falls more than ~10 merged PRs behind `develop`, a release is overdue. One of two things is true:

- A release should be cut to sync them up, **or**
- The project is effectively running trunk-based and should drop the two-branch ceremony.

Either is a valid choice; living indefinitely in the middle is not.

---

## 🛠️ How to Cut a Release

Three steps: catch `main` up to `develop`, tag the release, publish.

### 1. The release PR

```bash
# Ensure local develop is up-to-date
git checkout develop && git pull origin develop

# Open the release PR from develop → main
gh pr create --base main --head develop \
  --title "Release vX.Y.Z" \
  --body "Release PR — see release notes on the tag."

# Merge via GitHub UI or gh CLI. Typically a fast-forward.
```

After merge, `main` is at the same commit as `develop`.

### 2. Tag and publish (curated notes)

```bash
gh release create vX.Y.Z \
  --target main \
  --title "vX.Y.Z — <short headline>" \
  --notes "<markdown body>"
```

- `--target main` anchors the tag on the latest `main` commit.
- `--notes` accepts markdown inline, or swap to `--notes-file path.md` for longer content drafted separately.

### 3. Alternative — auto-generated notes

```bash
gh release create vX.Y.Z \
  --target main \
  --title "vX.Y.Z — <headline>" \
  --generate-notes
```

GitHub builds the "What's Changed" section from merged PRs between the previous tag and this one. Contributor list included automatically. Best paired with disciplined PR titles (conventional commits make this approach read well without manual editing).

---

## 📝 Release Notes Policy

Match the effort to the release type:

| Release type                            | Approach                                          | Effort  |
| --------------------------------------- | ------------------------------------------------- | ------- |
| **First release** (`v0.1.0`)            | Curated prose — serves as a mini-README           | ~15 min |
| **Major release** (`v1.0.0`, `v2.0.0`)  | Curated prose — breaking changes need explaining  | ~15 min |
| **Minor release** (`v0.2.0`, etc.)      | Auto-generated, optional one-line headline on top | ~2 min  |
| **Patch release** (`v0.2.1`, etc.)      | Auto-generated, usually untouched                 | ~1 min  |

### What curated notes should include

First and major releases are the ones someone landing on the release page cold will read. A good structure:

- **One-paragraph summary.** What this project is (for first releases) or what this release's story is (for majors).
- **What's working / what's new**, grouped by feature area. Bullet lists with a short phrase per item.
- **What's intentionally NOT in this release.** Sets expectations honestly — a lot of first-release polish is admitting what's pending.
- **Cross-repo links** (when applicable). See the next section.

### What auto-generated notes include

GitHub produces a "What's Changed" section listing every merged PR between the previous tag and this one, plus contributors. For projects with clean conventional-commit PR titles, this is often enough on its own. For projects with terser or inconsistent PR titles, consider a short hand-written "Highlights" paragraph above the auto-generated list.

---

## 🔗 Cross-Repo Pairing

Many applications ship as a pair of repositories — frontend and backend, API and SDK, service and admin tool. Each repo has its own git history, so each gets its own version track:

- `ProjectA`: `v0.1.0` → `v0.2.0` → `v0.2.1` → `v0.3.0`
- `ProjectB`: `v0.1.0` → `v0.2.0` → `v0.3.0`

Repos drift — one may get a bug-fix patch release that the other doesn't. That's fine. The alternative (synchronized versions across repos) adds coordination cost with negligible benefit.

### When to pair

When a single user-visible feature spans both repos (e.g., "OAuth UI wired up" needs frontend changes against an existing backend endpoint), release both around the same time and cross-link in the release notes:

```markdown
## Pairs with

- Frontend: [ProjectA-Frontend v0.2.0](https://github.com/Owner/ProjectA-Frontend/releases/tag/v0.2.0)
```

Pairing is a readability aid on release pages, not a coordination contract. When the repos drift, they drift.

---

## ⚠️ Common Pitfalls

Workflow failures seen in practice:

- **Never releasing.** `main` falls behind `develop` indefinitely. Recovery is fine (reset `main` to match `develop`), but the longer the wait, the more "first release" framing feels pressured. Set the rule-of-thumb drift limit and stick to it.
- **Pushing directly to `main`.** Breaks the "released version" invariant and confuses auto-generated release notes (GitHub compares tag-to-tag based on PR merges). Route all main updates through PRs.
- **Tagging on `develop`.** Works, but breaks downstream tooling that expects tags to live on `main`. Also makes "check out the latest release" a less obvious command.
- **Force-pushing over an existing tag.** Tags are meant to be immutable pointers. If a tag needs to be reassigned, delete the release (`gh release delete vX.Y.Z --cleanup-tag`) and create a new one. Never force-push an existing tag to a new commit — consumers who already pulled the old one get silently inconsistent state.
- **Merging `main → develop`.** Creates a reverse-flow branch dependency that breaks the "`main` is always an ancestor of `develop`" invariant. If a commit ends up on `main` that should also be on `develop`, cherry-pick or rebase — don't reverse-merge.
- **Skipping major version bumps on breaking changes (post-1.0).** Breaking behavior in a minor version is a broken promise to consumers. Either cut the major, or revert the breaking change. In 0.x this doesn't apply — breaking changes are expected.
- **Releasing too often.** Every commit as its own patch release buries meaningful version numbers in noise. Batch patch fixes when sensible.

---

## ↩️ Recovery & Retroactive Operations

- **Tag a past commit retroactively:**
  ```bash
  git tag vX.Y.Z <commit-sha>
  git push origin vX.Y.Z
  ```
  Then create a release off the new tag via the GitHub UI or `gh release create vX.Y.Z`.

- **Delete a release (wrong title, typo in notes, uploaded wrong asset):**
  ```bash
  gh release delete vX.Y.Z --cleanup-tag
  ```
  Removes both the release object and the underlying tag. Safe before anyone has depended on the tag; verify no consumers are affected otherwise.

- **`main` fell way behind `develop` and the gap is painful:**
  One-time fix: flip the GitHub default branch to `develop`, delete the stale `main`, recreate `main` at `develop`'s current tip, then cut a release. Not a routine operation — a signal that the release cadence slipped.

- **Accidentally released the wrong commit:**
  Delete the release (with `--cleanup-tag`), then create a new release pointing at the correct commit. Since git tags aren't depended on by any consumer yet in the wrong-release window, this is clean.

---

## 🧭 Workflow Summary

```
  feat/xyz ──PR──▶  develop  ──PR──▶  main  ──tag──▶ vX.Y.Z
                        │
              (many features accumulate)
                        │
               ◀──── release time ────▶
```

- Feature branch → PR → `develop` (standard flow, many times per release)
- `develop` → PR → `main` (once per release)
- Tag + GitHub Release on `main` (immediately after the release PR merges)

---

## 📌 Project Context

This section holds TroveCloud-specific facts that evolve over time. Update here as releases are cut and gates are cleared — the rest of this document stays stable.

### Current state (as of 2026-04-23)

- **Backend repo:** `SrjAdhikari/TroveCloud-Backend` — default branch `develop`; latest release `v0.1.0`.
- **Frontend repo:** `SrjAdhikari/TroveCloud-Frontend` — default branch `develop`; latest release `v0.1.0` (paired).
- **Versioning phase:** 0.x (pre-stable). Breaking changes between minor versions are permitted.
- **Cadence:** feature-based — each user-visible feature that lands triggers a minor bump; batched bug fixes trigger a patch bump.

### v1.0.0 gate

TroveCloud will tag `v1.0.0` on both repos when all of the following are true:

- [ ] OAuth frontend integration (Google + GitHub UI flows wired to the existing backend endpoints)
- [ ] Forgot-password feature shipped end-to-end (backend service + endpoint + frontend form)
- [ ] Deployed somewhere reachable with a public URL
- [ ] Deferred P0 security items addressed — at minimum rate limiting (planned as course work)
- [ ] Google Drive import decided: included in v1.0 or explicitly out of scope

Until then, each meaningful feature bumps minor (`v0.2.0`, `v0.3.0`, etc.); bug-fix batches bump patch (`v0.2.1`).

### Cross-repo pairing notes

- OAuth-UI wiring will likely produce a paired release (backend was ready at `v0.1.0`; frontend will bump when the UI lands).
- Forgot-password is likely a single paired minor bump — both repos need changes the same day.
- Drive import is backend-only for the initial version; frontend will follow with the Picker UI in a later paired release.
