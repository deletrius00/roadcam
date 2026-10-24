import type { Compass } from './facing.js';

/** A point on the map, in decimal degrees (WGS84, same as GPS). */
export interface LatLon {
  lat: number;
  lon: number;
}

/** One highway camera, normalized from whatever data source it came from. */
export interface Camera extends LatLon {
  id: string;
  /** Human-readable location, e.g. "I-5 : Grapevine". */
  name: string;
  /** Highway, e.g. "I-5", "SR-58". */
  route: string;
  /** Side of the road / direction of travel the camera sits on: North, South, East, West, Median. */
  direction: string;
  /** Nearby town, if known. */
  nearbyPlace: string;
  county: string;
  /** URL of the most recent still image. */
  imageUrl: string;
  /** How often the source says the image refreshes, in minutes (null if unknown). */
  updateFrequencyMin: number | null;
  /** When the source last updated this camera's record (ISO 8601, UTC). */
  recordedAt: string | null;
  /** Which way the camera points, when the source says so (rare), else null. */
  facing: Compass | null;
  /** Where the data came from. */
  source?: 'caltrans' | 'wsdot' | 'demo';
}

/** Where an image's timestamp came from, from most to least trustworthy. */
export type ImageTimeSource = 'last-modified' | 'record' | 'demo' | 'unknown';

/** What `/api/cameras` returns for each camera. */
export interface NearbyCamera extends Camera {
  /** Straight-line distance from the requested point, in meters. */
  distanceMeters: number;
  /** When the current image was taken (ISO 8601, UTC), best estimate. */
  imageTakenAt: string | null;
  imageTimeSource: ImageTimeSource;
  /** True when the camera is down and Caltrans serves a "Temporarily Unavailable" card. */
  unavailable: boolean;
  /** Which way the highway runs at the camera, 0–180° (0 = north–south, 90 = east–west), or null. */
  roadAxisDeg: number | null;
}

export interface CamerasResponse {
  generatedAt: string;
  center: LatLon;
  radiusMiles: number;
  cameras: NearbyCamera[];
  /** Data sources that failed this time (the app still works with the rest). */
  warnings: string[];
}

export type Relation = 'ahead' | 'behind' | 'side';

/** A CHP incident: crash, hazard, stalled vehicle, closure… */
export interface Incident extends LatLon {
  id: string;
  /** Short category: "Crash", "Hazard", "Stalled vehicle", "Road closure", "Fire", "Incident". */
  kind: string;
  /** Plain-English description, e.g. "Traffic collision, unknown injuries". */
  description: string;
  /** Where, as CHP wrote it, e.g. "I5 S / J St". */
  location: string;
  /** When CHP logged it (ISO 8601), if known. */
  startedAt: string | null;
  distanceMeters: number;
  /** Who reported it: "CHP", "WSDOT" or "TomTom". Missing on older responses (= CHP). */
  source?: string;
  /** Extra time it's adding to the trip, in seconds, when known (TomTom jams). */
  delaySeconds?: number | null;
}

/** A planned or active highway closure (lanes, ramps or the whole road). */
export interface Closure extends LatLon {
  id: string;
  /** "I-5", "SR-14", "US-101". */
  route: string;
  /** "Northbound", or "" when unknown. */
  direction: string;
  /** "Full closure", "Lane closure", "One-way traffic"... */
  what: string;
  /** "Mainline" (the freeway itself), "On ramp", "Off ramp", "Connector"... */
  facility: string;
  /** Why: "Pavement work", "Bridge construction"... */
  work: string;
  /** Plain-English stretch, e.g. "Avenue H to Avenue F, Lancaster". */
  place: string;
  /** "1, 2 of 4" or "All", when known. */
  lanes: string;
  /** When it starts (ISO 8601), or null when the source only describes it in words (WSDOT). */
  startsAt: string | null;
  endsAt: string | null;
  /** 'active' = happening now, 'upcoming' = scheduled for later. */
  status: 'active' | 'upcoming';
  source: string;
  distanceMeters: number;
}

/** A National Weather Service alert for where you are (fog, flood, wind, snow...). */
export interface WeatherAlert {
  id: string;
  /** "Dense Fog Advisory", "Flood Warning"... */
  event: string;
  /** "Minor", "Moderate", "Severe", "Extreme" or "Unknown". */
  severity: string;
  headline: string;
  /** Which areas it covers, as the NWS wrote it. */
  area: string;
  startsAt: string | null;
  endsAt: string | null;
}

/** What a Caltrans overhead message sign currently says. */
export interface SignMessage extends LatLon {
  id: string;
  route: string;
  /** Direction of traffic the sign faces: North, South, East, West. */
  direction: string;
  lines: string[];
  postedAt: string | null;
  distanceMeters: number;
}

/** How traffic is moving at a road sensor (Washington only). */
export type FlowLevel = 'WideOpen' | 'Moderate' | 'Heavy' | 'StopAndGo';

export interface FlowReading extends LatLon {
  id: string;
  /** Sensor location, e.g. "Homeacres Rd". */
  name: string;
  route: string;
  /** Direction of travel measured: North, South, East, West. */
  direction: string;
  level: FlowLevel;
  distanceMeters: number;
}

export interface TrafficResponse {
  generatedAt: string;
  incidents: Incident[];
  signs: SignMessage[];
  /** Live congestion at road sensors (Washington). Empty where no sensors exist. */
  flow: FlowReading[];
  /**
   * True when the server can serve live traffic-speed map tiles (/api/speed-tile).
   * Those color the roads everywhere, including California, which has no free sensor feed.
   */
  speedTiles?: boolean;
  /** Lane, ramp and full road closures, happening now or in the next 7 days, closest first. */
  closures?: Closure[];
  /** Weather alerts where you are. */
  weather?: WeatherAlert[];
  warnings: string[];
}
