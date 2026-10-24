import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { usePrefersDark } from '../hooks/usePrefersDark';
import { ageMs, formatAge, freshness } from '../lib/age';
import { compassDegrees } from '../lib/facing';
import { formatDistance, METERS_PER_MILE } from '../lib/geo';
import { friendlyCameraName } from '../lib/names';
import { axisDirections, axisLabel } from '../lib/roadAxis';
import {
  clampZoom,
  MAX_ZOOM,
  metersPerPixel,
  MIN_ZOOM,
  project,
  tileUrl,
  unproject,
  visibleTiles,
  wedgePath,
  zoomForRadius,
  type Point,
} from '../lib/tiles';
import type { Incident, LatLon, NearbyCamera, Relation, SignMessage } from '../lib/types';
import { withCacheBust } from './CameraCard';

export interface MapCamera {
  camera: NearbyCamera;
  relation: Relation | 'nearby';
  distance: number;
}

interface Props {
  me: LatLon;
  heading: number | null;
  cameras: MapCamera[];
  incidents: Incident[];
  signs: SignMessage[];
  radiusMiles: number;
  /** Half-width of the ahead/behind "flashlight" in degrees (matches classifyRelation). */
  coneDeg?: number;
  now: number;
  refreshKey: number;
  onOpen: (camera: NearbyCamera) => void;
}

/** Below this many pixels of movement, a press counts as a tap, not a drag. */
const DRAG_THRESHOLD_PX = 6;
/** Two taps within this time and distance count as a double-tap. */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 30;

const RELATION_LABEL: Record<MapCamera['relation'], string> = {
  ahead: 'Ahead',
  behind: 'Behind',
  side: 'Off to the side',
  nearby: 'Nearby',
};

type Selected = { type: 'camera'; id: string } | { type: 'incident'; id: string } | { type: 'sign'; id: string } | null;

type Gesture =
  | { kind: 'drag'; id: number; startX: number; startY: number; startCenter: Point; moved: boolean }
  | { kind: 'pinch'; startDist: number }
  | null;

