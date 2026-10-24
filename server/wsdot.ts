/**
 * Washington State DOT (WSDOT) data sources. All free, no key needed:
 * - Highway cameras:  https://wsdot.wa.gov/traffic/api/HighwayCameras/kml.aspx  (~1,700 cameras)
 * - Highway alerts:   https://wsdot.wa.gov/traffic/api/HighwayAlerts/kml.aspx   (crashes, closures, construction)
 * - Traffic flow:     https://wsdot.wa.gov/traffic/api/TrafficFlow/kml.aspx     (~1,500 road sensors: WideOpen … StopAndGo)
 *
 * They are KML (Google Earth) files: one <Placemark> per item, with a name, an HTML
 * description and a point. We read each Placemark with small regular expressions instead of
 * a full XML parser: simpler, and a broken item can't spoil the rest.
 */
import type { Closure, Camera, FlowLevel, FlowReading, Incident } from '../src/lib/types.js';

export const WSDOT_CAMERAS_URL = 'https://wsdot.wa.gov/traffic/api/HighwayCameras/kml.aspx';
export const WSDOT_ALERTS_URL = 'https://wsdot.wa.gov/traffic/api/HighwayAlerts/kml.aspx';
export const WSDOT_FLOW_URL = 'https://wsdot.wa.gov/traffic/api/TrafficFlow/kml.aspx';

interface Placemark {
  id: string;
  name: string;
  description: string;
  style: string;
  folder: string;
  lat: number;
  lon: number;
}

function cdataOrText(block: string, tag: string): string {
  const m = new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${tag}>`).exec(block);
  return (m?.[1] ?? m?.[2] ?? '').trim();
}

/** Every Placemark in a KML file, remembering which <Folder> it was in. */
export function parsePlacemarks(kml: string): Placemark[] {
  const out: Placemark[] = [];
  // Folders aren't nested in these feeds, so splitting on <Folder> keeps each item with its folder.
  const folders = kml.split('<Folder>');
  for (const [i, part] of folders.entries()) {
    const folder = i === 0 ? '' : cdataOrText(part.slice(0, part.indexOf('<Placemark') === -1 ? part.length : part.indexOf('<Placemark')), 'name');
    for (const chunk of part.split('<Placemark').slice(1)) {
      const block = chunk.slice(0, chunk.indexOf('</Placemark>') === -1 ? chunk.length : chunk.indexOf('</Placemark>'));
      const id = /id="(?:ID\s*)?([^"]+)"/.exec(block)?.[1]?.trim();
      const coords = /<coordinates>\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/.exec(block);
      if (!id || !coords) continue;
      const lon = Number(coords[1]);
      const lat = Number(coords[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !lat) continue;
      out.push({
        id,
        name: cdataOrText(block, 'name'),
        description: cdataOrText(block, 'description'),
        style: cdataOrText(block, 'styleUrl').replace(/^#/, ''),
        folder,
        lat,
        lon,
      });
    }
  }
  return out;
}

// ---------- Route names ----------

const INTERSTATES = new Set([5, 82, 90, 182, 205, 405, 705]);
const US_ROUTES = new Set([2, 12, 97, 101, 195, 395, 730]);

/** "005" → "I-5", "167" → "SR-167", "002" → "US-2". */
export function routeFromNumber(num: string): string {
  const n = Number(num);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (INTERSTATES.has(n)) return `I-${n}`;
  if (US_ROUTES.has(n)) return `US-${n}`;
  return `SR-${n}`;
}

/** Finds the highway in text like "I-5 at MP 163.4: …", "SR 167 at …", "US 2 …" → "I-5" / "SR-167" / "US-2". */
export function routeFromText(text: string): string {
  const m = /\b(I|SR|US)[-\s]?(\d{1,3})\b/i.exec(text);
  return m ? `${m[1]!.toUpperCase()}-${Number(m[2])}` : '';
}

const SIDE: Record<string, string> = { NB: 'North', SB: 'South', EB: 'East', WB: 'West' };

// ---------- Cameras ----------

export function parseWsdotCameras(kml: string): Camera[] {
  const cameras: Camera[] = [];
  for (const p of parsePlacemarks(kml)) {
    const imageUrl = /src="([^"]+)"/.exec(p.description)?.[1] ?? '';
    // Skip airport-runway and ferry-dock cameras: RoadCam is about highways.
    if (!imageUrl.startsWith('http') || /\/airports\//.test(imageUrl)) continue;
    const side = /,\s*(NB|SB|EB|WB)\s*$/i.exec(p.name)?.[1]?.toUpperCase();
    cameras.push({
      id: `wsdot-${p.id}`,
      name: p.name || 'Unnamed camera',
      route: routeFromText(p.name),
      direction: side ? (SIDE[side] ?? '') : '',
      nearbyPlace: '',
      county: '',
      lat: p.lat,
      lon: p.lon,
      imageUrl,
      updateFrequencyMin: null,
      recordedAt: null,
      facing: null, // WSDOT doesn't publish which way cameras point; the app infers the road direction instead
      source: 'wsdot',
    });
  }
  return cameras;
}

// ---------- Alerts ----------

/** "HighIncident" → { impact: "High", kind: "Incident" }. */
function splitStyle(style: string): { impact: string; category: string } {
  const m = /^(Highest|High|Medium|Low|Lowest)?(.*)$/.exec(style) ?? [];
  return { impact: m[1] ?? '', category: m[2] ?? '' };
}

export function wsdotAlertKind(category: string): string | null {
  if (/RestArea/i.test(category)) return null; // rest-area notices aren't traffic
  if (/Incident|Collision/i.test(category)) return 'Crash or incident';
  if (/^Closure$/i.test(category)) return 'Road closure';
  if (/LaneClosure/i.test(category)) return 'Lane closure';
  if (/Construction|Maintenance|Roadwork|Bridgework/i.test(category)) return 'Roadwork';
  if (/Weather|Snow|Ice/i.test(category)) return 'Hazard';
  return 'Incident';
}

export function parseWsdotAlerts(kml: string): Array<Omit<Incident, 'distanceMeters'>> {
  const alerts: Array<Omit<Incident, 'distanceMeters'>> = [];
  for (const p of parsePlacemarks(kml)) {
    const { impact, category } = splitStyle(p.style);
    const kind = wsdotAlertKind(category);
    if (!kind) continue;
    const text = p.name.replace(/\s+/g, ' ').trim();
    alerts.push({
      id: `wsdot-alert-${p.id}`,
      kind,
      description: impact ? `${impact} impact: ${text}` : text,
      location: routeFromText(text),
      startedAt: null,
      source: 'WSDOT',
      lat: p.lat,
      lon: p.lon,
    });
  }
  return alerts;
}

/** Words WSDOT uses for work that hasn't started yet: "will be closed nightly", "beginning Monday". */
const FUTURE_WORDING = /\b(will|beginning|begins|starting|starts|scheduled|planned|upcoming|nightly|next week|this weekend)\b/i;

const CLOSURE_KINDS: Record<string, string> = {
  'Road closure': 'Full closure',
  'Lane closure': 'Lane closure',
  Roadwork: 'Roadwork',
};

/** "…of northbound I-5…" → "Northbound"; "" when the text doesn't say. */
function boundFrom(text: string): string {
  const word = /\b(north|south|east|west)bound\b/i.exec(text)?.[1];
  return word ? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}bound` : '';
}

