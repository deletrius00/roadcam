/**
 * GET /api/traffic?lat=34.8&lon=-118.86&radius=25[&demo=1]
 *
 * Live traffic conditions from two free public feeds:
 * - CHP incidents (crashes, hazards, stalled cars, closures): https://media.chp.ca.gov/sa_xml/sa.xml
 * - Caltrans overhead message signs (what the freeway signs say right now), one JSON file per district.
 */
import { CALTRANS_DISTRICTS, pacificToIso } from './caltrans.js';
import { defaultDeps, json, parseArea, type HandlerDeps } from './handler.js';
import { speedTilesEnabled } from './speedTiles.js';
import { demoTraffic } from '../src/lib/demo.js';
import { distanceMeters, METERS_PER_MILE } from '../src/lib/geo.js';
import { districtsNear } from './districts.js';
import { lcsFeedUrl, parseLaneClosures } from './lcs.js';
import { nwsAlertsUrl, NWS_USER_AGENT, parseNwsAlerts } from './nws.js';
import { parseTomtomIncidents, tomtomIncidentsUrl, type TomtomResult } from './tomtomIncidents.js';
import type { Closure, FlowReading, Incident, SignMessage, TrafficResponse, WeatherAlert } from '../src/lib/types.js';
import { regionsNear } from './regions.js';
import { parseWsdotAlerts, parseWsdotFlow, WSDOT_ALERTS_URL, WSDOT_FLOW_URL, wsdotAlertToClosure } from './wsdot.js';

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
  if (/\bMZP\b|maintenance|construction|road ?work/i.test(logType)) return 'Roadwork';
  if (/collision|crash/i.test(logType)) return 'Crash';
  if (/closure|sig\s*alert/i.test(logType)) return 'Road closure';
  if (/fire/i.test(logType)) return 'Fire';
  if (/disabled|stall|disabl/i.test(logType)) return 'Stalled vehicle';
  if (/debris|object|tire|load|spill/i.test(logType)) return 'Debris';
  if (/\bfog\b|visibility/i.test(logType)) return 'Fog';
  if (/flood/i.test(logType)) return 'Flooding';
  if (/\bwind\b/i.test(logType)) return 'Wind';
  if (/snow|\bice\b|chain|weather|road.?cond/i.test(logType)) return 'Weather';
  if (/police|pursuit|traffic break|law enf|officer|swat|shooting/i.test(logType)) return 'Police activity';
  if (/hazard|animal|pedestrian|wrong.?way/i.test(logType)) return 'Hazard';
  return 'Incident';
}

