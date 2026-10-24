/**
 * "On my road" filter.
 *
 * When you switch it on, RoadCam only shows cameras on the highway it thinks you're
 * driving (from `guessCurrentRoute()`), so a busy interchange doesn't fill the Ahead
 * and Behind lists with cameras on the crossing roads.
 *
 * Example: you're on I-5 and the filter is on → I-5 cameras stay, SR-138 cameras go.
 */

/** Anything that carries a camera with a highway name, like the placed cameras in `App`. */
interface HasRoute {
  camera: { route: string };
}

/**
 * Keep only the items whose camera is on `route`.
 *
 * Returns the list unchanged when the filter is off, or when we don't know which
 * highway you're on (`route` is null or blank), so you never end up with an empty
 * screen just because the guess dropped out for a moment.
 * Route names are compared after trimming spaces, the same way `guessCurrentRoute()` reads them.
 */
export function filterToRoute<T extends HasRoute>(items: T[], route: string | null, enabled: boolean): T[] {
  const wanted = route?.trim() ?? '';
  if (!enabled || !wanted) return items;
  return items.filter((item) => item.camera.route.trim() === wanted);
}
