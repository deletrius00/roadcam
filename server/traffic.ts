/**
 * GET /api/traffic?lat=34.8&lon=-118.86&radius=25[&demo=1]
 *
 * Live traffic conditions from two free public feeds:
 * - CHP incidents (crashes, hazards, stalled cars, closures): https://media.chp.ca.gov/sa_xml/sa.xml
 * - Caltrans overhead message signs (what the freeway signs say right now), one JSON file per district.
 */
import { CALTRANS_DISTRICTS, pacificToIso } from './caltrans.js';
import { defaultDeps, json, parseArea, type HandlerDeps } from './handler.js';
import { demoTraffic } from '../src/lib/demo.js';
import { distanceMeters, METERS_PER_MILE } from '../src/lib/geo.js';
import type { Incident, SignMessage, TrafficResponse } from '../src/lib/types.js';

export const CHP_URL = 'https://media.chp.ca.gov/sa_xml/sa.xml';
export const MAX_ITEMS = 30;
const CHP_TTL_MS = 60_000;
const SIGN_TTL_MS = 2 * 60_000;

export function signFeedUrl(district: number): string {
  return `https://cwwp2.dot.ca.gov/data/d${district}/cms/cmsStatusD${String(district).padStart(2, '0')}.json`;
}

// ---------- CHP incidents ----------

type RawIncident = Omit<Incident, 'distanceMeters'>;

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

