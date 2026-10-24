# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Copilot, Cursor, Jules) working in this repo.
Humans: this is also the fastest way to understand the project.

## What this project is

**RoadCam** is a web app that uses your phone's location to find highway cameras ahead of
you and behind you, and shows each camera's latest image with a live "x min ago" label.

- **Data sources:** California = Caltrans CCTV feeds (one JSON file per district), CHP incidents, Caltrans signs. Washington = WSDOT KML feeds (cameras, alerts, traffic flow), see `server/wsdot.ts`. `server/regions.ts` picks which state's feeds a search needs.
  Field reference: https://cwwp2.dot.ca.gov/documentation/cctv/cctv-field-description.htm
  A realistic sample lives in `tests/fixtures/caltrans-sample.json`. Use it; don't guess field names.
- **Stack:** TypeScript (strict), React 19, Vite, Vitest, ESLint. Deployed on Vercel.
- **Node:** 20 or newer.

## Layout

| Path | What lives there |
|---|---|
| `src/lib/` | Pure logic, no React: geo math (`geo.ts`), image age (`age.ts`), heading (`heading.ts`), map tile math (`tiles.ts`), friendly camera names (`names.ts`), "which highway am I on" (`route.ts`), demo data (`demo.ts`), shared types (`types.ts`) |
| `src/hooks/` | React hooks: `useLocation` (GPS + heading), `useCameras` (fetching), `useNow` (1-second clock), `usePrefersDark` (light/dark map tiles) |
| `src/components/` | UI pieces: `MapView` (hand-built map, no library), `CameraCard`, `CameraSection`, `StatusBar`, `StartScreen`, `Lightbox` |
| `src/App.tsx` | Puts it together; sorts cameras into ahead / behind / side |
| `server/` | Backend logic: lane closures (`lcs.ts`), NWS weather (`nws.ts`), TomTom incidents and speed tiles (`tomtomIncidents.ts`, `speedTiles.ts`), Caltrans parsing (`caltrans.ts`), which Caltrans districts a search needs (`districts.ts`), image age + offline check (`imageTime.ts`, `placeholder.ts`), `/api/cameras` (`handler.ts`), `/api/traffic` from CHP + Caltrans signs (`traffic.ts`) |
| `api/cameras.ts`, `api/traffic.ts` | Thin Vercel serverless wrappers around `server/`. Keep them thin. |
| `vite.config.mts` | Vite + Vitest config; a dev plugin serves `/api/cameras` locally with the same handler |
| `tests/` | Vitest unit tests and fixtures |
| `public/demo/` | Sample camera images for demo mode |
| `.github/agent-backlog/` | Agent-ready tickets (turned into GitHub issues by `scripts/create-issues.sh`) |

## Setup (must work on a fresh machine)

```bash
npm install
npm run dev          # http://localhost:5173 — open /?demo=1 for the simulated drive
```

No API keys are needed to run it. One optional key: `TOMTOM_API_KEY` turns on the live traffic-speed colors on the map
(`server/speedTiles.ts`, `/api/speed-tile`). It lives only in Vercel → Settings → Environment Variables, never in code;
without it the map simply has no speed colors. Tests never need it.

## Commands

| Task | Command |
|---|---|
| Dev server (app + API) | `npm run dev` |
| All checks (run before every PR) | `npm run check` |
| Unit tests | `npm test` |
| One test file | `npx vitest run tests/geo.test.ts` |
| Lint | `npm run lint` |
| Type-check | `npm run typecheck` |
| Production build | `npm run build` |

## Definition of done

A task is finished only when **all** of these are true:

1. `npm run check` passes (lint + typecheck + tests).
2. `npm run build` passes.
3. New behavior has tests (see Testing rules).
4. For UI changes: you looked at the result in demo mode (`/?demo=1`) at phone width (390px)
   and desktop width, and attached screenshots to the PR if your environment can take them.
5. The PR description explains what changed, why, and how it was tested.

If you can't get these passing, say so clearly in the PR description. Never disable, skip,
or delete tests to make them pass.

## Coding conventions

