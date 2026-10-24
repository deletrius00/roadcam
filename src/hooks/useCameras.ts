import { useEffect, useRef, useState } from 'react';
import { distanceMeters, METERS_PER_MILE } from '../lib/geo';
import type { CamerasResponse, LatLon } from '../lib/types';

export interface CamerasState {
  data: CamerasResponse | null;
  loading: boolean;
  error: string | null;
  /** When we last got fresh data (ms since epoch). */
  fetchedAt: number | null;
}

/** Re-fetch at least this often, so image ages and pictures stay current. */
export const REFRESH_MS = 60_000;
/** ...or sooner, if you've moved this far since the last fetch. */
const REFETCH_DISTANCE_METERS = 1 * METERS_PER_MILE;

/** Round to ~100 m so nearby requests share a cache entry on the server. */
const round = (n: number) => Math.round(n * 1000) / 1000;

export function useCameras(position: LatLon | null, radiusMiles: number, demo: boolean): CamerasState {
  const [state, setState] = useState<CamerasState>({ data: null, loading: false, error: null, fetchedAt: null });
  const lastFetch = useRef<{ at: LatLon; t: number; radius: number } | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const [tick, setTick] = useState(0);

  // A heartbeat that lets the effect below decide whether a refresh is due.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  // Switching between demo and live starts over; unmounting cancels any request.
  // (Declared before the fetch effect so it runs first.)
  useEffect(() => {
    lastFetch.current = null;
    setState({ data: null, loading: false, error: null, fetchedAt: null });
    return () => inFlight.current?.abort();
  }, [demo]);

  useEffect(() => {
    if (!position) return;
    const prev = lastFetch.current;
    const due =
      !prev ||
      prev.radius !== radiusMiles ||
      Date.now() - prev.t >= REFRESH_MS ||
      distanceMeters(prev.at, position) >= REFETCH_DISTANCE_METERS;
    if (!due) return;

    lastFetch.current = { at: position, t: Date.now(), radius: radiusMiles };
    // Position updates every second, so we can't cancel on every re-render;
    // only cancel the previous request when we start a new one (or unmount).
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const params = new URLSearchParams({
      lat: String(round(position.lat)),
      lon: String(round(position.lon)),
      radius: String(radiusMiles),
    });
    if (demo) params.set('demo', '1');

    setState((s) => ({ ...s, loading: true }));
    fetch(`/api/cameras?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
        setState({ data: body as CamerasResponse, loading: false, error: null, fetchedAt: Date.now() });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // Allow a quick retry instead of waiting a full minute.
        if (lastFetch.current) lastFetch.current.t = Date.now() - REFRESH_MS + 10_000;
        setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : String(err) }));
      });
  }, [position, radiusMiles, demo, tick]);


  return state;
}
