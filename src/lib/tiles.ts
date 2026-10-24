/**
 * Map math, with no map library.
 *
 * A web map is a giant picture of the world, cut into 256×256 squares ("tiles").
 * At zoom 0 the whole world is one tile; each zoom level doubles the width, so at
 * zoom z the world is 256·2^z pixels wide. These functions convert between
 * GPS coordinates and pixels on that giant picture (the "Web Mercator" projection
 * every online map uses), and work out which tiles are on screen.
 */
import type { LatLon } from './types.js';

export const TILE_SIZE = 256;
export const MIN_ZOOM = 4;
export const MAX_ZOOM = 17;

/** Meters per pixel at the equator at zoom 0. */
const EQUATOR_M_PER_PX = 156_543.033_92;

export interface Point {
  x: number;
  y: number;
}

/** GPS coordinates → pixel position on the world picture at `zoom`. */
export function project(p: LatLon, zoom: number): Point {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const sin = Math.min(Math.max(Math.sin((p.lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: ((p.lon + 180) / 360) * worldSize,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldSize,
  };
}

/** Pixel position on the world picture at `zoom` → GPS coordinates. */
export function unproject(pt: Point, zoom: number): LatLon {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * pt.y) / worldSize;
  return {
    lat: (180 / Math.PI) * Math.atan(Math.sinh(n)),
    lon: (pt.x / worldSize) * 360 - 180,
  };
}

/** How many real-world meters one screen pixel covers at this latitude and zoom. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (EQUATOR_M_PER_PX * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom)));
}

/**
 * The closest zoom where a circle of `radiusMeters` around the center fits on screen.
 * `viewportPx` is the smaller side of the map, in pixels.
 */
export function zoomForRadius(lat: number, radiusMeters: number, viewportPx: number): number {
  if (radiusMeters <= 0 || viewportPx <= 0) return MAX_ZOOM;
  const wantedMetersPerPx = radiusMeters / (viewportPx * 0.45); // leave a small margin
  const exact = Math.log2((EQUATOR_M_PER_PX * Math.cos((lat * Math.PI) / 180)) / wantedMetersPerPx);
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.floor(exact)));
}

export interface Tile {
  /** Unique key for React. */
  key: string;
  z: number;
  /** Tile column, wrapped into 0…2^z−1 (used to build the image URL). */
  x: number;
  y: number;
  /** Where to draw the tile, in pixels from the map's top-left corner. */
  left: number;
  top: number;
}

/** All tiles needed to cover a `width`×`height` view centered on `center` (world pixels). */
export function visibleTiles(center: Point, zoom: number, width: number, height: number): Tile[] {
  if (width <= 0 || height <= 0) return [];
  const count = 2 ** zoom;
  const viewLeft = center.x - width / 2;
  const viewTop = center.y - height / 2;
  const x0 = Math.floor(viewLeft / TILE_SIZE);
  const x1 = Math.floor((viewLeft + width) / TILE_SIZE);
  const y0 = Math.max(0, Math.floor(viewTop / TILE_SIZE));
  const y1 = Math.min(count - 1, Math.floor((viewTop + height) / TILE_SIZE));

  const tiles: Tile[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const wrappedX = ((tx % count) + count) % count; // the world repeats left/right
      tiles.push({
        key: `${zoom}/${tx}/${ty}`,
        z: zoom,
        x: wrappedX,
        y: ty,
        left: Math.round(tx * TILE_SIZE - viewLeft),
        top: Math.round(ty * TILE_SIZE - viewTop),
      });
    }
  }
  return tiles;
}

/**
 * Image URL for a tile. Uses CARTO's free basemaps (built from OpenStreetMap data),
 * which come in light and dark styles. Attribution is shown on the map.
 */
export function tileUrl(tile: Tile, dark: boolean, retina: boolean): string {
  const subdomain = 'abcd'[(tile.x + tile.y) % 4] ?? 'a';
  const style = dark ? 'dark_all' : 'light_all';
  return `https://${subdomain}.basemaps.cartocdn.com/${style}/${tile.z}/${tile.x}/${tile.y}${retina ? '@2x' : ''}.png`;
}

/**
 * SVG path for a pie slice ("wedge") — used to draw the ahead/behind zones.
 * Angles are compass degrees (0 = up/north, 90 = right/east), going clockwise.
 */
export function wedgePath(cx: number, cy: number, radius: number, fromDeg: number, toDeg: number): string {
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${(cx + radius * Math.sin(rad)).toFixed(1)} ${(cy - radius * Math.cos(rad)).toFixed(1)}`;
  };
  const sweep = (((toDeg - fromDeg) % 360) + 360) % 360;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${point(fromDeg)} A ${radius.toFixed(1)} ${radius.toFixed(1)} 0 ${largeArc} 1 ${point(toDeg)} Z`;
}
