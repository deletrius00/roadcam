# RoadCam

**See the road ahead.** RoadCam uses your phone's location to find highway cameras ahead of you
and behind you, and shows each one's latest picture with a live "2 min ago" label, color-coded
so you can tell at a glance whether to trust it.

- Green: under 5 minutes old · Amber: under 30 minutes · Red: older
- Cameras split into **Ahead** and **Behind** based on your direction of travel, and move between
  them as you drive past
- **Live map** showing you, your direction, the ahead/behind zones, and every camera pin (tap a pin for its picture)
- **Traffic**: CHP incidents (crashes, hazards, stalled cars) and what the overhead freeway signs say right now, on the map and as a list
- **Offline cameras** detected and marked (Caltrans' "Temporarily Unavailable" cards look fresh, so RoadCam checks the picture itself)
- **Which lanes are which**: when Caltrans says which way a camera points, the picture's lanes are labeled ("↑ Northbound · You")
- **Live traffic speeds** on the map (green / orange / red roads) for California, Washington and everywhere else, from TomTom (needs the free `TOMTOM_API_KEY`, see below)
- Pinch, double-tap, drag and scroll to move around the map
- **"On I-5"**: works out which highway you're on from the cameras around you
- Plain-English camera names ("Truck Escape Ramp (shoulder)" instead of `KER-5-AT TRUCK ESCAPE RAMP (SHOULDER)`)
- Tap any picture to enlarge it
- Works on phones and desktops, in dark and light mode
- **Demo mode** (`/?demo=1`): a simulated drive north on I-5, so you can try it from the couch

> **Passengers only.** Never use RoadCam while driving.

Coverage: California state highways ([Caltrans' public CCTV feeds](https://cwwp2.dot.ca.gov/documentation/cctv/cctv-field-description.htm), CHP incidents, freeway signs) and Washington state highways ([WSDOT Traveler Information](https://wsdot.wa.gov/traffic/api/): cameras, highway alerts, and live congestion from road sensors).

---

## Quick start

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173 (or http://localhost:5173/?demo=1 for the demo drive).

> Your browser only shares location over `https://` or `localhost`. To try live GPS on your phone,
> deploy it (below) and open the deployed link.

## Put it on GitHub

1. Create an empty repository on GitHub named `roadcam` (no README, no .gitignore).
2. In this folder (it already contains a first commit on `main`):

   ```bash
   git remote add origin https://github.com/<your-username>/roadcam.git
   git push -u origin main
   ```

   Starting from a copy without the `.git` folder? Run `git init -b main && git add . && git commit -m "Initial commit"` first.

3. Open the **Actions** tab on GitHub. The **CI** workflow runs lint, type-check, tests and build.
   A green check means everything works.
4. Commit the `package-lock.json` that `npm install` created (or let an agent do it: that's
   ticket 01 in the backlog).

## Deploy it (free, gives you a link for your phone)

1. Sign in at [vercel.com](https://vercel.com) with GitHub.
2. **Add New → Project →** pick `roadcam`. Vercel detects Vite automatically. Click **Deploy**.
3. You get a URL like `https://roadcam-yourname.vercel.app`. Every push to `main` redeploys, and
   every pull request gets its own preview link, which is handy for reviewing agent PRs on your phone.

The backend (`api/*.ts`) becomes serverless functions automatically.

**Optional: live traffic-speed colors.** Make a free account at [developer.tomtom.com](https://developer.tomtom.com),
copy your API key, then in Vercel open the project → **Settings → Environment Variables** → add
`TOMTOM_API_KEY` with your key (all environments) → **Save**, and redeploy. Without it, everything else still works.

## Use it with background agents

This repo is set up for the overnight-agent workflow:

- **`AGENTS.md`**: instructions every coding agent reads first (setup, commands, rules,
  definition of done). `CLAUDE.md` points Claude Code at it.
- **`.github/agent-backlog/`**: 11 agent-ready tickets, from easy to hard.
- **`scripts/create-issues.sh`**: turns those tickets into GitHub issues:

  ```bash
  gh auth login                      # once
  ./scripts/create-issues.sh --dry-run
  ./scripts/create-issues.sh
  ```

- **CI** checks every agent PR automatically.

A suggested first week:

| Night | Assign | What you'll learn |
|---|---|---|
| 1 | #01 lockfile, #02 remember radius | The basic loop: assign → sleep → review → merge |
| 2 | #03 next-camera card, #04 refresh button | Reviewing UI changes via Vercel preview links |
| 3 | #05 same-road filter to two different agents | Comparing tools on the same task |
| 4 | #07 component tests, #08 e2e test | Agents strengthening their own safety net |
| 5 | #10 refactor | Where agents struggle: bigger design changes |
| Weekly | #11 dependency upgrades as a scheduled task | Hands-off maintenance |

After every review, add a one-line rule to the "Lessons learned" section of `AGENTS.md` for any
mistake you saw.

## How it works

```
Phone GPS ──► useLocation (position + heading)
                    │
                    ├──► useCameras ──► GET /api/cameras?lat&lon&radius
                    │                       │
                    │                       ├─ downloads Caltrans district feeds (cached 10 min)
                    │                       ├─ keeps cameras within the radius, closest first
                    │                       └─ asks each image "when did you last change?"
                    │                          (HEAD request → Last-Modified, cached 30 s)
                    ▼
        App sorts cameras into Ahead / Behind every second
        ("flashlight" test: within 60° of your heading = ahead)
                    ▼
        CameraCard shows the image + live age badge + distance
```

See [`docs/HOW-THIS-WAS-BUILT.md`](docs/HOW-THIS-WAS-BUILT.md) for a plain-English walkthrough.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | App + API on http://localhost:5173 |
| `npm run check` | Lint + type-check + tests (run before pushing) |
| `npm test` | Unit tests |
| `npm run build` | Production build into `dist/` |

## Notes and limitations

- **Image age** comes from the image server's `Last-Modified` header. If that's unavailable,
  RoadCam falls back to when Caltrans last updated the camera's record, and marks the age
  with `~` because it's approximate.
- **Heading** comes from the phone when available, otherwise from comparing your position over
  the last ~30 seconds. When you're parked, cameras are shown as "Nearby" until you move.
- Caltrans data is a free public service. RoadCam caches aggressively to keep its load low.
  Please keep it that way.

Map tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

## License

MIT
