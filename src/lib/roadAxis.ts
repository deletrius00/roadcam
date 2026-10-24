/**
 * Which way does the highway run at a camera?
 *
 * Caltrans rarely says which way a camera points, but we can work out which way the ROAD
 * runs: highway cameras sit along the road, so the line to the nearest cameras on the same
 * highway follows it. That narrows a picture down to two possibilities (e.g. "looking north
 * or south"), and the taillight/headlight tip settles which one.
 *
 * Angles are "axis" degrees in 0–180: 0 = north–south, 90 = east–west.
 */
import { bearingDeg, distanceMeters } from './geo.js';
import type { Camera } from './types.js';

/** Ignore neighbours closer than this (same pole, other camera) or farther than this. */
const MIN_NEIGHBOUR_M = 150;
const MAX_NEIGHBOUR_M = 12_000;

/**
 * Road direction at `camera`, from up to two nearest cameras on the same route.
 * Returns null if there aren't any usable neighbours.
 */
export function roadAxis(camera: Camera, others: Camera[]): number | null {
  const route = camera.route.trim();
  if (!route) return null;
  const neighbours = others
    .filter((o) => o.id !== camera.id && o.route.trim() === route)
    .map((o) => ({ o, d: distanceMeters(camera, o) }))
    .filter(({ d }) => d >= MIN_NEIGHBOUR_M && d <= MAX_NEIGHBOUR_M)
    .sort((a, b) => a.d - b.d)
    .slice(0, 2);
  if (neighbours.length === 0) return null;

  // Average the directions as axes (a road heading 10° and one heading 190° are the same road).
  // Doubling the angle makes opposite directions line up, so they average correctly.
  let x = 0;
  let y = 0;
  for (const { o } of neighbours) {
    const doubled = (2 * bearingDeg(camera, o) * Math.PI) / 180;
    x += Math.cos(doubled);
    y += Math.sin(doubled);
  }
  if (Math.hypot(x, y) < 0.3) return null; // neighbours disagree (e.g. a sharp bend): don't guess
  const axis = ((Math.atan2(y, x) * 180) / Math.PI / 2 + 180) % 180;
  return Math.round(axis);
}

const AXIS_NAMES: Array<[string, string]> = [
  ['north', 'south'],
  ['northeast', 'southwest'],
  ['east', 'west'],
  ['southeast', 'northwest'],
];

/** 0–180 axis → the two directions along it, e.g. ["north", "south"]. */
export function axisDirections(axisDeg: number): [string, string] {
  const i = Math.round((((axisDeg % 180) + 180) % 180) / 45) % 4;
  return AXIS_NAMES[i]!;
}

/** "north–south", "east–west", … */
export function axisLabel(axisDeg: number): string {
  const [a, b] = axisDirections(axisDeg);
  return `${a}–${b}`;
}

