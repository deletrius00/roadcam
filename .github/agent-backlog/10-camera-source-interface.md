# Refactor: support more than one camera data source
Labels: agent-ready, hard, refactor

**Goal:** Prepare for cameras outside California without changing behavior today.

**Where to look:** `server/handler.ts`, `server/caltrans.ts`, `src/lib/demo.ts`

**Acceptance criteria:**
- Define in `server/sources/types.ts`:
  ```ts
  export interface CameraSource {
    id: string;                       // e.g. "caltrans"
    covers(center: LatLon, radiusMeters: number): boolean;
    load(deps: HandlerDeps): Promise<{ cameras: Camera[]; warnings: string[] }>;
  }
  ```
- Move Caltrans logic into `server/sources/caltrans.ts` implementing it; demo becomes a `CameraSource` too.
- The handler asks every source that `covers()` the request, merges results, and keeps the current behavior: radius filter, closest first, max 40, image-time lookup, warnings.
- Camera ids stay globally unique (prefix with source id; Caltrans ids are unchanged).
- **No behavior change:** all existing tests pass unchanged except import paths.

**Testing:** Add a test with two fake sources proving results are merged and sorted, and that a source whose `covers()` is false is never loaded.

**Out of scope:** Adding a real second source (that's a follow-up ticket once this lands).
