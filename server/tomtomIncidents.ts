/**
 * TomTom Traffic Incidents: crashes, jams, debris and other dangers, fog/rain/ice/wind,
 * flooding, broken-down vehicles, road works and closures, now and scheduled.
 * Covers California, Washington and everywhere else. Uses the same TOMTOM_API_KEY as the
 * speed colors (server/speedTiles.ts); without a key this source is simply skipped.
 *
 * TomTom also reports every city street, so we keep only incidents on numbered highways
 * (TomTom fills in `roadNumbers`, e.g. ["I-5 S", "Golden State Fwy S"], only for those).
 * One request may cover at most 10,000 km², so we ask about a box of up to ~95 km a side
 * around you.
 */
import type { Closure, Incident } from '../src/lib/types.js';

const FIELDS =
  '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,timeValidity}}}';

/** Half the side of the box we ask about, in km (TomTom's limit is 10,000 km² per request). */
export const MAX_HALF_SIDE_KM = 47;

/** TomTom's request URL for a box around `center`, reaching `radiusMeters` (capped). */
export function tomtomIncidentsUrl(center: { lat: number; lon: number }, radiusMeters: number, apiKey: string): string {
  const halfKm = Math.min(MAX_HALF_SIDE_KM, Math.max(5, radiusMeters / 1000));
  const dLat = halfKm / 111.32;
  const dLon = halfKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  const bbox = [center.lon - dLon, center.lat - dLat, center.lon + dLon, center.lat + dLat].map((n) => n.toFixed(4)).join(',');
  return (
    `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${bbox}` +
    `&fields=${encodeURIComponent(FIELDS)}&language=en-US&timeValidityFilter=present,future&key=${encodeURIComponent(apiKey)}`
  );
}

/** TomTom's icon categories → our plain-English kinds. */
export const TOMTOM_KIND: Record<number, string> = {
  0: 'Incident',
  1: 'Crash',
  2: 'Fog',
  3: 'Hazard',
  4: 'Rain',
  5: 'Ice',
  6: 'Traffic jam',
  7: 'Lane closure',
  8: 'Road closure',
  9: 'Roadwork',
  10: 'Wind',
  11: 'Flooding',
  14: 'Stalled vehicle',
};

interface RawIncident {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: {
    id?: string;
    iconCategory?: number;
    magnitudeOfDelay?: number;
    events?: Array<{ description?: string }>;
    startTime?: string | null;
    endTime?: string | null;
    from?: string;
    to?: string;
    delay?: number | null;
    roadNumbers?: string[];
    timeValidity?: string;
  };
}

/** The first point of a Point or LineString geometry. */
function firstPoint(geometry: RawIncident['geometry']): { lat: number; lon: number } | null {
  const c = geometry?.coordinates;
  const pair = geometry?.type === 'Point' ? c : Array.isArray(c) ? c[0] : null;
  if (!Array.isArray(pair) || pair.length < 2) return null;
  const [lon, lat] = pair as number[];
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat: lat!, lon: lon! } : null;
}

const DIRECTION: Record<string, string> = { N: 'Northbound', S: 'Southbound', E: 'Eastbound', W: 'Westbound' };

/** ["Golden State Fwy S", "I-5 S"] → { route: "I-5", direction: "Southbound" }. Prefers the numbered name. */
export function routeFromRoadNumbers(names: string[] = []): { route: string; direction: string } {
  const numbered = names.find((n) => /^(I|US|CA|SR|WA)-\d/i.test(n)) ?? names[0] ?? '';
  const m = /^(.*?)(?:\s+([NSEW]))?$/.exec(numbered.trim());
  const route = (m?.[1] ?? '').replace(/^CA-/i, 'SR-').replace(/^WA-/i, 'SR ');
  return { route, direction: DIRECTION[m?.[2] ?? ''] ?? '' };
}

export interface TomtomResult {
  incidents: Array<Omit<Incident, 'distanceMeters'>>;
  closures: Array<Omit<Closure, 'distanceMeters'>>;
}

/**
 * Split TomTom's answer into live incidents (crashes, jams, hazards, weather) and
 * closures/roadwork (now and scheduled). Only highway incidents are kept, and small
 * jams (TomTom "minor", magnitude 1) are skipped.
 */
export function parseTomtomIncidents(json: unknown): TomtomResult {
  const list = (json as { incidents?: RawIncident[] } | null)?.incidents;
  const result: TomtomResult = { incidents: [], closures: [] };
  if (!Array.isArray(list)) return result;
  for (const raw of list) {
    const p = raw.properties;
    const point = firstPoint(raw.geometry);
    if (!p || !point || !p.roadNumbers?.length) continue;
    const kind = TOMTOM_KIND[p.iconCategory ?? 0] ?? 'Incident';
    if (kind === 'Traffic jam' && (p.magnitudeOfDelay ?? 0) < 2) continue;
    const { route, direction } = routeFromRoadNumbers(p.roadNumbers);
    const what = (p.events ?? []).map((e) => e.description?.trim()).filter(Boolean).join(', ') || kind;
    const from = (p.from ?? '').replace(/\s*\([^)]*\)/g, '').trim();
    const to = (p.to ?? '').replace(/\s*\([^)]*\)/g, '').trim();
    const place = from && to && from !== to ? `${from} to ${to}` : from || to;
    const id = `tomtom-${p.id ?? `${point.lat},${point.lon}`}`;

    if (kind === 'Road closure' || kind === 'Lane closure' || kind === 'Roadwork') {
      if (!p.startTime) continue;
      result.closures.push({
        id,
        route,
        direction,
        what: kind === 'Roadwork' ? 'Roadwork' : kind === 'Road closure' ? 'Full closure' : 'Lane closure',
        facility: 'Highway',
        work: what,
        place,
        lanes: '',
        startsAt: p.startTime,
        endsAt: p.endTime ?? null,
        status: p.timeValidity === 'future' ? 'upcoming' : 'active',
        source: 'TomTom',
        ...point,
      });
      continue;
    }
    if (p.timeValidity === 'future') continue; // a future crash makes no sense; skip oddities
    result.incidents.push({
      id,
      kind,
      description: what,
      location: [route && `${route}${direction ? ` ${direction.toLowerCase()}` : ''}`, place].filter(Boolean).join(' · '),
      startedAt: p.startTime ?? null,
      source: 'TomTom',
      delaySeconds: typeof p.delay === 'number' ? p.delay : null,
      ...point,
    });
  }
  return result;
}
