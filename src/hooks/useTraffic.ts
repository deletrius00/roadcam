import { useCallback, useEffect, useRef, useState } from 'react';
import { distanceMeters, METERS_PER_MILE } from '../lib/geo';
import type { LatLon, TrafficResponse } from '../lib/types';

/** Traffic changes quickly: refresh every minute, or after moving a mile. */
const REFRESH_MS = 60_000;
const REFETCH_DISTANCE_METERS = METERS_PER_MILE;
const round = (n: number) => Math.round(n * 1000) / 1000;

export interface TrafficState {
  /** The latest traffic data, or null before the first successful fetch. */
  data: TrafficResponse | null;
  /** True while a request is running. */
  loading: boolean;
  /** Fetch right now and restart the 60-second timer. Ignored while a request is already running. */
  refresh: () => void;
}

export function useTraffic(position: LatLon | null, radiusMiles: number, demo: boolean): TrafficState {
  const [data, setData] = useState<TrafficResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const last = useRef<{ at: LatLon; t: number; radius: number } | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const [tick, setTick] = useState(0);
  // Set by refresh(): "fetch on the next run of the effect, even if it isn't due yet".
  const forceNext = useRef(false);
  const [manual, setManual] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    last.current = null;
    setData(null);
    return () => inFlight.current?.abort();
  }, [demo]);

  useEffect(() => {
    if (!position) return;
    const prev = last.current;
    const due =
      forceNext.current ||
      !prev ||
      prev.radius !== radiusMiles ||
      Date.now() - prev.t >= REFRESH_MS ||
      distanceMeters(prev.at, position) >= REFETCH_DISTANCE_METERS;
    if (!due) return;
    forceNext.current = false;
    last.current = { at: position, t: Date.now(), radius: radiusMiles };
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const params = new URLSearchParams({ lat: String(round(position.lat)), lon: String(round(position.lon)), radius: String(radiusMiles) });
    if (demo) params.set('demo', '1');
    setLoading(true);
    fetch(`/api/traffic?${params}`, { signal: controller.signal })
      .then(async (res) => (res.ok ? setData((await res.json()) as TrafficResponse) : undefined))
      .catch(() => {
        // Traffic is a nice-to-have: if it fails, keep the last data and try again next minute.
      })
      .finally(() => {
        // Only the newest request decides when loading is over.
        if (inFlight.current !== controller) return;
        inFlight.current = null;
        setLoading(false);
      });
  }, [position, radiusMiles, demo, tick, manual]);

  const refresh = useCallback(() => {
    // A request is already running: ignore extra taps so a burst starts only one request.
    if (inFlight.current) return;
    forceNext.current = true;
    setManual((n) => n + 1);
  }, []);

  return { data, loading, refresh };
}
