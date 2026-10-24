import { useEffect, useRef, useState } from 'react';
import { demoPosition } from '../lib/demo';
import { resolveHeading, type Fix } from '../lib/heading';
import type { LatLon } from '../lib/types';

export type LocationMode = 'off' | 'live' | 'demo';
export type LocationStatus = 'idle' | 'locating' | 'tracking' | 'denied' | 'unavailable';

export interface LocationState {
  status: LocationStatus;
  position: LatLon | null;
  /** Direction of travel in degrees (0 = north), or null if we can't tell yet. */
  heading: number | null;
  /** Meters per second, or null if unknown. */
  speed: number | null;
  accuracyMeters: number | null;
  error: string | null;
}

const INITIAL: LocationState = {
  status: 'idle',
  position: null,
  heading: null,
  speed: null,
  accuracyMeters: null,
  error: null,
};

/** How long a heading stays valid after we lose it (e.g. stopped at a light). */
const HEADING_HOLD_MS = 60_000;
/** How far back we look when computing heading from movement. */
const HISTORY_MS = 30_000;

/**
 * Follows your position (real GPS, or a simulated drive in demo mode)
 * and works out your heading.
 */
export function useLocation(mode: LocationMode, attempt = 0): LocationState {
  const [state, setState] = useState<LocationState>(INITIAL);
  const history = useRef<Array<LatLon & { t: number }>>([]);
  const lastHeading = useRef<{ value: number; t: number } | null>(null);

  useEffect(() => {
    history.current = [];
    lastHeading.current = null;
    if (mode === 'off') {
      setState(INITIAL);
      return;
    }

    const onFix = (fix: Fix, accuracy: number | null, t: number) => {
      // Keep the last 30 seconds of positions; the oldest is our "where I was" anchor.
      history.current = [...history.current, { lat: fix.lat, lon: fix.lon, t }].filter(
        (p) => t - p.t <= HISTORY_MS,
      );
      const anchor = history.current[0] ?? null;
      let heading = resolveHeading(fix, anchor);
      if (heading !== null) {
        lastHeading.current = { value: heading, t };
      } else if (lastHeading.current && t - lastHeading.current.t < HEADING_HOLD_MS) {
        heading = lastHeading.current.value;
      }
      setState({
        status: 'tracking',
        position: { lat: fix.lat, lon: fix.lon },
        heading,
        speed: fix.speed,
        accuracyMeters: accuracy,
        error: null,
      });
    };

    if (mode === 'demo') {
      const start = Date.now();
      let previous: LatLon | null = null;
      const tick = () => {
        const now = Date.now();
        // Demo speed-up: 1 real second = 6 simulated seconds, so the drive is watchable.
        const { position, heading } = demoPosition((now - start) * 6);
        const speed = previous ? 29 : null;
        previous = position;
        onFix({ ...position, heading, speed }, 10, now);
      };
      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    }

    if (!('geolocation' in navigator)) {
      setState({ ...INITIAL, status: 'unavailable', error: 'This browser cannot share its location.' });
      return;
    }
    setState({ ...INITIAL, status: 'locating' });
    const watchId = navigator.geolocation.watchPosition(
      (pos) =>
        onFix(
          {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
          },
          pos.coords.accuracy,
          pos.timestamp,
        ),
      (err) =>
        setState({
          ...INITIAL,
          status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable',
          error:
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was denied. Allow it in your browser settings to find cameras near you.'
              : `Could not get your location (${err.message}).`,
        }),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [mode, attempt]);

  return state;
}
