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
  warnings: string[];
}
