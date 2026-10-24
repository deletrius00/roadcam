import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  TILE_SIZE,
  clampZoom,
  metersPerPixel,
  project,
  tileUrl,
  unproject,
  visibleTiles,
  wedgePath,
  zoomForRadius,
} from '../src/lib/tiles';

describe('project / unproject', () => {
  it('puts lat 0, lon 0 in the middle of the world', () => {
    expect(project({ lat: 0, lon: 0 }, 0)).toEqual({ x: 128, y: 128 });
  });

  it('doubles pixel positions with each zoom level', () => {
    const z10 = project({ lat: 34.8, lon: -118.9 }, 10);
    const z11 = project({ lat: 34.8, lon: -118.9 }, 11);
    expect(z11.x).toBeCloseTo(z10.x * 2, 6);
    expect(z11.y).toBeCloseTo(z10.y * 2, 6);
  });

  it('round-trips GPS coordinates', () => {
    const p = { lat: 34.8203, lon: -118.861 };
    const back = unproject(project(p, 14), 14);
    expect(back.lat).toBeCloseTo(p.lat, 8);
    expect(back.lon).toBeCloseTo(p.lon, 8);
  });

  it('matches a known tile: Los Angeles at zoom 10 is tile x=175, y=408', () => {
    const pt = project({ lat: 34.0522, lon: -118.2437 }, 10);
    expect(Math.floor(pt.x / TILE_SIZE)).toBe(175);
    expect(Math.floor(pt.y / TILE_SIZE)).toBe(408);
  });
});

describe('metersPerPixel / zoomForRadius', () => {
  it('is ~156 km per pixel at the equator at zoom 0, halving per zoom', () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(156_543, 0);
    expect(metersPerPixel(0, 1)).toBeCloseTo(78_271.5, 0);
  });

  it('zooms out for bigger radiuses', () => {
    const near = zoomForRadius(34.8, 10 * 1609, 400);
    const far = zoomForRadius(34.8, 50 * 1609, 400);
    expect(far).toBeLessThan(near);
  });

  it('chooses a zoom where the radius actually fits', () => {
    const radius = 25 * 1609;
    const z = zoomForRadius(34.8, radius, 400);
    expect(radius / metersPerPixel(34.8, z)).toBeLessThanOrEqual(400 * 0.45 + 0.001);
    expect(radius / metersPerPixel(34.8, z + 1)).toBeGreaterThan(400 * 0.45);
  });

  it('stays within the allowed zoom range', () => {
    expect(zoomForRadius(34.8, 1, 400)).toBe(MAX_ZOOM);
    expect(zoomForRadius(34.8, 40_000_000, 400)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(-3)).toBe(MIN_ZOOM);
  });
});

describe('visibleTiles', () => {
  it('covers the whole view with no gaps', () => {
    const center = project({ lat: 34.8, lon: -118.9 }, 12);
    const tiles = visibleTiles(center, 12, 600, 400);
    const minLeft = Math.min(...tiles.map((t) => t.left));
    const minTop = Math.min(...tiles.map((t) => t.top));
    const maxRight = Math.max(...tiles.map((t) => t.left + TILE_SIZE));
    const maxBottom = Math.max(...tiles.map((t) => t.top + TILE_SIZE));
    expect(minLeft).toBeLessThanOrEqual(0);
    expect(minTop).toBeLessThanOrEqual(0);
    expect(maxRight).toBeGreaterThanOrEqual(600);
    expect(maxBottom).toBeGreaterThanOrEqual(400);
    expect(new Set(tiles.map((t) => t.key)).size).toBe(tiles.length);
  });

  it('wraps tile columns around the date line', () => {
    const tiles = visibleTiles({ x: 0, y: 512 }, 2, 300, 100); // view straddles x=0
    expect(tiles.every((t) => t.x >= 0 && t.x < 4)).toBe(true);
    expect(tiles.some((t) => t.x === 3)).toBe(true);
  });

  it('returns nothing for an empty view', () => {
    expect(visibleTiles({ x: 0, y: 0 }, 5, 0, 300)).toEqual([]);
  });

  it('builds light, dark and retina tile URLs', () => {
    const [tile] = visibleTiles(project({ lat: 34.8, lon: -118.9 }, 12), 12, 10, 10);
    expect(tile).toBeDefined();
    expect(tileUrl(tile!, false, false)).toMatch(/^https:\/\/[abcd]\.basemaps\.cartocdn\.com\/light_all\/12\/\d+\/\d+\.png$/);
    expect(tileUrl(tile!, true, true)).toMatch(/\/dark_all\/12\/\d+\/\d+@2x\.png$/);
  });
});

describe('wedgePath', () => {
  it('draws a slice pointing up for heading 0', () => {
    expect(wedgePath(100, 100, 50, -60, 60)).toBe('M 100.0 100.0 L 56.7 75.0 A 50.0 50.0 0 0 1 143.3 75.0 Z');
  });

  it('uses the large-arc flag for slices over 180°', () => {
    expect(wedgePath(0, 0, 10, 0, 270)).toContain(' 0 1 1 ');
  });
});