- TypeScript strict mode. No `any` without a comment explaining why.
- Pure logic goes in `src/lib/` or `server/` and gets unit tests. Components stay thin.
- Named exports only.
- React: function components and hooks. One component per file.
- Times: store and pass around as ISO 8601 UTC strings; format only for display.
- Distances internally in meters; convert to miles/feet only for display (`formatDistance`).
- Angles in degrees, 0 = north, clockwise.
- Styling: plain CSS in `src/styles.css` using the CSS variables in `:root`.
  Every color must work in both dark and light themes. No CSS frameworks.
- Keep comments plain-English. The owner is using this repo to learn.

## Testing rules

- Tests must **never** call the real internet. Use the fake `fetch` pattern in
  `tests/handler.test.ts` and the fixture in `tests/fixtures/`.
- Tests must not depend on the real clock. Pass `now` in explicitly, as the existing code does.
- Every bug fix includes a test that fails before the fix and passes after.
- Every change to `/api/cameras` includes a success test and at least one error test.

## Boundaries — do NOT

- Add dependencies without explaining why in the PR. Prefer the platform (fetch, Intl, CSS).
  The map is deliberately library-free (`src/lib/tiles.ts` + `MapView`); don't swap in Leaflet/Mapbox without an issue asking for it.
- Remove the OpenStreetMap attribution from the map (their terms require it).
- Show raw Caltrans camera names in the UI. Use `friendlyCameraName()`.
- Change the `/api/cameras` response shape in a breaking way. Add fields; don't rename or remove.
- Increase load on Caltrans: keep the feed cache (10 min) and image-time cache (30 s);
  never fetch feeds or images from the browser in a loop.
- Edit `.github/workflows/` unless the ticket explicitly asks for it.
- Commit secrets, `.env` files, `dist/`, or `node_modules/`.
- Make changes outside the ticket's scope. Note other problems in the PR description instead.
- Remove the "Passengers only" safety wording from the UI.

## Git and pull requests

- Branch name: `agent/<short-task-name>`.
- Small commits with clear messages: `feat: ...`, `fix: ...`, `test: ...`, `refactor: ...`, `docs: ...`.
- Open PRs as **drafts** and link the issue (`Closes #12`).
- PR description:

```
## What
<one or two sentences>

## Why
Closes #<issue>

## How I tested it
<commands run, tests added, screenshots for UI changes>

## Open questions / things I wasn't sure about
<anything the reviewer should look at closely>
```

## When you're stuck

If the ticket is ambiguous, pick the simplest reasonable interpretation, implement it, and list
your assumption under "Open questions" so the reviewer can confirm or correct it.
If the live Caltrans data looks different from the fixture, don't guess: describe what you saw
in the PR and update the fixture with a real (trimmed) sample.

## Lessons learned (add to this list after reviewing agent PRs)

- Files in `api/`, `server/` and `src/lib/` must use `.js` extensions on relative imports
  (`import { x } from './geo.js'`). Vercel runs the API as plain Node ES modules with no bundler,
  and the first deploy crashed without them. `tests/runtime-imports.test.ts` enforces this.
- Caltrans "Temporarily Unavailable" images have a fresh timestamp and normal size. Detect them from the picture bytes (`server/placeholder.ts`), never from age or size. The rule was validated on 592 live cameras; re-validate before changing it.
- The CHP incident feed is sometimes invalid XML. Parse each `<Log>` block separately (`parseChpIncidents`), never with a strict XML parser.
- Never send `TOMTOM_API_KEY` (or any key) to the browser. The browser asks `/api/speed-tile`, and the server adds the key.
- Don't hand-draw map boxes (districts, regions). Check them against the real data first: a hand-drawn Caltrans district box once hid 5 Mojave cameras.
- Caltrans lane-closure files are huge (LA is ~15 MB). Only load the districts near the search (`districtsNear`) and keep the 10-minute cache.
- api.weather.gov requires a User-Agent header (`NWS_USER_AGENT`). Requests without one get refused.
- _When an agent makes a mistake, add a one-line rule here so it doesn't happen again._
