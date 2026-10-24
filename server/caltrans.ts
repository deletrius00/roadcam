/**
 * Caltrans CCTV data source.
 *
 * Caltrans publishes one JSON file per district (12 districts cover California).
 * Field reference: https://cwwp2.dot.ca.gov/documentation/cctv/cctv-field-description.htm
 *
 * Shape (abridged):
 * { "data": [ { "cctv": {
 *     "index": "17",
 *     "recordTimestamp": { "recordDate": "2026-10-23", "recordTime": "21:58:03" },  // Pacific time
 *     "location": { "district": 7, "locationName": "...", "nearbyPlace": "...",
 *                   "longitude": -118.2, "latitude": 34.1, "direction": "North",
 *                   "county": "Los Angeles", "route": "I-5", ... },
 *     "inService": "true",
 *     "imageData": { "imageDescription": "...", "streamingVideoURL": "...",
 *                    "static": { "currentImageUpdateFrequency": "5",
 *                                "currentImageURL": "https://..." } } } } ] }
 */
import { parseFacing } from '../src/lib/facing.js';
import type { Camera } from '../src/lib/types.js';

export const CALTRANS_DISTRICTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function caltransFeedUrl(district: number): string {
  const padded = String(district).padStart(2, '0');
  return `https://cwwp2.dot.ca.gov/data/d${district}/cctv/cctvStatusD${padded}.json`;
}

const NOT_REPORTED = 'Not Reported';

/** Raw record as Caltrans sends it. Everything is optional because real feeds are messy. */
interface RawCctv {
  index?: string | number;
  recordTimestamp?: { recordDate?: string; recordTime?: string };
  location?: {
    district?: number | string;
    locationName?: string;
    nearbyPlace?: string;
    longitude?: number | string;
    latitude?: number | string;
    direction?: string;
    county?: string;
    route?: string;
  };
  inService?: string | boolean;
  imageData?: {
    imageDescription?: string;
    static?: {
      currentImageUpdateFrequency?: string | number;
      currentImageURL?: string;
    };
  };
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === NOT_REPORTED) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Convert a Caltrans local timestamp (Pacific time, PST or PDT) into a UTC ISO string.
 * Works out whether daylight saving was in effect on that date using the built-in Intl API.
 */
export function pacificToIso(date: string | undefined, time: string | undefined): string | null {
  if (!date || !time) return null;
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const naiveUtc = Date.UTC(+d[1]!, +d[2]! - 1, +d[3]!, +t[1]!, +t[2]!, +t[3]!);

  // Two passes handle the rare hour around a daylight-saving switch.
  let instant = naiveUtc - pacificOffsetMs(naiveUtc);
  instant = naiveUtc - pacificOffsetMs(instant);
  return new Date(instant).toISOString();
}

const pacificFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Pacific time's offset from UTC at a given instant, in ms (e.g. -7h during PDT). */
function pacificOffsetMs(instant: number): number {
  const parts = Object.fromEntries(
    pacificFormatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
  );
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asIfUtc - Math.floor(instant / 1000) * 1000;
}

/** Turn one district's raw JSON into clean Camera objects, dropping unusable records. */
export function parseCaltransFeed(json: unknown): Camera[] {
  const rows = (json as { data?: Array<{ cctv?: RawCctv }> } | null)?.data;
  if (!Array.isArray(rows)) return [];

  const cameras: Camera[] = [];
  for (const row of rows) {
    const c = row?.cctv;
    if (!c) continue;

    const inService = String(c.inService ?? 'true').toLowerCase();
    if (inService === 'false') continue;

    const lat = toNumber(c.location?.latitude);
    const lon = toNumber(c.location?.longitude);
    const imageUrl = c.imageData?.static?.currentImageURL;
    if (lat === null || lon === null || !imageUrl || !imageUrl.startsWith('http')) continue;

    const district = toNumber(c.location?.district) ?? 0;
    cameras.push({
      id: `caltrans-d${district}-${c.index ?? cameras.length}`,
      name: c.location?.locationName?.trim() || 'Unnamed camera',
      route: c.location?.route ?? '',
      direction: c.location?.direction ?? '',
      nearbyPlace: c.location?.nearbyPlace ?? '',
      county: c.location?.county ?? '',
      lat,
      lon,
      imageUrl,
      updateFrequencyMin: toNumber(c.imageData?.static?.currentImageUpdateFrequency),
      recordedAt: pacificToIso(c.recordTimestamp?.recordDate, c.recordTimestamp?.recordTime),
      facing: parseFacing(c.location?.locationName, c.imageData?.imageDescription),
    });
  }
  return cameras;
}
