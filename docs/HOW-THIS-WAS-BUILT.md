# How RoadCam was built (explained like you're five)

This is a step-by-step walkthrough of how this project went from an idea to a repo that
background agents can work on overnight. Read it once front to back. Each step ends with the
**lesson** that carries over to any project.

---

## Step 0: Start with the data, not the code

**The idea:** "Find webcams on the road ahead of me and behind me, and show how old each picture is."

Before writing any code, the first question is *where do the pictures come from?* An app is
only as good as its data.

Caltrans (California's highway department) publishes a free list of every highway camera,
split into 12 files, one per district. Each camera record has:

- where it is (latitude / longitude)
- which highway and which side of the road (`route`, `direction`)
- a link to its latest picture (`currentImageURL`)
- when the record was last updated (Pacific time)

Caltrans' website blocks robots from reading the live files, so the code was written against
their **official field documentation**, and a realistic sample was saved as
`tests/fixtures/caltrans-sample.json`.

> **Lesson:** Give agents the shape of the data up front (docs, or a real sample file).
> Agents that have to guess field names write code that looks right and silently doesn't work.

---

## Step 1: Draw the blueprint

Three parts, like a restaurant:

| Part | Restaurant version | RoadCam |
|---|---|---|
| **Frontend** | The dining room | React app in your browser: asks for your location, shows the pictures |
| **Backend** | The kitchen | One small function, `/api/cameras`: fetches the camera list, picks the nearby ones, checks picture ages |
| **Data source** | The farm | Caltrans' camera files |

**Why a backend at all?** Browsers have a safety rule called **CORS**: a web page can't read
data from another website unless that site explicitly allows it. Showing an image with `<img>`
is allowed, but reading Caltrans' camera list or image headers isn't. So a tiny server does the
reading for us. On Vercel, a file in `api/` automatically becomes that server ("serverless").

> **Lesson:** Decide the big pieces and how they talk *before* coding. This is the part you
> should keep doing yourself. It's the "architecture" skill that matters more as agents write
> more of the code.

---

## Step 2: Write the "brain" as plain functions (no screen yet)

The logic lives in small files with no React, so they're easy to test:

- **`src/lib/geo.ts`: the math.**
  - *Distance* between two GPS points (the haversine formula, which accounts for Earth being round).
  - *Bearing*: which compass direction a camera is from you (0° = north, 90° = east).
  - *Ahead or behind?* **The flashlight trick:** imagine a flashlight beam pointing the way
    you're driving, 120° wide. Cameras inside the beam are **ahead**. Cameras inside the same
    beam pointed backwards are **behind**. Everything else is **off to the side**.
- **`src/lib/heading.ts`: which way am I going?** Phones often don't report direction. So we
  remember where you were ~30 seconds ago, and the arrow from "then" to "now" is your heading.
  If you've moved less than 25 meters, we don't guess (GPS jitters when you're parked).
- **`src/lib/age.ts`: "how old is this picture?"** Turns a timestamp into "42 sec ago" and
  picks a color: green under 5 min, amber under 30, red older.

> **Lesson:** Keep logic out of the UI. Plain functions are easy for you to review, and easy
> for agents to test and change safely.

---

## Step 3: The backend endpoint

`server/handler.ts` answers `GET /api/cameras?lat=34.6&lon=-118.7&radius=25`:

1. **Check the inputs.** Bad latitude? Reply `400` with a message saying which field is wrong.
2. **Download the camera lists.** All 12 districts at once. Each is remembered for 10 minutes
   (a **cache**) so we don't hammer Caltrans. If one district is down, keep going with the rest
   and include a warning.
3. **Keep the nearby ones**, closest first, at most 40.
4. **Ask each picture how old it is.** A `HEAD` request is like asking a librarian "when did
   this book last change?" without checking the book out. The server replies with a
   `Last-Modified` time. If that fails, we fall back to the record's timestamp and mark the age
   with `~` because it's only approximate.

`api/cameras.ts` is a 3-line wrapper so Vercel can run it. During development, a small plugin in
`vite.config.mts` runs the **same** handler, so `npm run dev` gives you the whole app.

> **Lesson:** Plan for failure. Real data sources go down. An app that degrades gracefully
> ("some cameras missing") beats one that shows a blank screen.

---

## Step 4: Tests with a fake internet

`tests/handler.test.ts` never touches the real internet. It hands the code a **fake `fetch`**
that returns the sample file, or pretends a district is down, or pretends the image server
timed out. That makes the tests:

- **fast** (milliseconds)
- **reliable** (no flaky failures because Caltrans had a bad minute)
- **safe to run anywhere**, including inside an agent's cloud VM at 3am

There are 51 tests covering the math, time zones (including daylight saving), parsing messy
data, and the endpoint's success and failure paths.

One more check: a deliberately wrong test was run to confirm it **fails**. A test that can't
fail is worse than no test, because it gives false confidence.

> **Lesson:** Tests are how agents check their own work. The better your tests, the more you can
> safely delegate. "Fake the outside world" is the key technique.

---

## Step 5: The screen

React splits the screen into **components** (Lego bricks) and **hooks** (little helpers that
each watch one thing):

| Hook | Watches | Notes |
|---|---|---|
| `useLocation` | Your GPS | Works out heading and speed; in demo mode, drives a pretend car up I-5 |
| `useCameras` | The backend | Fetches every 60 s, or sooner if you've moved a mile |
| `useNow` | The clock | Ticks every second so "47 sec ago" counts up live |

| Component | Is |
|---|---|
| `StartScreen` | The welcome page with "Use my location" / "Try a demo drive" |
| `StatusBar` | Top strip: GPS status, heading arrow, speed, radius, Stop |
| `CameraSection` | The "Ahead" or "Behind" column |
| `CameraCard` | One picture with its age badge and distance |
| `Lightbox` | Tap-to-enlarge view |

The flashlight test runs in the browser every second, so a camera jumps from Ahead to Behind
the moment you pass it.

**Demo mode** (`/?demo=1`) uses pretend cameras and pretend images in `public/demo/`. It exists
so that you, CI, and agents can all see the app working without being on a California freeway.

> **Lesson:** Always build a demo/fake mode for anything that depends on the real world
> (location, live data, payments). It makes development, testing, screenshots and agent
> verification possible.

---

## Step 6: Look at it

Tests check logic. They don't tell you the header looks broken on a phone. So the app was opened
in a **headless browser** (real Chrome, no window), at phone and desktop sizes, in dark and light
mode, and screenshotted. That review caught three real bugs:

1. The phone header wrapped into a messy centered stack. Fixed with a two-row layout.
2. The "DEMO CAM" label in the sample images hid behind the age badge. Moved it.
3. When camera data failed to load, the page *also* said "No cameras within 25 miles", which is
   misleading. Now it only shows the error and "Retrying shortly…".

> **Lesson:** Someone has to look at the screen. Today, agents can take these screenshots
> themselves and attach them to their pull requests ("agents that verify visually").
> Ask for that in `AGENTS.md`. This repo already does.

---

## Step 7: Make the repo agent-ready

- **`AGENTS.md`**: the onboarding doc for agents: what the project is, where things live, the
  exact commands, the **definition of done**, coding rules, and **boundaries** (things never to
  do, like hammering Caltrans or removing the "passengers only" warning). It ends with a
  "Lessons learned" list that you grow after every review.
- **`CLAUDE.md`**: one line telling Claude Code to read `AGENTS.md`, so there's a single source
  of truth.
- **CI** (`.github/workflows/ci.yml`): GitHub runs lint, type-check, tests and build on every
  push and pull request. A green check is your first filter when reviewing agent PRs in the morning.
- **The backlog** (`.github/agent-backlog/`): 11 tickets written the agent-ready way: one goal,
  where to look, exact acceptance criteria, how to test, and what's out of scope.
  `scripts/create-issues.sh` turns them into GitHub issues.

> **Lesson:** The quality of what agents produce overnight is decided by what you write during
> the day: clear tickets, a good `AGENTS.md`, and solid tests.

---

## Step 8: The map, friendly names, and "which highway am I on?" (added later)

- **The map, without a map library.** Online maps are made of 256×256 picture squares called
  *tiles*. At zoom level z, the world is 256·2^z pixels wide. `src/lib/tiles.ts` converts GPS
  coordinates to pixels on that giant picture, works out which tiles cover the screen, and
  loads them from CARTO (free tiles built from OpenStreetMap). `MapView` puts tiles, your blue
  arrow, and the camera pins on top. The map also draws the **flashlight**: the yellow and
  purple slices are exactly the zones that decide ahead vs. behind.
- **Friendly names.** Caltrans uses internal codes like `KER-5-AT TRUCK ESCAPE RAMP (SHOULDER)`
  (county Kern, route 5, *at*…). `src/lib/names.ts` decodes them, turning `JNO` into "Just north
  of", dropping camera numbers like `(971)`, and fixing ALL CAPS. The tests use real names from
  the live feed.
- **Which highway am I on?** Highway cameras sit along the road, so a line between two I-5
  cameras roughly traces I-5. If you're within half a mile of such a line, you're probably on
  I-5. That's `src/lib/route.ts`.

> **Lesson:** When a new library is tempting, check how much of it you need. Here about
> 100 lines of tested math replaced a whole mapping library, and every line is readable.

---

## What was and wasn't verified before handing this over

Being honest about this is part of the job, for humans and agents alike.

**Verified:**
- All 51 unit tests pass (run with the same esbuild engine that Vite uses).
- Strict TypeScript type-check passes for all logic, server, API and test code.
- The frontend and backend bundle without errors.
- The app was clicked through in a real headless browser: start screen, demo drive (ahead and
  behind sorting, live ages, distances), tap-to-enlarge, live mode with a fake GPS position, and
  the error state.

**Not verified (the build environment couldn't download npm packages or reach Caltrans):**
- `npm install`, ESLint, and the React parts of the type-check. **Your first CI run on GitHub
  does this.** If anything is red, that's a perfect first ticket for an agent.
- Live Caltrans data end-to-end. The code follows Caltrans' documented format. If the live
  files differ, the app shows a clear error rather than wrong data. Run `npm run dev`, tap
  "Use my location" (or try a point on a California highway), and check.
- Deployment on Vercel.

---

## The workflow you just watched, in one picture

```
You (daytime)                         Agents (overnight)                You (morning)
─────────────                         ──────────────────                ─────────────
Decide what to build      ──►   Read AGENTS.md + the ticket   ──►   Check CI is green
Write clear tickets              Write code + tests                  Open the Vercel preview
Keep AGENTS.md sharp             Run npm run check                   Read the diff
                                 Take screenshots                    Merge / comment / close
                                 Open a draft PR                     Add a "lesson learned"
```
