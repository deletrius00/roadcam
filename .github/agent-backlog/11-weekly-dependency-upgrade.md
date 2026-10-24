# Weekly: upgrade dependencies and fix anything that breaks
Labels: agent-ready, scheduled, chore

**Use this as a recurring scheduled task.**

**Acceptance criteria:**
- Run `npm outdated`; upgrade every package to its latest **minor/patch** version.
- Do **not** do major-version upgrades. List any available majors in the PR description with one line on what would be involved.
- `npm run check` and `npm run build` pass.
- If an upgrade breaks something you can't fix cleanly, keep that one package at its current version and explain why.

**Testing:** Include before/after `npm outdated` output in the PR.

**Out of scope:** Code changes unrelated to the upgrades.
