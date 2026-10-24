/**
 * Live traffic-speed map tiles (the green / orange / red lines on the map), from TomTom.
 *
 * Why TomTom: California doesn't publish free live speeds the way Washington does
 * (Caltrans' own QuickMap uses Google's paid traffic layer, and the Caltrans
 * travel-time feed is broken or years old). TomTom's free tier covers every road
 * in the US.
 *
 * How it works: the browser asks OUR server for /api/speed-tile?z=..&x=..&y=..,
 * and this file fetches the matching picture from TomTom using the secret key in
 * the TOMTOM_API_KEY environment variable (set in Vercel → Settings → Environment
 * Variables). The key never reaches the browser. Vercel's CDN caches each tile for
 * 5 minutes, which keeps us well inside TomTom's free daily limit.
 *
 * The tiles are see-through except for the colored road lines ("relative0" style:
 * green = normal speed, orange = slow, red = very slow, dark red = stopped), so the
 * map draws them on top of the normal OpenStreetMap tiles.
 */
import { MAX_ZOOM, MIN_ZOOM } from '../src/lib/tiles.js';

export interface SpeedTileDeps {
  fetch: typeof fetch;
  /** The TomTom key, or undefined/empty when it hasn't been set up. */
  apiKey: string | undefined;
}

export const defaultSpeedTileDeps = (): SpeedTileDeps => ({
  fetch: (...args) => fetch(...args),
  apiKey: process.env.TOMTOM_API_KEY,
});

/** True when the server has a TomTom key, so the map should ask for speed tiles. */
export function speedTilesEnabled(apiKey: string | undefined = process.env.TOMTOM_API_KEY): boolean {
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
}

/** How long browsers and Vercel's CDN may reuse a tile. Traffic changes, so keep it short. */
export const SPEED_TILE_CACHE = 'public, max-age=120, s-maxage=300, stale-while-revalidate=120';

export interface TileParams {
  z: number;
  x: number;
  y: number;
}

/** Read and check z/x/y. Returns an error message instead when they're missing or out of range. */
export function parseTileParams(params: URLSearchParams): TileParams | string {
  const read = (name: string) => {
    const raw = params.get(name);
    if (raw === null || !/^\d+$/.test(raw)) return null;
    return Number(raw);
  };
  const z = read('z');
  const x = read('x');
  const y = read('y');
  if (z === null || x === null || y === null) return 'z, x and y must be whole numbers';
  if (z < MIN_ZOOM || z > MAX_ZOOM) return `z must be between ${MIN_ZOOM} and ${MAX_ZOOM}`;
  const tilesPerSide = 2 ** z;
  if (x >= tilesPerSide || y >= tilesPerSide) return `x and y must be below ${tilesPerSide} at zoom ${z}`;
  return { z, x, y };
}

/** TomTom's traffic-flow tile URL for one tile. */
export function tomtomFlowTileUrl({ z, x, y }: TileParams, apiKey: string): string {
  return `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${z}/${x}/${y}.png?tileSize=256&key=${encodeURIComponent(apiKey)}`;
}

function textResponse(status: number, message: string, cache = 'no-store'): Response {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': cache } });
}

/** /api/speed-tile?z=12&x=702&y=1635 → a see-through PNG with colored road lines. */
export async function handleSpeedTileRequest(
  request: Request,
  deps: SpeedTileDeps = defaultSpeedTileDeps(),
): Promise<Response> {
  if (!speedTilesEnabled(deps.apiKey)) {
    // Cache the "not set up" answer briefly so a missing key doesn't hammer the function.
    return textResponse(503, 'Live traffic speeds are not set up (TOMTOM_API_KEY is missing).', 'public, s-maxage=60');
  }
  const tile = parseTileParams(new URL(request.url).searchParams);
  if (typeof tile === 'string') return textResponse(400, tile);

  try {
    const upstream = await deps.fetch(tomtomFlowTileUrl(tile, (deps.apiKey ?? '').trim()));
    if (!upstream.ok) {
      // Never pass TomTom's error text through: it can echo the key back.
      return textResponse(502, `Traffic speed service answered ${upstream.status}`);
    }
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'image/png', 'cache-control': SPEED_TILE_CACHE },
    });
  } catch {
    return textResponse(502, 'Traffic speed service could not be reached');
  }
}
