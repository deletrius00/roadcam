import { describe, expect, it } from 'vitest';
import {
  handleSpeedTileRequest,
  parseTileParams,
  SPEED_TILE_CACHE,
  speedTilesEnabled,
  tomtomFlowTileUrl,
  type SpeedTileDeps,
} from '../server/speedTiles';

const KEY = 'test-key-123';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

/** A fake fetch that records the URLs it was asked for (tests never touch the real internet). */
function deps(options: { apiKey?: string; status?: number; fail?: boolean } = {}) {
  const urls: string[] = [];
  const d: SpeedTileDeps = {
    apiKey: 'apiKey' in options ? options.apiKey : KEY,
    fetch: (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      if (options.fail) throw new Error('network down');
      if (options.status && options.status !== 200) return new Response(`bad key ${KEY}`, { status: options.status });
      return new Response(PNG, { headers: { 'content-type': 'image/png' } });
    }) as typeof fetch,
  };
  return { d, urls };
}

const call = (query: string, d: SpeedTileDeps) =>
  handleSpeedTileRequest(new Request(`http://localhost/api/speed-tile?${query}`), d);

describe('parseTileParams', () => {
  it('accepts a normal tile', () => {
    expect(parseTileParams(new URLSearchParams('z=12&x=702&y=1635'))).toEqual({ z: 12, x: 702, y: 1635 });
  });

  it.each([
    ['', 'missing values'],
    ['z=12&x=702', 'missing y'],
    ['z=12&x=-1&y=5', 'negative'],
    ['z=12&x=1.5&y=5', 'not whole'],
    ['z=99&x=0&y=0', 'zoom too high'],
    ['z=1&x=0&y=0', 'zoom too low'],
    ['z=12&x=4096&y=0', 'x off the edge of the world'],
    ['z=12&x=0&y=4096', 'y off the edge of the world'],
  ])('rejects %s (%s)', (query) => {
    expect(typeof parseTileParams(new URLSearchParams(query))).toBe('string');
  });
});

describe('tomtomFlowTileUrl', () => {
  it('asks TomTom for the relative-speed flow tile', () => {
    expect(tomtomFlowTileUrl({ z: 12, x: 702, y: 1635 }, KEY)).toBe(
      'https://api.tomtom.com/traffic/map/4/tile/flow/relative0/12/702/1635.png?tileSize=256&key=test-key-123',
    );
  });
});

describe('speedTilesEnabled', () => {
  it('is on only when a key is set', () => {
    expect(speedTilesEnabled(KEY)).toBe(true);
    expect(speedTilesEnabled('')).toBe(false);
    expect(speedTilesEnabled('   ')).toBe(false);
    expect(speedTilesEnabled(undefined)).toBe(false);
  });
});

describe('handleSpeedTileRequest', () => {
  it('returns the picture with a short shared cache', async () => {
    const { d, urls } = deps();
    const res = await call('z=12&x=702&y=1635&t=5', d);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe(SPEED_TILE_CACHE);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    expect(urls).toEqual([tomtomFlowTileUrl({ z: 12, x: 702, y: 1635 }, KEY)]);
  });

  it('says "not set up" (503) without calling TomTom when there is no key', async () => {
    const { d, urls } = deps({ apiKey: undefined });
    const res = await call('z=12&x=702&y=1635', d);
    expect(res.status).toBe(503);
    expect(urls).toEqual([]);
  });

  it('rejects bad tile numbers (400) without calling TomTom', async () => {
    const { d, urls } = deps();
    const res = await call('z=12&x=nope&y=1', d);
    expect(res.status).toBe(400);
    expect(urls).toEqual([]);
  });

  it('turns a TomTom error into 502 and never repeats the key back', async () => {
    const { d } = deps({ status: 403 });
    const res = await call('z=12&x=702&y=1635', d);
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain(KEY);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('turns a network failure into 502', async () => {
    const { d } = deps({ fail: true });
    const res = await call('z=12&x=702&y=1635', d);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain(KEY);
  });
});
