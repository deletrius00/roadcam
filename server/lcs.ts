/**
 * Caltrans Lane Closure System (LCS): every planned closure on California state highways,
 * from right now to about 7 days ahead, one JSON file per district.
 *
 * Each record says where (begin/end with lat/lon), what (lane, full, ramp), why (type of
 * work), when (start/end time) and what actually happened, using CHP radio codes:
 *   - code1097 true  → the closure has started ("10-97" = arrived on scene)
 *   - code1098 true  → it's finished ("10-98" = done)
 *   - code1022 true  → it was cancelled ("10-22" = disregard)
 *
 * The files are big (Los Angeles is ~15 MB), so callers only load the nearby districts
 * and cache them (see traffic.ts).
 */
import { pacificToIso } from './caltrans.js';
import type { Closure } from '../src/lib/types.js';

export function lcsFeedUrl(district: number): string {
  const padded = String(district).padStart(2, '0');
  return `https://cwwp2.dot.ca.gov/data/d${district}/lcs/lcsStatusD${padded}.json`;
}

/** How far ahead we show upcoming closures. */
export const UPCOMING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface RawEnd {
  [key: string]: string | undefined;
}

interface RawLcs {
  lcs?: {
    index?: string;
    location?: { travelFlowDirection?: string; begin?: RawEnd; end?: RawEnd };
    closure?: {
      closureTimestamp?: Record<string, string | undefined>;
      facility?: string;
      typeOfClosure?: string;
      typeOfWork?: string;
      lanesClosed?: string;
      totalExistingLanes?: string;
      code1097?: { isCode1097?: string };
      code1098?: { isCode1098?: string };
      code1022?: { isCode1022?: string };
    };
  };
}

const yes = (v: string | undefined) => v === 'true';

/** Epoch seconds as a string → ISO 8601, or null. */
function epochToIso(value: string | undefined): string | null {
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

/** "Full" → "Full closure", "Lane" → "Lane closure", others kept but readable. */
export function closureWhat(type: string | undefined): string {
  switch ((type ?? '').trim()) {
    case 'Full':
      return 'Full closure';
    case 'Lane':
      return 'Lane closure';
    case 'Moving':
      return 'Moving closure';
    case 'One-Way Traffic':
      return 'One-way traffic control';
    case 'Traffic Break':
      return 'Traffic break';
    default:
      return 'Closure';
  }
}

/** "Off Ramp" → "Off ramp", "Conventional Hwy" → "Highway". */
function facilityLabel(facility: string | undefined): string {
  const f = (facility ?? '').trim();
  if (!f || f === 'Mainline' || f === 'Conventional Hwy') return 'Highway';
  return f.charAt(0) + f.slice(1).toLowerCase();
}

/** "1, 2" of "4" → "1, 2 of 4"; "All" stays "All". */
function lanesLabel(closed: string | undefined, total: string | undefined): string {
  const c = (closed ?? '').trim();
  if (!c) return '';
  if (/^all$/i.test(c)) return 'All lanes';
  const t = (total ?? '').trim();
  return t ? `Lanes ${c} of ${t}` : `Lanes ${c}`;
}

/** Sentence case for "Pavement Work" → "Pavement work". */
function sentence(text: string | undefined): string {
  const t = (text ?? '').trim();
  return t ? t.charAt(0) + t.slice(1).toLowerCase() : '';
}

/**
 * Parse one district's LCS feed into closures that matter to a driver:
 * not cancelled, not finished, not already past their end time, and starting within
 * the next 7 days.
 */
export function parseLaneClosures(json: unknown, now: number): Array<Omit<Closure, 'distanceMeters'>> {
  const data = (json as { data?: RawLcs[] } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: Array<Omit<Closure, 'distanceMeters'>> = [];
  for (const record of data) {
    const r = record.lcs;
    const c = r?.closure;
    const begin = r?.location?.begin;
    if (!r || !c || !begin) continue;
    if (yes(c.code1022?.isCode1022) || yes(c.code1098?.isCode1098)) continue; // cancelled or done

    const lat = Number(begin.beginLatitude);
    const lon = Number(begin.beginLongitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) < 1 || Math.abs(lon) < 1) continue;

    const ts = c.closureTimestamp ?? {};
    const startsAt = epochToIso(ts.closureStartEpoch) ?? pacificToIso(ts.closureStartDate ?? '', ts.closureStartTime ?? '');
    if (!startsAt) continue;
    const indefinite = yes(ts.isClosureEndIndefinite);
    const endsAt = indefinite ? null : epochToIso(ts.closureEndEpoch);
    if (endsAt && Date.parse(endsAt) <= now) continue; // already over
    const started = yes(c.code1097?.isCode1097);
    if (!started && Date.parse(startsAt) > now + UPCOMING_WINDOW_MS) continue; // too far ahead

    const end = r.location?.end ?? {};
    const from = (begin.beginLocationName ?? '').trim();
    const to = (end.endLocationName ?? '').trim();
    const town = (begin.beginNearbyPlace ?? '').trim();
    const stretch = from && to && to !== from && !/route\s*\d/i.test(to) ? `${from} to ${to}` : from || to;
    const dir = (r.location?.travelFlowDirection ?? '').trim();

    out.push({
      id: `lcs-${r.index ?? `${lat},${lon},${startsAt}`}`,
      route: (begin.beginRoute ?? '').trim(),
      direction: /^(North|South|East|West)$/.test(dir) ? `${dir}bound` : '',
      what: closureWhat(c.typeOfClosure),
      facility: facilityLabel(c.facility),
      work: sentence(c.typeOfWork),
      place: [stretch, town].filter(Boolean).join(', '),
      lanes: lanesLabel(c.lanesClosed, c.totalExistingLanes),
      startsAt,
      endsAt,
      status: started ? 'active' : 'upcoming',
      source: 'Caltrans',
      lat,
      lon,
    });
  }
  return out;
}
