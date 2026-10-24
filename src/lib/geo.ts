import type { LatLon, Relation } from './types.js';

const EARTH_RADIUS_METERS = 6_371_000;
export const METERS_PER_MILE = 1609.344;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Normalize any angle to the range [0, 360). */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Great-circle distance between two points, in meters (haversine formula). */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing from `from` to `to`: 0 = north, 90 = east, 180 = south, 270 = west. */
export function bearingDeg(from: LatLon, to: LatLon): number {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lon - from.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalizeDeg(toDeg(Math.atan2(y, x)));
}

/** Smallest difference between two compass angles, in degrees: always 0–180. */
export function angleBetween(a: number, b: number): number {
  const diff = Math.abs(normalizeDeg(a) - normalizeDeg(b));
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Is a camera ahead of you, behind you, or off to the side?
 *
 * Picture a flashlight beam pointing the way you're driving. Anything inside the
 * beam (within `coneDeg` of your heading) is "ahead"; anything inside the same beam
 * pointed backwards is "behind"; everything else is "side".
 */
export function classifyRelation(
  me: LatLon,
  headingDeg: number,
  target: LatLon,
  coneDeg = 60,
): Relation {
  const offset = angleBetween(headingDeg, bearingDeg(me, target));
  if (offset <= coneDeg) return 'ahead';
  if (offset >= 180 - coneDeg) return 'behind';
  return 'side';
}

/** Turn a compass angle into a short label like "N", "NE", "SW". */
export function compassLabel(deg: number): string {
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return labels[Math.round(normalizeDeg(deg) / 45) % 8] ?? 'N';
}

export function formatDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}
