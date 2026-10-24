/**
 * "Which highway am I on?"
 *
 * We don't have a road map, but we do have cameras, and each camera knows its highway.
 * Highway cameras sit along the road, so the line between two cameras on the same
 * highway roughly traces that highway. If you're very close to such a line, you're
 * probably on that highway.
 *
 * Example: I-5 cameras at Gorman and at Lebec, and you're between them, a few hundred
 * meters from the straight line joining them → "On I-5".
 */
import type { Camera, LatLon } from './types.js';

/** How close (meters) you need to be to a highway's camera line to count as "on" it. */
export const ON_ROUTE_METERS = 800;
/** Only join cameras that are at most this far apart (meters), so lines follow the road. */
const MAX_SEGMENT_METERS = 25_000;

export interface RouteGuess {
  route: string;
  /** How far you are from that highway's camera line, in meters. */
  offRouteMeters: number;
  /** Nearest town on that highway, if known. */
  nearbyPlace: string;
}

/** Flat x/y in meters around `origin`. Accurate enough over a few dozen miles. */
function toLocal(origin: LatLon, p: LatLon): { x: number; y: number } {
  const metersPerDegLat = 110_574;
  const metersPerDegLon = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return { x: (p.lon - origin.lon) * metersPerDegLon, y: (p.lat - origin.lat) * metersPerDegLat };
}

/** Distance from the origin (0, 0) to the line segment a→b, in meters. */
function distanceToSegment(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSq));
  return Math.hypot(a.x + t * dx, a.y + t * dy);
}

export function guessCurrentRoute(me: LatLon, cameras: Camera[]): RouteGuess | null {
  const byRoute = new Map<string, Array<{ camera: Camera; pt: { x: number; y: number } }>>();
  for (const camera of cameras) {
    const route = camera.route.trim();
    if (!route) continue;
    const list = byRoute.get(route) ?? [];
    list.push({ camera, pt: toLocal(me, camera) });
    byRoute.set(route, list);
  }

  let best: RouteGuess | null = null;
  for (const [route, list] of byRoute) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      // A camera right next to you counts on its own.
      const single = Math.hypot(a.pt.x, a.pt.y);
      if (single <= ON_ROUTE_METERS && (!best || single < best.offRouteMeters)) {
        best = { route, offRouteMeters: single, nearbyPlace: a.camera.nearbyPlace };
      }
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        if (Math.hypot(b.pt.x - a.pt.x, b.pt.y - a.pt.y) > MAX_SEGMENT_METERS) continue;
        const d = distanceToSegment(a.pt, b.pt);
        if (d <= ON_ROUTE_METERS && (!best || d < best.offRouteMeters)) {
          const closer = Math.hypot(a.pt.x, a.pt.y) <= Math.hypot(b.pt.x, b.pt.y) ? a : b;
          best = { route, offRouteMeters: d, nearbyPlace: closer.camera.nearbyPlace };
        }
      }
    }
  }
  return best;
}
