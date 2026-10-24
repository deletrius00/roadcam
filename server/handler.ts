/**
 * GET /api/cameras?lat=34.05&lon=-118.25&radius=25[&demo=1]
 *
 * Returns the cameras within `radius` miles of the point, closest first, each with
 * its distance and a best estimate of when its current image was taken.
 *
 * Deciding "ahead" vs "behind" happens in the browser, because your heading
 * changes every second while the list of nearby cameras changes slowly.
 */
import { caltransFeedUrl, parseCaltransFeed } from './caltrans.js';
import { districtsNear } from './districts.js';
import { fetchImageInfo, mapWithLimit } from './imageTime.js';
import { demoNearby } from '../src/lib/demo.js';
import { distanceMeters, METERS_PER_MILE } from '../src/lib/geo.js';
import { roadAxis } from '../src/lib/roadAxis.js';
import { regionsNear } from './regions.js';
import { parseWsdotCameras, WSDOT_CAMERAS_URL } from './wsdot.js';
import type { Camera, CamerasResponse, LatLon, NearbyCamera } from '../src/lib/types.js';

export const DEFAULT_RADIUS_MILES = 25;
export const MAX_RADIUS_MILES = 100;
export const MAX_CAMERAS = 40;
const FEED_CACHE_TTL_MS = 10 * 60_000;

export interface HandlerDeps {
  fetch: typeof fetch;
  now: () => number;
}

export const defaultDeps: HandlerDeps = {
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
};

const feedCache = new Map<number, { loadedAt: number; cameras: Camera[] }>();

export function clearFeedCache(): void {
  feedCache.clear();
  wsdotCache = null;
}

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function badRequest(error: string, field: string): Response {
  return json({ error, field }, 400);
}

async function loadDistrict(district: number, deps: HandlerDeps): Promise<Camera[]> {
  const cached = feedCache.get(district);
  if (cached && deps.now() - cached.loadedAt < FEED_CACHE_TTL_MS) return cached.cameras;

  const response = await deps.fetch(caltransFeedUrl(district), {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const cameras = parseCaltransFeed(await response.json());
  feedCache.set(district, { loadedAt: deps.now(), cameras });
  return cameras;
}

/** Read and check `lat`, `lon` and `radius` from a request. Returns a 400 response if invalid. */
export function parseArea(params: URLSearchParams): { center: LatLon; radiusMiles: number } | Response {
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (!params.has('lat') || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return badRequest('lat must be a number between -90 and 90', 'lat');
  }
  if (!params.has('lon') || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return badRequest('lon must be a number between -180 and 180', 'lon');
  }

  const radiusMiles = params.has('radius') ? Number(params.get('radius')) : DEFAULT_RADIUS_MILES;
  if (!Number.isFinite(radiusMiles) || radiusMiles <= 0 || radiusMiles > MAX_RADIUS_MILES) {
    return badRequest(`radius must be between 0 and ${MAX_RADIUS_MILES} miles`, 'radius');
  }
  return { center: { lat, lon }, radiusMiles };
}

let wsdotCache: { loadedAt: number; cameras: Camera[] } | null = null;

async function loadWsdot(deps: HandlerDeps): Promise<Camera[]> {
  if (wsdotCache && deps.now() - wsdotCache.loadedAt < FEED_CACHE_TTL_MS) return wsdotCache.cameras;
  const response = await deps.fetch(WSDOT_CAMERAS_URL, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const cameras = parseWsdotCameras(await response.text());
  wsdotCache = { loadedAt: deps.now(), cameras };
  return cameras;
}

export async function handleCamerasRequest(
  request: Request,
  deps: HandlerDeps = defaultDeps,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const area = parseArea(params);
  if (area instanceof Response) return area;
  const { center, radiusMiles } = area;

  const radiusMeters = radiusMiles * METERS_PER_MILE;
  const now = deps.now();

  if (params.get('demo') === '1') {
    const body: CamerasResponse = {
      generatedAt: new Date(now).toISOString(),
      center,
      radiusMiles,
      cameras: demoNearby(center, radiusMeters, now).slice(0, MAX_CAMERAS),
      warnings: [],
    };
    return json(body, 200, { 'cache-control': 'no-store' });
  }

  // Load the feeds for the state(s) the search reaches, in parallel;
  // one broken feed shouldn't break the app.
  const regions = regionsNear(center, radiusMeters);
  const tasks: Array<{ label: string; load: Promise<Camera[]> }> = [];
  if (regions.includes('california')) {
    // Only the Caltrans districts the search circle reaches (usually 1–3 of the 12).
    for (const d of districtsNear(center, radiusMeters)) tasks.push({ label: `Caltrans district ${d}`, load: loadDistrict(d, deps) });
  }
  if (regions.includes('washington')) tasks.push({ label: 'WSDOT cameras', load: loadWsdot(deps) });
  const warnings: string[] = [];
  const results = await Promise.allSettled(tasks.map((t) => t.load));
  const all: Camera[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') all.push(...result.value);
    else warnings.push(`${tasks[i]!.label} unavailable`);
  });
  if (all.length === 0 && warnings.length > 0) {
    return json({ error: 'Camera data is temporarily unavailable', warnings }, 502);
  }

  const nearby = all
    .map((camera) => ({ camera, distance: distanceMeters(center, camera) }))
    .filter((c) => c.distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_CAMERAS);

  const cameras: NearbyCamera[] = await mapWithLimit(nearby, 8, async ({ camera, distance }) => {
    const { lastModified, unavailable } = await fetchImageInfo(camera.imageUrl, deps.fetch, now);
    return {
      ...camera,
      distanceMeters: distance,
      imageTakenAt: lastModified ?? camera.recordedAt,
      imageTimeSource: lastModified ? 'last-modified' : camera.recordedAt ? 'record' : 'unknown',
      // The "Temporarily Unavailable" check was validated on Caltrans images only.
      unavailable: camera.source === 'caltrans' && unavailable,
      roadAxisDeg: camera.facing ? null : roadAxis(camera, all),
    };
  });

  const body: CamerasResponse = {
    generatedAt: new Date(now).toISOString(),
    center,
    radiusMiles,
    cameras,
    warnings,
  };
  return json(body, 200, { 'cache-control': 'public, s-maxage=30, stale-while-revalidate=30' });
}
