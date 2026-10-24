# Add a "Refresh now" button and a countdown to the next automatic refresh
Labels: agent-ready, easy, feature, ui

**Goal:** Let me force fresh images, and show when the next automatic refresh will happen.

**Where to look:** `src/hooks/useCameras.ts` (`REFRESH_MS`), `src/components/StatusBar.tsx`

**Acceptance criteria:**
- `useCameras` returns a `refresh()` function that triggers an immediate fetch (and resets the 60 s timer).
- The status bar shows a small button: a circular-arrow icon plus "Refresh" text on wide screens, icon only under 720px, with an `aria-label`.
- Next to it, a muted countdown like "next in 42 s".
- While a fetch is in progress the icon spins (respecting `prefers-reduced-motion`).
- Pressing it repeatedly can't start more than one request at a time.

**Testing:** Extract the countdown math into a pure function in `src/lib/` and unit test it. Check the UI in demo mode.

**Out of scope:** Changing the 60 s interval.
