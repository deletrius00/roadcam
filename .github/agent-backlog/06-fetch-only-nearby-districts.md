# Only download the Caltrans districts near the user
Labels: agent-ready, medium, performance

**Goal:** Today the API downloads all 12 district feeds. Most requests only need 1–3. Be kinder to Caltrans and faster on cold starts.

**Where to look:** `server/handler.ts`, `server/caltrans.ts`

**Approach:**
- Add a hard-coded table of approximate bounding boxes per district in `server/districts.ts` (min/max lat/lon). Derive them from real feed data if you can reach it; if not, use the published Caltrans district map and pad each box by 0.25°.
- Add `districtsNear(center, radiusMeters)` that returns districts whose padded box intersects the search circle.
- The handler only loads those districts.

**Acceptance criteria:**
- A request in central Los Angeles loads district 7 (and possibly 8 or 12) but never district 1 or 2.
- A request in a gap between boxes still returns at least the nearest district.
- Existing tests keep passing; the "every district down" test is updated to match the new behavior.

**Testing:** Unit tests for `districtsNear`, and a handler test asserting which feed URLs were fetched (the fake fetch already records calls).

**Out of scope:** Changing cache durations.
