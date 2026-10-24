# Prefer cameras on the road I'm actually driving
Labels: agent-ready, medium, feature

**Goal:** On a freeway, a camera 3 miles ahead on a parallel surface street is less useful than one 8 miles ahead on my freeway. Add an "On my road" toggle.

**Background:** Each camera has `route` (e.g. "I-5") and `direction` (the side of the road it is on: North/South/East/West/Median). We don't know the user's road directly.

**Approach (keep it simple):**
- Guess the user's road as the `route` of the camera that is (a) within 1 mile and (b) whose `direction` matches the user's compass heading (North = heading within 45° of 0°, etc.). If none, no guess.
- Put this in a pure function `guessCurrentRoute(position, heading, cameras)` in `src/lib/route.ts`.

**Acceptance criteria:**
- A toggle in the status bar: "On my road (I-5)" when a route is guessed; hidden otherwise.
- When on, the Ahead and Behind lists only show cameras with that `route`.
- Default off. Turning it on and the guessed route changing is fine (the label updates).

**Testing:** Unit tests for `guessCurrentRoute`: clear match, no camera within 1 mile, camera nearby but facing the wrong direction, Median cameras ignored.

**Out of scope:** Map matching or any external routing service.