/**
 * WSDOT roadwork and closure alerts, as closures. The free WSDOT feed has no start/end
 * times, so "upcoming" comes from the wording ("will be closed nightly…").
 * Returns null for alerts that aren't closures (crashes, hazards).
 */
export function wsdotAlertToClosure(alert: Omit<Incident, 'distanceMeters'>): Omit<Closure, 'distanceMeters'> | null {
  const what = CLOSURE_KINDS[alert.kind];
  if (!what) return null;
  const text = alert.description.replace(/^\w+ impact:\s*/i, '');
  return {
    id: alert.id.replace('wsdot-alert-', 'wsdot-closure-'),
    route: alert.location,
    direction: boundFrom(text),
    what,
    facility: 'Highway',
    work: text,
    place: '',
    lanes: '',
    startsAt: null,
    endsAt: null,
    status: FUTURE_WORDING.test(text) ? 'upcoming' : 'active',
    source: 'WSDOT',
    lat: alert.lat,
    lon: alert.lon,
  };
}

// ---------- Traffic flow ----------

const LEVELS: FlowLevel[] = ['WideOpen', 'Moderate', 'Heavy', 'StopAndGo'];

export function parseWsdotFlow(kml: string): Array<Omit<FlowReading, 'distanceMeters'>> {
  const readings: Array<Omit<FlowReading, 'distanceMeters'>> = [];
  for (const p of parsePlacemarks(kml)) {
    const level = /Reading:\s*([A-Za-z]+)/.exec(p.description)?.[1] as FlowLevel | undefined;
    if (!level || !LEVELS.includes(level)) continue; // "Unknown" or missing: skip
    const dir = /Direction:\s*([NSEW]B)/i.exec(p.description)?.[1]?.toUpperCase();
    readings.push({
      id: `wsdot-flow-${p.id}`,
      name: p.name.replace(/,\s*[NSEW]B\s*$/i, ''),
      route: routeFromNumber(p.folder),
      direction: dir ? (SIDE[dir] ?? '') : '',
      level,
      lat: p.lat,
      lon: p.lon,
    });
  }
  return readings;
}
