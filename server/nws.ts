/**
 * National Weather Service alerts (api.weather.gov): free, no key, whole US.
 * Fog, flood, wind, snow, ice, heat, fire weather... for the spot you're at.
 *
 * NWS alerts describe forecast zones, not road points, so we ask "what alerts cover
 * this point?" (?point=lat,lon) rather than drawing them on the map.
 * The NWS asks every app to send a User-Agent that says who it is.
 */
import type { WeatherAlert } from '../src/lib/types.js';

export const NWS_USER_AGENT = 'RoadCam (https://github.com/deletrius00/roadcam)';

/** Round to ~10 km so nearby requests share one cached answer. */
export function nwsAlertsUrl(lat: number, lon: number): string {
  return `https://api.weather.gov/alerts/active?point=${lat.toFixed(1)},${lon.toFixed(1)}&status=actual`;
}

interface RawFeature {
  id?: string;
  properties?: {
    id?: string;
    event?: string;
    severity?: string;
    headline?: string | null;
    areaDesc?: string;
    onset?: string | null;
    effective?: string | null;
    ends?: string | null;
    expires?: string | null;
    messageType?: string;
  };
}

const SEVERITY_ORDER = ['Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'];

/** Parse the NWS GeoJSON into alerts, most severe first. Cancellations are dropped. */
export function parseNwsAlerts(json: unknown): WeatherAlert[] {
  const features = (json as { features?: RawFeature[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const seen = new Set<string>();
  const alerts: WeatherAlert[] = [];
  for (const f of features) {
    const p = f.properties;
    if (!p?.event || p.messageType === 'Cancel') continue;
    // The same alert is often re-issued as an update; keep one per event + area.
    const key = `${p.event}|${p.areaDesc ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    alerts.push({
      id: `nws-${p.id ?? f.id ?? key}`,
      event: p.event,
      severity: SEVERITY_ORDER.includes(p.severity ?? '') ? (p.severity as string) : 'Unknown',
      headline: (p.headline ?? p.event).trim(),
      area: (p.areaDesc ?? '').trim(),
      startsAt: p.onset ?? p.effective ?? null,
      endsAt: p.ends ?? p.expires ?? null,
    });
  }
  return alerts.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
}
