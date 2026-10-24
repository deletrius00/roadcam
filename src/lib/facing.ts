/**
 * Which way is a camera pointing, and which lanes in its picture are going your way?
 *
 * Caltrans rarely publishes this (about 4% of cameras statewide, checked Oct 2026), and when
 * it does it's buried in the name, e.g. "SR-20 : At SR-1 - Looking East (C020)" or
 * "T252W -- SR-123 : Ashby Avenue - Looking West". Labels like "NB"/"SB" describe the
 * roadway or side of the road, NOT where the camera points, so we don't guess from those.
 *
 * Reading a picture: in the US traffic drives on the right, so when a camera looks along
 * a road, traffic moving AWAY from it is on the right side of the image and traffic
 * coming TOWARD it is on the left.
 */
import { angleBetween } from './geo.js';

export type Compass = 'North' | 'South' | 'East' | 'West';

const DEGREES: Record<Compass, number> = { North: 0, East: 90, South: 180, West: 270 };
const LETTER: Record<string, Compass> = { n: 'North', s: 'South', e: 'East', w: 'West' };

export function compassDegrees(c: Compass): number {
  return DEGREES[c];
}

export function opposite(c: Compass): Compass {
  return ({ North: 'South', South: 'North', East: 'West', West: 'East' } as const)[c];
}

/** Finds "Looking East", "Look North Zoom", "looking s" … in any of the given texts. */
export function parseFacing(...texts: Array<string | undefined | null>): Compass | null {
  for (const text of texts) {
    const m = /\blook(?:ing)?\s+(north|south|east|west|[nsew])\b/i.exec(text ?? '');
    if (m) {
      const word = m[1]!.toLowerCase();
      return LETTER[word.charAt(0)] ?? null;
    }
  }
  return null;
}

export interface LaneGuide {
  facing: Compass;
  /** Direction of traffic on the right side of the picture (moving away from the camera). */
  away: Compass;
  /** Direction of traffic on the left side of the picture (coming toward the camera). */
  toward: Compass;
  /** Which side of the picture is going the same way as you, if we can tell. */
  yourSide: 'away' | 'toward' | null;
}

/**
 * Explain a camera picture's lanes. Returns null if we don't know where the camera points.
 * `heading` is your direction of travel in degrees (null if unknown).
 */
export function laneGuide(facing: Compass | null, heading: number | null): LaneGuide | null {
  if (!facing) return null;
  let yourSide: LaneGuide['yourSide'] = null;
  if (heading !== null) {
    const diff = angleBetween(heading, DEGREES[facing]);
    if (diff <= 60) yourSide = 'away';
    else if (diff >= 120) yourSide = 'toward';
  }
  return { facing, away: facing, toward: opposite(facing), yourSide };
}

/** "North" → "Northbound". */
export function bound(c: Compass): string {
  return `${c}bound`;
}
