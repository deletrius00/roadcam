# Remember the chosen search radius between visits
Labels: agent-ready, easy, feature

**Goal:** If I pick 50 mi, the app should still be on 50 mi next time I open it.

**Where to look:** `src/App.tsx`, `src/components/StatusBar.tsx` (`RADIUS_OPTIONS`)

**Acceptance criteria:**
- Save the radius to `localStorage` under the key `roadcam.radiusMiles` when it changes.
- On load, use the saved value only if it is one of `RADIUS_OPTIONS`; otherwise default to 25.
- Wrap every `localStorage` read and write in `try/catch` (it throws in some private-browsing modes).
- Put the read/validate logic in a small pure function in `src/lib/settings.ts` so it can be unit tested.

**Testing:** Unit tests in `tests/settings.test.ts` for: valid saved value, missing value, garbage value, value not in options, storage that throws.

**Out of scope:** Saving any other settings.