export function MapView({ me, heading, cameras, incidents, signs, radiusMiles, coneDeg = 60, now, refreshKey, onOpen }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  /** null = automatic zoom that fits the cameras. */
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  /** null = follow my position. Set once you drag or zoom around a point. */
  const [manualCenter, setManualCenter] = useState<LatLon | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  /** While two fingers are pinching, we stretch the map with CSS, then snap to a real zoom level. */
  const [pinch, setPinch] = useState<{ scale: number; originX: number; originY: number } | null>(null);
  const dark = usePrefersDark();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const radiusMeters = radiusMiles * METERS_PER_MILE;
  // Zoom to fit the cameras you actually have (at least 2 miles, at most the search radius).
  const farthest = cameras.reduce((max, c) => Math.max(max, c.distance), 0);
  const fitMeters = Math.min(radiusMeters, Math.max(2 * METERS_PER_MILE, farthest * 1.1));
  const autoZoom = zoomForRadius(me.lat, fitMeters, Math.min(size.width, size.height) || 300);
  const zoom = manualZoom ?? autoZoom;
  const center = project(manualCenter ?? me, zoom);
  const tiles = useMemo(
    () => visibleTiles(center, zoom, size.width, size.height),
    [center.x, center.y, zoom, size.width, size.height], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const toScreen = (p: LatLon): Point => {
    const world = project(p, zoom);
    return { x: world.x - center.x + size.width / 2, y: world.y - center.y + size.height / 2 };
  };
  const onScreen = (p: Point) => p.x > -24 && p.y > -24 && p.x < size.width + 24 && p.y < size.height + 24;

  /** Zoom by `steps` levels, keeping the map point under (x, y) in place: that's how pinch/double-tap feel natural. */
  const zoomAround = (x: number, y: number, steps: number) => {
    const next = clampZoom(zoom + steps);
    if (next === zoom) return;
    const factor = 2 ** (next - zoom);
    const offsetX = x - size.width / 2;
    const offsetY = y - size.height / 2;
    const worldX = (center.x + offsetX) * factor;
    const worldY = (center.y + offsetY) * factor;
    setManualZoom(next);
    setManualCenter(unproject({ x: worldX - offsetX, y: worldY - offsetY }, next));
  };
  // Event listeners registered once need the latest version of this function.
  const zoomAroundRef = useRef(zoomAround);
  zoomAroundRef.current = zoomAround;

  const localPoint = (clientX: number, clientY: number): Point => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  // Mouse wheel / trackpad zoom, around the cursor.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAroundRef.current(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---- Touch & mouse gestures: drag to pan, pinch to zoom, double-tap to zoom in ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>(null);
  const pinchRef = useRef(pinch);
  pinchRef.current = pinch;
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const isControl = (target: EventTarget) => !!(target as HTMLElement).closest('button, a, .map-popup');
  const twoFingerDistance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (isControl(e.target)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const mid = localPoint((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      gesture.current = { kind: 'pinch', startDist: twoFingerDistance() || 1 };
      setPinch({ scale: 1, originX: mid.x, originY: mid.y });
    } else if (pointers.current.size === 1) {
      gesture.current = { kind: 'drag', id: e.pointerId, startX: e.clientX, startY: e.clientY, startCenter: center, moved: false };
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g?.kind === 'pinch' && pointers.current.size >= 2) {
      // Limit the stretch to what the zoom range allows.
      const scale = Math.min(2 ** (MAX_ZOOM - zoom), Math.max(2 ** (MIN_ZOOM - zoom), twoFingerDistance() / g.startDist));
      setPinch((p) => (p ? { ...p, scale } : p));
    } else if (g?.kind === 'drag' && g.id === e.pointerId) {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      g.moved = true;
      setManualCenter(unproject({ x: g.startCenter.x - dx, y: g.startCenter.y - dy }, zoom));
    }
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;

    if (g?.kind === 'pinch') {
      if (pointers.current.size < 2) {
        const p = pinchRef.current;
        if (p && !cancelled) zoomAround(p.originX, p.originY, Math.round(Math.log2(p.scale)));
        setPinch(null);
        gesture.current = null; // the remaining finger does nothing until lifted
      }
      return;
    }

    if (g?.kind === 'drag' && g.id === e.pointerId) {
      gesture.current = null;
      if (g.moved || cancelled) return;
      // A tap: double-tap zooms in where you tapped; a single tap closes any open popup.
      const p = localPoint(e.clientX, e.clientY);
      const t = Date.now();
      const prev = lastTap.current;
      if (prev && t - prev.t < DOUBLE_TAP_MS && Math.hypot(p.x - prev.x, p.y - prev.y) < DOUBLE_TAP_PX) {
        lastTap.current = null;
        zoomAround(p.x, p.y, 1);
      } else {
        lastTap.current = { t, x: p.x, y: p.y };
        setSelected(null);
      }
    }
  };

  const recenter = () => {
    setManualCenter(null);
    setManualZoom(null);
  };

  const meScreen = toScreen(me);
  const radiusPx = radiusMeters / metersPerPixel(me.lat, zoom);
  const isSelected = (type: NonNullable<Selected>['type'], id: string) => selected?.type === type && selected.id === id;
  const selectedCamera = selected?.type === 'camera' ? cameras.find((c) => c.camera.id === selected.id) : undefined;
  const selectedIncident = selected?.type === 'incident' ? incidents.find((i) => i.id === selected.id) : undefined;
  const selectedSign = selected?.type === 'sign' ? signs.find((s) => s.id === selected.id) : undefined;
  // Working cameras on top of offline ones; the selected pin on top of everything.
  const orderedCameras = [...cameras].sort(
    (a, b) =>
      Number(isSelected('camera', a.camera.id)) - Number(isSelected('camera', b.camera.id)) ||
      Number(!a.camera.unavailable) - Number(!b.camera.unavailable),
  );
  const toggle = (next: NonNullable<Selected>) =>
    setSelected((cur) => (cur?.type === next.type && cur.id === next.id ? null : next));

  return (
    <div
      ref={containerRef}
      className={`map ${dark ? 'dark' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endPointer(e)}
      onPointerCancel={(e) => endPointer(e, true)}
      role="region"
      aria-label="Map of nearby cameras and traffic"
    >
      <div
        className="map-layer"
        style={pinch ? { transform: `scale(${pinch.scale})`, transformOrigin: `${pinch.originX}px ${pinch.originY}px` } : undefined}
      >
        <div className="map-tiles" aria-hidden="true">
          {tiles.map((t) => (
            <img
              key={t.key}
              src={tileUrl(t)}
              alt=""
              draggable={false}
              className="map-tile"
              style={{ left: t.left, top: t.top }}
              onLoad={(e) => e.currentTarget.classList.add('loaded')}
            />
          ))}
        </div>

        {/* The search radius, and the "flashlight" zones that decide ahead vs behind. */}
        {size.width > 0 && (
          <svg className="map-overlay" width={size.width} height={size.height} aria-hidden="true">
            <circle cx={meScreen.x} cy={meScreen.y} r={radiusPx} className="map-radius" />
            {heading !== null && (
              <>
                <path d={wedgePath(meScreen.x, meScreen.y, radiusPx, heading - coneDeg, heading + coneDeg)} className="map-zone ahead" />
                <path
                  d={wedgePath(meScreen.x, meScreen.y, radiusPx, heading + 180 - coneDeg, heading + 180 + coneDeg)}
                  className="map-zone behind"
                />
              </>
            )}
          </svg>
        )}

        {signs.map((s) => {
          const p = toScreen(s);
          if (!onScreen(p)) return null;
          return (
            <button
              key={s.id}
              type="button"
              className={`map-pin pin-sign ${isSelected('sign', s.id) ? 'selected' : ''}`}
              style={{ left: p.x, top: p.y }}
              onClick={() => toggle({ type: 'sign', id: s.id })}
              aria-label={`Freeway sign: ${s.lines.join(' ')}`}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <rect x="2" y="5" width="20" height="11" rx="1.5" fill="currentColor" />
                <path d="M7 16v4M17 16v4" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
          );
        })}

        {orderedCameras.map(({ camera, relation }) => {
          const p = toScreen(camera);
          if (!onScreen(p)) return null;
          const fresh = camera.unavailable ? 'offline' : freshness(ageMs(camera.imageTakenAt, now));
          return (
            <button
              key={camera.id}
              type="button"
              className={`map-pin pin-${relation} ${camera.unavailable ? 'pin-offline' : ''} ${isSelected('camera', camera.id) ? 'selected' : ''}`}
              style={{ left: p.x, top: p.y }}
              onClick={() => toggle({ type: 'camera', id: camera.id })}
              aria-label={`${friendlyCameraName(camera.name)}, ${camera.unavailable ? 'offline' : RELATION_LABEL[relation].toLowerCase()}`}
            >
              {camera.facing ? (
                <span className="pin-facing" style={{ transform: `rotate(${compassDegrees(camera.facing)}deg)` }} aria-hidden="true" />
              ) : camera.roadAxisDeg !== null && !camera.unavailable ? (
                <span className="pin-axis" style={{ transform: `translate(-50%, -50%) rotate(${camera.roadAxisDeg}deg)` }} aria-hidden="true" />
              ) : null}
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path
                  d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Zm8 3.2a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z"
                  fill="currentColor"
                />
                {camera.unavailable && <path d="M3 3 21 21" stroke="currentColor" strokeWidth="2.5" />}
              </svg>
              <span className={`pin-fresh age-${fresh}`} aria-hidden="true" />
            </button>
          );
        })}

        {incidents.map((inc) => {
          const p = toScreen(inc);
          if (!onScreen(p)) return null;
          return (
            <button
              key={inc.id}
              type="button"
              className={`map-pin pin-incident kind-${inc.kind.toLowerCase().replace(/\s+/g, '-')} ${isSelected('incident', inc.id) ? 'selected' : ''}`}
              style={{ left: p.x, top: p.y }}
              onClick={() => toggle({ type: 'incident', id: inc.id })}
              aria-label={`${inc.kind}: ${inc.description}`}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path d="M12 3 22 20H2Z" fill="currentColor" />
                <path d="M12 9v5M12 16.5v.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          );
        })}

        {/* You */}
        <div className="map-me" style={{ left: meScreen.x, top: meScreen.y }} aria-label="You are here" role="img">
          {heading !== null && (
            <svg className="map-me-arrow" viewBox="0 0 40 40" style={{ transform: `translate(-50%, -50%) rotate(${heading}deg)` }}>
              <path d="M20 2 L27 16 L20 13 L13 16 Z" />
            </svg>
          )}
          <span className="map-me-dot" />
        </div>
      </div>

      <div className="map-legend" aria-hidden="true">
        <span><i className="key key-me" />You</span>
        {heading !== null ? (
          <>
            <span><i className="key key-ahead" />Ahead</span>
            <span><i className="key key-behind" />Behind</span>
          </>
        ) : (
          <span><i className="key key-nearby" />Camera</span>
        )}
        <span><i className="key key-offline" />Offline</span>
        {incidents.length > 0 && <span><i className="key key-incident" />Incident</span>}
        {signs.length > 0 && <span><i className="key key-sign" />Sign</span>}
      </div>

      <div className="map-controls">
        <button type="button" onClick={() => zoomAround(size.width / 2, size.height / 2, 1)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomAround(size.width / 2, size.height / 2, -1)} aria-label="Zoom out">
          −
        </button>
        {(manualCenter || manualZoom !== null) && (
          <button type="button" onClick={recenter} aria-label="Center on me" title="Center on me">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="12" cy="12" r="3.5" fill="currentColor" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {selectedCamera && (
        <div className="map-popup">
          <button type="button" className="map-popup-img" onClick={() => onOpen(selectedCamera.camera)} aria-label="Enlarge image">
            <img src={withCacheBust(selectedCamera.camera.imageUrl, refreshKey)} alt="" />
          </button>
          <div className="map-popup-body">
            <strong>{friendlyCameraName(selectedCamera.camera.name)}</strong>
            <span className="muted">
              {RELATION_LABEL[selectedCamera.relation]} · {formatDistance(selectedCamera.distance)} ·{' '}
              {selectedCamera.camera.unavailable ? 'camera offline' : formatAge(ageMs(selectedCamera.camera.imageTakenAt, now))}
            </span>
            {selectedCamera.camera.facing ? (
              <span className="muted">Looks {selectedCamera.camera.facing.toLowerCase()}</span>
            ) : selectedCamera.camera.roadAxisDeg !== null ? (
              <span className="muted">Looks {axisDirections(selectedCamera.camera.roadAxisDeg).join(' or ')} (road runs {axisLabel(selectedCamera.camera.roadAxisDeg)})</span>
            ) : null}
          </div>
          <button type="button" className="map-popup-close" onClick={() => setSelected(null)} aria-label="Close">
            ×
          </button>
        </div>
      )}

      {selectedIncident && (
        <div className="map-popup">
          <div className="map-popup-icon pin-incident" aria-hidden="true">!</div>
          <div className="map-popup-body">
            <strong>{selectedIncident.kind}</strong>
            <span>{selectedIncident.description}</span>
            <span className="muted">
              {selectedIncident.location}
              {selectedIncident.startedAt ? ` · reported ${formatAge(ageMs(selectedIncident.startedAt, now))}` : ''} · CHP
            </span>
          </div>
          <button type="button" className="map-popup-close" onClick={() => setSelected(null)} aria-label="Close">
            ×
          </button>
        </div>
      )}

      {selectedSign && (
        <div className="map-popup">
          <div className="sign-face">
            {selectedSign.lines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
          <div className="map-popup-body">
            <strong>Freeway sign</strong>
            <span className="muted">
              {selectedSign.route} {selectedSign.direction ? `${selectedSign.direction.toLowerCase()}bound` : ''}
              {selectedSign.postedAt ? ` · posted ${formatAge(ageMs(selectedSign.postedAt, now))}` : ''}
            </span>
          </div>
          <button type="button" className="map-popup-close" onClick={() => setSelected(null)} aria-label="Close">
            ×
          </button>
        </div>
      )}

      <div className="map-attribution">
        ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>{' '}
        contributors · Traffic: CHP, Caltrans
      </div>
    </div>
  );
}