/** "1183-Trfc Collision-Unkn Inj" → "Traffic collision, unknown injuries". */
export function describeIncident(logType: string): string {
  // "MZP" = Maintenance Zone Protection: CHP officers guarding a Caltrans work crew.
  if (/\bMZP\b/i.test(logType)) return 'CHP protecting a Caltrans work zone';
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
  const seen = new Set<string>();
  // The live feed writes `<Log ID = "…">` (spaces around "=") and uses Windows line endings.
  for (const chunk of xml.split(/<Log\s+ID\s*=\s*"/).slice(1)) {
    const id = chunk.slice(0, chunk.indexOf('"'));
    const latlon = /^(\d+):(\d+)$/.exec(field(chunk, 'LATLON'));
    if (!id || !latlon) continue;
    const lat = Number(latlon[1]) / 1e6;
    const lon = -Number(latlon[2]) / 1e6; // California is west of Greenwich: the feed drops the minus sign
    if (!lat || !lon) continue;
    const logType = field(chunk, 'LogType');
    const location = field(chunk, 'Location') || field(chunk, 'LocationDesc');
    // The same event is often logged more than once (several units, several dispatch centers).
    const key = `${logType}|${location}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    incidents.push({
      id: `chp-${id}`,
      kind: incidentKind(logType),
      description: describeIncident(logType) || 'Incident',
      location,
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

type RawFlow = Omit<FlowReading, 'distanceMeters'>;
/** Road sensors are dense (one every half mile or so): allow more of them than incidents. */
export const MAX_FLOW = 300;
const WSDOT_TTL_MS = 60_000;
const kmlCache = new Map<string, { loadedAt: number; items: unknown[] }>();

/** Download a WSDOT KML feed and parse it, reusing the result for a minute. */
async function loadCached<T>(key: string, url: string, parse: (kml: string) => T[], deps: HandlerDeps): Promise<T[]> {
  const hit = kmlCache.get(key);
  if (hit && deps.now() - hit.loadedAt < WSDOT_TTL_MS) return hit.items as T[];
  const res = await deps.fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = parse(await res.text());
  kmlCache.set(key, { loadedAt: deps.now(), items });
  return items;
}

function nearbyAll<T extends { lat: number; lon: number }>(items: T[], center: { lat: number; lon: number }, radiusMeters: number, max: number) {
  return items
    .map((item) => ({ ...item, distanceMeters: distanceMeters(center, item) }))
    .filter((item) => item.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, max);
}

export function clearTrafficCache(): void {
  chpCache = null;
  signCache.clear();
  kmlCache.clear();
  jsonCache.clear();
}

// ---------- Closures, weather and TomTom incidents (shared small cache) ----------

/** Closures and weather only matter this close; the Caltrans files are big. */
export const MAX_EXTRA_RADIUS_METERS = 150 * METERS_PER_MILE;
export const MAX_CLOSURES = 60;
const LCS_TTL_MS = 10 * 60_000;
const NWS_TTL_MS = 5 * 60_000;
const TOMTOM_TTL_MS = 2 * 60_000;
const jsonCache = new Map<string, { loadedAt: number; value: unknown }>();

/** Fetch JSON with a per-URL cache. `ttl` is how long an answer stays fresh. */
async function loadJson<T>(key: string, url: string, ttl: number, parse: (json: unknown) => T, deps: HandlerDeps, headers?: Record<string, string>): Promise<T> {
  const hit = jsonCache.get(key);
  if (hit && deps.now() - hit.loadedAt < ttl) return hit.value as T;
  const res = await deps.fetch(url, { signal: AbortSignal.timeout(15_000), headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const value = parse(await res.json());
  jsonCache.set(key, { loadedAt: deps.now(), value });
  return value;
}

/** Rounded to ~5 km so nearby users share a TomTom answer (and the free quota). */
const roundKey = (n: number) => (Math.round(n * 20) / 20).toFixed(2);

export interface TrafficOptions {
  /** TomTom key: turns on speed tiles and TomTom incidents. Tests pass a fake one. */
  tomtomKey?: string;
}

export const defaultTrafficOptions = (): TrafficOptions => ({ tomtomKey: process.env.TOMTOM_API_KEY });

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

export async function handleTrafficRequest(
  request: Request,
  deps: HandlerDeps = defaultDeps,
  options: TrafficOptions = defaultTrafficOptions(),
): Promise<Response> {
  const tomtomKey = speedTilesEnabled(options.tomtomKey) ? options.tomtomKey!.trim() : null;
  const speedTiles = tomtomKey !== null;
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
      flow: [],
      speedTiles,
      closures: nearbyAll(demo.closures, center, radiusMeters, MAX_CLOSURES),
      weather: demo.weather,
      warnings: [],
    };
    return json(body, 200, { 'cache-control': 'no-store' });
  }

  const warnings: string[] = [];
  const incidents: RawIncident[] = [];
  const signs: RawSign[] = [];
  const flow: RawFlow[] = [];
  const wsdotClosures: Array<Omit<Closure, 'distanceMeters'>> = [];
  const regions = regionsNear(center, radiusMeters);

  if (regions.includes('california')) {
    const [chp, ...districts] = await Promise.allSettled([
      loadIncidents(deps),
      ...CALTRANS_DISTRICTS.map((d) => loadSigns(d, deps)),
    ]);
    if (chp.status === 'fulfilled') incidents.push(...chp.value);
    else warnings.push('CHP incidents unavailable');
    districts.forEach((r, i) => {
      if (r.status === 'fulfilled') signs.push(...(r.value as RawSign[]));
      else warnings.push(`Caltrans district ${CALTRANS_DISTRICTS[i]} signs unavailable`);
    });
  }

  if (regions.includes('washington')) {
    const [alerts, sensors] = await Promise.allSettled([
      loadCached('wsdot-alerts', WSDOT_ALERTS_URL, parseWsdotAlerts, deps),
      loadCached('wsdot-flow', WSDOT_FLOW_URL, parseWsdotFlow, deps),
    ]);
    if (alerts.status === 'fulfilled') {
      // Roadwork and closures go to the Closures list; crashes and hazards stay incidents.
      for (const alert of alerts.value) {
        const closure = wsdotAlertToClosure(alert);
        if (closure) wsdotClosures.push(closure);
        else incidents.push(alert);
      }
    }
    else warnings.push('WSDOT alerts unavailable');
    if (sensors.status === 'fulfilled') flow.push(...sensors.value);
    else warnings.push('WSDOT traffic sensors unavailable');
  }

  // Closures, weather and TomTom: limited to 150 miles, all in parallel.
  const extraRadius = Math.min(radiusMeters, MAX_EXTRA_RADIUS_METERS);
  const closures: Array<Omit<Closure, 'distanceMeters'>> = [...wsdotClosures];
  let weather: WeatherAlert[] = [];
  const lcsDistricts = regions.includes('california') ? districtsNear(center, extraRadius) : [];
  const [lcsResults, nws, tomtom] = await Promise.all([
    Promise.allSettled(
      lcsDistricts.map((d) => loadJson(`lcs-${d}`, lcsFeedUrl(d), LCS_TTL_MS, (j) => parseLaneClosures(j, now), deps)),
    ),
    loadJson(`nws-${nwsAlertsUrl(center.lat, center.lon)}`, nwsAlertsUrl(center.lat, center.lon), NWS_TTL_MS, parseNwsAlerts, deps, {
      'user-agent': NWS_USER_AGENT,
      accept: 'application/geo+json',
    }).then(
      (v) => ({ ok: true as const, v }),
      () => ({ ok: false as const }),
    ),
    tomtomKey
      ? loadJson<TomtomResult>(
          `tomtom-${roundKey(center.lat)},${roundKey(center.lon)},${Math.round(extraRadius / 10_000)}`,
          tomtomIncidentsUrl(center, extraRadius, tomtomKey),
          TOMTOM_TTL_MS,
          parseTomtomIncidents,
          deps,
        ).then(
          (v) => ({ ok: true as const, v }),
          () => ({ ok: false as const }),
        )
      : Promise.resolve(null),
  ]);
  lcsResults.forEach((r, i) => {
    if (r.status === 'fulfilled') closures.push(...r.value);
    else warnings.push(`Caltrans district ${lcsDistricts[i]} closures unavailable`);
  });
  if (nws.ok) weather = nws.v;
  else warnings.push('Weather alerts unavailable');
  if (tomtom) {
    if (tomtom.ok) {
      incidents.push(...tomtom.v.incidents);
      closures.push(...tomtom.v.closures);
    } else warnings.push('TomTom incidents unavailable');
  }

  const body: TrafficResponse = {
    generatedAt: new Date(now).toISOString(),
    incidents: nearby(incidents, center, radiusMeters),
    signs: nearby(signs, center, radiusMeters),
    flow: nearbyAll(flow, center, radiusMeters, MAX_FLOW),
    speedTiles,
    closures: nearbyAll(closures, center, extraRadius, MAX_CLOSURES),
    weather,
    warnings,
  };
  return json(body, 200, { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=60' });
}