/** "Oct 23 2026  4:59PM" (Pacific time) → ISO 8601 UTC. */
export function chpTimeToIso(text: string): string | null {
  const m = /([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/.exec(text);
  if (!m || !MONTHS[m[1]!]) return null;
  let hour = Number(m[4]) % 12;
  if (m[6] === 'PM') hour += 12;
  return pacificToIso(`${m[3]}-${MONTHS[m[1]!]}-${m[2]!.padStart(2, '0')}`, `${String(hour).padStart(2, '0')}:${m[5]}:00`);
}

/** "1183-Trfc Collision-Unkn Inj" → "Crash". */
export function incidentKind(logType: string): string {
  if (/collision|crash/i.test(logType)) return 'Crash';
  if (/closure|sig\s*alert/i.test(logType)) return 'Road closure';
  if (/fire/i.test(logType)) return 'Fire';
  if (/disabled|stall|disabl/i.test(logType)) return 'Stalled vehicle';
  if (/hazard|debris|animal|object|pedestrian|wrong.?way/i.test(logType)) return 'Hazard';
  return 'Incident';
}

/** "1183-Trfc Collision-Unkn Inj" → "Traffic collision, unknown injuries". */
export function describeIncident(logType: string): string {
  const text = logType
    .replace(/^\s*\d+[A-Z]?\s*-\s*/, '') // drop the radio code
    .replace(/\bTrfc\b/gi, 'Traffic')
    .replace(/\bUnkn\b/gi, 'unknown')
    .replace(/\bInj\b/gi, 'injuries')
    .replace(/\bNo injuries\b/gi, 'no injuries')
    .replace(/\bVeh\b/gi, 'vehicle')
    .replace(/\bVehs\b/gi, 'vehicles')
    .replace(/\s*-\s*/g, ', ')
    .trim();
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase().replace(/\bi-?(\d)/g, 'I-$1');
}

function field(block: string, tag: string): string {
  const m = new RegExp(`<${tag}>\\s*"?([^<]*?)"?\\s*</${tag}>`).exec(block);
  return m ? m[1]!.trim() : '';
}

/**
 * Parse the CHP feed. It is not always valid XML (we've seen it cut off mid-tag), so instead of an
 * XML parser we read each <Log> block on its own and skip any that are incomplete.
 */
export function parseChpIncidents(xml: string): RawIncident[] {
  const incidents: RawIncident[] = [];
  // The live feed writes `<Log ID = "…">` (spaces around "=") and uses Windows line endings.
  for (const chunk of xml.split(/<Log\s+ID\s*=\s*"/).slice(1)) {
    const id = chunk.slice(0, chunk.indexOf('"'));
    const latlon = /^(\d+):(\d+)$/.exec(field(chunk, 'LATLON'));
    if (!id || !latlon) continue;
    const lat = Number(latlon[1]) / 1e6;
    const lon = -Number(latlon[2]) / 1e6; // California is west of Greenwich: the feed drops the minus sign
    if (!lat || !lon) continue;
    const logType = field(chunk, 'LogType');
    incidents.push({
      id: `chp-${id}`,
      kind: incidentKind(logType),
      description: describeIncident(logType) || 'Incident',
      location: field(chunk, 'Location') || field(chunk, 'LocationDesc'),
      startedAt: chpTimeToIso(field(chunk, 'LogTime')),
      lat,
      lon,
    });
  }
  return incidents;
}

// ---------- Caltrans message signs ----------

type RawSign = Omit<SignMessage, 'distanceMeters'>;

interface RawCms {
  index?: string;
  inService?: string;
  location?: { latitude?: string | number; longitude?: string | number; route?: string; direction?: string; locationName?: string; district?: string | number };
  message?: {
    display?: string;
    messageTimestamp?: { messageDate?: string; messageTime?: string };
    phase1?: Record<string, string>;
    phase2?: Record<string, string>;
  };
}

/** Signs that are showing a message (blank and out-of-service signs are skipped). */
export function parseSignFeed(jsonBody: unknown): RawSign[] {
  const rows = (jsonBody as { data?: Array<{ cms?: RawCms }> } | null)?.data;
  if (!Array.isArray(rows)) return [];
  const signs: RawSign[] = [];
  for (const row of rows) {
    const c = row?.cms;
    if (!c || String(c.inService) === 'false') continue;
    if (/blank/i.test(c.message?.display ?? '')) continue;
    const lines = [1, 2, 3]
      .map((n) => c.message?.phase1?.[`phase1Line${n}`] ?? '')
      .concat([1, 2, 3].map((n) => c.message?.phase2?.[`phase2Line${n}`] ?? ''))
      .map((l) => l.trim())
      .filter(Boolean);
    const lat = Number(c.location?.latitude);
    const lon = Number(c.location?.longitude);
    if (!lines.length || !Number.isFinite(lat) || !Number.isFinite(lon) || !lat) continue;
    signs.push({
      id: `cms-d${c.location?.district ?? ''}-${c.index ?? signs.length}`,
      route: c.location?.route ?? '',
      direction: c.location?.direction ?? '',
      lines,
      postedAt: pacificToIso(c.message?.messageTimestamp?.messageDate, c.message?.messageTimestamp?.messageTime),
      lat,
      lon,
    });
  }
  return signs;
}

// ---------- Handler ----------

let chpCache: { loadedAt: number; incidents: RawIncident[] } | null = null;
const signCache = new Map<number, { loadedAt: number; signs: RawSign[] }>();

export function clearTrafficCache(): void {
  chpCache = null;
  signCache.clear();
}

async function loadIncidents(deps: HandlerDeps): Promise<RawIncident[]> {
  if (chpCache && deps.now() - chpCache.loadedAt < CHP_TTL_MS) return chpCache.incidents;
  const res = await deps.fetch(CHP_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const incidents = parseChpIncidents(await res.text());
  chpCache = { loadedAt: deps.now(), incidents };
  return incidents;
}

async function loadSigns(district: number, deps: HandlerDeps): Promise<RawSign[]> {
  const hit = signCache.get(district);
  if (hit && deps.now() - hit.loadedAt < SIGN_TTL_MS) return hit.signs;
  const res = await deps.fetch(signFeedUrl(district), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const signs = parseSignFeed(await res.json());
  signCache.set(district, { loadedAt: deps.now(), signs });
  return signs;
}

function nearby<T extends { lat: number; lon: number }>(items: T[], center: { lat: number; lon: number }, radiusMeters: number) {
  return items
    .map((item) => ({ ...item, distanceMeters: distanceMeters(center, item) }))
    .filter((item) => item.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, MAX_ITEMS);
}

export async function handleTrafficRequest(request: Request, deps: HandlerDeps = defaultDeps): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const area = parseArea(params);
  if (area instanceof Response) return area;
  const { center, radiusMiles } = area;
  const radiusMeters = radiusMiles * METERS_PER_MILE;
  const now = deps.now();

  if (params.get('demo') === '1') {
    const demo = demoTraffic(now);
    const body: TrafficResponse = {
      generatedAt: new Date(now).toISOString(),
      incidents: nearby(demo.incidents, center, radiusMeters),
      signs: nearby(demo.signs, center, radiusMeters),
      warnings: [],
    };
    return json(body, 200, { 'cache-control': 'no-store' });
  }

  const warnings: string[] = [];
  const [chp, ...districts] = await Promise.allSettled([
    loadIncidents(deps),
    ...CALTRANS_DISTRICTS.map((d) => loadSigns(d, deps)),
  ]);
  const incidents = chp.status === 'fulfilled' ? chp.value : [];
  if (chp.status === 'rejected') warnings.push('CHP incidents unavailable');
  const signs: RawSign[] = [];
  districts.forEach((r, i) => {
    if (r.status === 'fulfilled') signs.push(...(r.value as RawSign[]));
    else warnings.push(`Caltrans district ${CALTRANS_DISTRICTS[i]} signs unavailable`);
  });

  const body: TrafficResponse = {
    generatedAt: new Date(now).toISOString(),
    incidents: nearby(incidents, center, radiusMeters),
    signs: nearby(signs, center, radiusMeters),
    warnings,
  };
  return json(body, 200, { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=60' });
}
