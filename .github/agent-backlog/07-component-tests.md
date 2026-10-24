# Add React component tests for CameraCard
Labels: agent-ready, medium, testing

**Goal:** Catch UI regressions in CI, not just logic regressions.

**Where to look:** `src/components/CameraCard.tsx`, `vite.config.mts`, `package.json`

**Acceptance criteria:**
- Add `@testing-library/react`, `@testing-library/jest-dom` and `jsdom` as dev dependencies (explain why in the PR).
- Configure Vitest so files named `*.test.tsx` run in `jsdom` while existing `*.test.ts` keep running in `node` (e.g. `environmentMatchGlobs` or a per-file `// @vitest-environment jsdom` comment).
- `tests/CameraCard.test.tsx` covers:
  - shows "2 min ago" and the green/amber/red freshness class for 1, 10 and 45-minute-old images;
  - shows "~" before the age when `imageTimeSource` is `record`;
  - shows "Image unavailable" after the image fires `error`;
  - clicking the image calls `onOpen` with the camera.
- `npm run check` still passes.

**Out of scope:** Tests for other components.
