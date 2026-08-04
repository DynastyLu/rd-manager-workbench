# Repository Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean only merged branches and reproducible local artifacts, then document the current Star Research Workbench workflow.

**Architecture:** Git ancestry is the deletion gate. Filesystem cleanup is limited to ignored collaboration scratch files and system metadata; all user data, credentials and runnable artifacts stay in place. The root README is the single repository entrypoint.

**Tech Stack:** Git, Markdown, pnpm, NestJS, Vite, Electron, PostgreSQL.

---

### Task 1: Remove only branches proven merged into main

**Files:**
- Modify: local and `origin` Git branch references only.

- [x] **Step 1: Recheck merge ancestry**

Run: `git merge-base --is-ancestor <branch> main`

Expected: exit code `0` for each deletion candidate.

- [x] **Step 2: Delete verified local branches**

Run: `git branch -d <branch>` for each verified candidate.

Expected: Git reports each branch was deleted because its commit is merged into `main`.

- [x] **Step 3: Delete verified remote branches**

Run: `git push origin --delete <branch>` for each verified remote candidate.

Expected: Git reports the corresponding remote reference was deleted.

### Task 2: Remove reproducible collaboration scratch files

**Files:**
- Delete: `.superpowers/`, `.codex-tmp/`, `.codex-artifacts/`, root `-.html`, ignored `.DS_Store` files.

- [x] **Step 1: Confirm every target is ignored and untracked**

Run: `git check-ignore -v <target>` and `git ls-files --error-unmatch <target>`.

Expected: targets are ignored and no tracked file is matched.

- [x] **Step 2: Delete exactly the confirmed targets**

Run: remove each explicit path without wildcards outside the named directories; remove `.DS_Store` files only under this repository.

Expected: no application source, credentials, database runtime data or release output is removed.

### Task 3: Refresh the repository README

**Files:**
- Modify: `README.md`.

- [x] **Step 1: Replace the legacy title and scattered startup narrative**

Document the current product name, three application directories and the fixed local ports.

- [x] **Step 2: Preserve operational contracts**

Include PostgreSQL migration/generation commands, default administrator first-login rule, local knowledge base fallbacks, Electron/Windows limitations and ignored local data boundary.

- [x] **Step 3: Verify the rendered Markdown source**

Run: `rg -n '^#|4311|4312|admin|main|本地文件' README.md`.

Expected: all operational anchors are present once and no legacy project title remains.

### Task 4: Verify and publish

**Files:**
- Modify: Git history on `main`.

- [x] **Step 1: Verify branch and filesystem state**

Run: `git branch --merged main`, `git branch -r`, `git status --short`, and explicit `test ! -e` checks for cleanup targets.

Expected: only `main` and unmerged historical branches remain; removed scratch targets do not exist.

- [x] **Step 2: Check documentation diff and commit**

Run: `git diff --check && git diff -- README.md docs/superpowers`.

Expected: no new whitespace errors; diff only contains the documentation record and README update.

- [ ] **Step 3: Push main and compare local/remote hashes**

Run: `git push origin main && git fetch origin main && test "$(git rev-parse main)" = "$(git rev-parse origin/main)"`.

Expected: push succeeds and the two hashes are equal.
