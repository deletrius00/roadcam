import { beforeEach, describe, expect, it } from 'vitest';
import { clearFeedCache, handleCamerasRequest, type HandlerDeps } from '../server/handler';
import { clearImageTimeCache } from '../server/imageTime';
import type { CamerasResponse } from '../src/lib/types';
import sample from './fixtures/caltrans-sample.json';
import jpegs from './fixtures/jpeg-samples.json';

const NOW = Date.parse('2026-10-23T22:00:00Z');
const NEAR_TEMPLIN = 'lat=34.55&lon=-118.64';

/**
 * A fake `fetch` so tests never touch the real internet.
 * - District 7 returns the sample fixture; other districts return an empty feed.
 * - Image requests return a Last-Modified header and real picture bytes (unless told to fail).
 *   Templin's camera serves a real picture; Gorman's serves a "Temporarily Unavailable" card.
 */
function fakeFetch(options: { failDistricts?: number[]; imageHeadFails?: boolean } = {}) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);

    const district = /cctvStatusD(\d{2})\.json$/.exec(url);
    if (district) {
      const d = Number(district[1]);
      if (options.failDistricts?.includes(d)) return new Response('nope', { status: 503 });
      return Response.json(d === 7 ? sample : { data: [] });
    }

    if (url.endsWith('.jpg')) {
      if (options.imageHeadFails) throw new Error('network down');
      const picture = url.includes('gorman') ? jpegs.placeholder_1 : jpegs.real_1;
      return new Response(Buffer.from(picture, 'base64'), {
        status: 206,
        headers: { 'last-modified': 'Fri, 23 Oct 2026 21:58:00 GMT' },
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fn, calls };
}

function deps(fetchFn: typeof fetch): HandlerDeps {
  return { fetch: fetchFn, now: () => NOW };
}

async function call(query: string, d: HandlerDeps) {
  const response = await handleCamerasRequest(new Request(`http://localhost/api/cameras?${query}`), d);
  return { status: response.status, body: (await response.json()) as CamerasResponse & { error?: string; field?: string } };
}

beforeEach(() => {
  clearFeedCache();
  clearImageTimeCache();
});

describe('GET /api/cameras validation', () => {
  const cases: Array<[string, string]> = [
    ['', 'lat'],
    ['lat=abc&lon=-118', 'lat'],
    ['lat=91&lon=-118', 'lat'],
    ['lat=34', 'lon'],
    ['lat=34&lon=-181', 'lon'],
    ['lat=34&lon=-118&radius=0', 'radius'],
    ['lat=34&lon=-118&radius=500', 'radius'],
  ];
  it.each(cases)('rejects "%s" with a 400 naming the %s field', async (query, field) => {
    const { status, body } = await call(query, deps(fakeFetch().fn));
    expect(status).toBe(400);
    expect(body.field).toBe(field);
  });
});

describe('GET /api/cameras results', () => {
  it('returns nearby cameras closest first, using Last-Modified for image age', async () => {
    const { status, body } = await call(`${NEAR_TEMPLIN}&radius=50`, deps(fakeFetch().fn));
    expect(status).toBe(200);
    expect(body.cameras.map((c) => c.name)).toEqual(['I-5 : Templin Hwy', 'I-5 : Gorman']);
    expect(body.cameras[0]?.distanceMeters).toBeLessThan(1000);
    expect(body.cameras[0]).toMatchObject({
      imageTakenAt: '2026-10-23T21:58:00.000Z',
      imageTimeSource: 'last-modified',
    });
  });

  it('flags cameras that are serving a "Temporarily Unavailable" card', async () => {
    const { body } = await call(`${NEAR_TEMPLIN}&radius=50`, deps(fakeFetch().fn));
    const byName = Object.fromEntries(body.cameras.map((c) => [c.name, c.unavailable]));
    expect(byName).toEqual({ 'I-5 : Templin Hwy': false, 'I-5 : Gorman': true });
  });

  it('only downloads the first few KB of each image', async () => {
    const seen: Array<string | null> = [];
    const base = fakeFetch().fn;
    const spy = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('.jpg')) seen.push(new Headers(init?.headers).get('range'));
      return base(input, init);
    }) as typeof fetch;
    await call(NEAR_TEMPLIN, deps(spy));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((r) => r === 'bytes=0-2999')).toBe(true);
  });

  it('filters by radius', async () => {
    const { body } = await call(`${NEAR_TEMPLIN}&radius=5`, deps(fakeFetch().fn));
    expect(body.cameras.map((c) => c.name)).toEqual(['I-5 : Templin Hwy']);
  });

  it('falls back to the record timestamp when the image HEAD request fails', async () => {
    const { body } = await call(NEAR_TEMPLIN, deps(fakeFetch({ imageHeadFails: true }).fn));
    expect(body.cameras[0]).toMatchObject({
      imageTakenAt: '2026-07-15T21:30:00.000Z',
      imageTimeSource: 'record',
    });
  });

  it('still works when some districts are down, and says which', async () => {
    const { status, body } = await call(NEAR_TEMPLIN, deps(fakeFetch({ failDistricts: [3, 11] }).fn));
    expect(status).toBe(200);
    expect(body.cameras.length).toBeGreaterThan(0);
    expect(body.warnings).toEqual([
      'Caltrans district 3 unavailable',
      'Caltrans district 11 unavailable',
    ]);
  });

  it('returns 502 when every district is down', async () => {
    const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const { status } = await call(NEAR_TEMPLIN, deps(fakeFetch({ failDistricts: all }).fn));
    expect(status).toBe(502);
  });

  it('caches district feeds between requests', async () => {
    const fake = fakeFetch();
    await call(NEAR_TEMPLIN, deps(fake.fn));
    await call(NEAR_TEMPLIN, deps(fake.fn));
    const feedCalls = fake.calls.filter((c) => c.includes('cctvStatusD07'));
    expect(feedCalls).toHaveLength(1);
  });
});

describe('GET /api/cameras demo mode', () => {
  it('returns demo cameras without calling Caltrans', async () => {
    const fake = fakeFetch();
    const { status, body } = await call('lat=34.6&lon=-118.7&radius=50&demo=1', deps(fake.fn));
    expect(status).toBe(200);
    expect(fake.calls).toHaveLength(0);
    expect(body.cameras.length).toBeGreaterThan(3);
    expect(body.cameras.every((c) => c.imageTimeSource === 'demo')).toBe(true);
  });
});
