# Commit package-lock.json and make CI use `npm ci`
Labels: agent-ready, easy, chore

**Goal:** Make installs reproducible, so CI and every agent VM get exactly the same dependency versions.

**Where to look:** `package-lock.json` (new), `.github/workflows/ci.yml`

**Acceptance criteria:**
- `package-lock.json` is generated with `npm install` and committed.
- In `ci.yml`, the install step is just `npm ci` (remove the if/else fallback).
- Add `cache: npm` to the `actions/setup-node` step.
- This ticket explicitly allows editing `.github/workflows/ci.yml`.

**Testing:** CI passes on the PR.

**Out of scope:** Upgrading any dependency versions.
