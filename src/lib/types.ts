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
