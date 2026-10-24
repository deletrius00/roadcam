# Show the nearest camera ahead as a large "Next camera" card
Labels: agent-ready, easy, feature, ui

**Goal:** The single most useful picture is the next camera up the road. Make it prominent.

**Where to look:** `src/App.tsx`, `src/components/CameraCard.tsx`, `src/styles.css`

**Acceptance criteria:**
- When heading is known and there is at least one camera ahead, show the closest one above the Ahead/Behind sections, full width, with a larger image (max height 60vh on phones).
- The card is labelled "Next camera" and shows the same age badge and distance as other cards.
- That camera is not repeated in the Ahead list below.
- Reuse `CameraCard` with a `variant="hero"` prop rather than duplicating it.
- Works in dark and light themes, at 390px and 1280px widths.

**Testing:** Check demo mode at both widths; attach screenshots to the PR if you can.

**Out of scope:** Changing how ahead/behind is calculated.
