# Make RoadCam installable on a phone home screen (PWA)
Labels: agent-ready, medium, feature

**Goal:** "Add to Home Screen" should give an app-like icon and full-screen launch.

**Acceptance criteria:**
- Add `public/manifest.webmanifest` (name, short_name "RoadCam", `display: standalone`, theme/background `#0b0f14`, icons 192 and 512 PNG generated from `public/favicon.svg`).
- Link it from `index.html`, plus `apple-touch-icon`.
- Add a minimal service worker that caches the app shell (HTML, JS, CSS, icons, demo images) so the app opens offline and shows a friendly "You're offline" banner instead of a broken page. Never cache `/api/` responses or camera images.
- No new runtime dependencies (a small hand-written service worker is fine).

**Testing:** Describe in the PR how you verified installability (e.g. Lighthouse PWA check) and offline behavior.

**Out of scope:** Push notifications, background sync.
