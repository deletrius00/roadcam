# Add a Playwright end-to-end test for demo mode
Labels: agent-ready, medium, testing

**Goal:** One automated test that opens the real app in a real browser and checks the main flow.

**Acceptance criteria:**
- Add `@playwright/test` and a `playwright.config.ts` that starts `npm run dev` as the web server.
- `tests/e2e/demo.spec.ts`:
  - opens `/?demo=1` at a 390×844 viewport;
  - waits for the "Ahead" and "Behind" headings;
  - asserts at least one camera card shows an age badge matching `/ago|just now/`;
  - clicks the first card image and asserts the lightbox opens, then closes it with Escape;
  - saves a full-page screenshot to `test-results/demo.png`.
- Add `npm run test:e2e`.
- Add an `e2e` job to `.github/workflows/ci.yml` that installs Chromium and runs it, uploading the screenshot as an artifact. This ticket explicitly allows editing the workflow.
- Vitest must not pick up the `tests/e2e` folder.

**Out of scope:** Testing live (non-demo) mode.
