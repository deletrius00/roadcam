/**
 * Picking the "Next camera": the one picture most worth a glance, shown big above the lists.
 *
 * Pure logic (no React) so it can be unit tested. It works on anything that carries a camera
 * and a live distance, which is what `App` already has for every camera it shows.
 */

interface Candidate {
  camera: { unavailable: boolean };
  /** Live distance from you, in meters. */
  distance: number;
}

export interface NextCameraSplit<T> {
  /** The camera to show as the big "Next camera" card, or null when there are none ahead. */
  next: T | null;
  /** Every other camera ahead, in the same order as given, without `next`. */
  rest: T[];
}

/**
 * Choose the closest camera ahead and take it out of the list, so it isn't shown twice.
 *
 * A working camera always beats an offline one (a big grey "Temporarily Unavailable" card
 * helps nobody), so we only fall back to an offline camera when every camera ahead is offline.
 * Ties keep the earlier camera, so the result doesn't flicker between equal choices.
 */
export function splitNextCamera<T extends Candidate>(ahead: readonly T[]): NextCameraSplit<T> {
  let best: T | null = null;
  for (const item of ahead) {
    if (best === null || isBetter(item, best)) best = item;
  }
  return { next: best, rest: ahead.filter((item) => item !== best) };
}

function isBetter(a: Candidate, b: Candidate): boolean {
  if (a.camera.unavailable !== b.camera.unavailable) return !a.camera.unavailable;
  return a.distance < b.distance;
}
