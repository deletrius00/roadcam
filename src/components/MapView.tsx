import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { usePrefersDark } from '../hooks/usePrefersDark';
import { ageMs, formatAge, freshness } from '../lib/age';
import { formatDistance, METERS_PER_MILE } from '../lib/geo';
import { friendlyCameraName } from '../lib/names';
import {
  clampZoom,
  metersPerPixel,
  project,
  tileUrl,
  unproject,
  visibleTiles,
  wedgePath,
  zoomForRadius,
  type Point,
} from '../lib/tiles';
import type { LatLon, NearbyCamera, Relation } from '../lib/types';
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
  radiusMiles: number;
  /** Half-width of the ahead/behind "flashlight" in degrees (matches classifyRelation). */
  coneDeg?: number;
  now: number;
  refreshKey: number;
  onOpen: (camera: NearbyCamera) => void;
}

/** Below this many pixels of movement, a press counts as a tap, not a drag. */
const DRAG_THRESHOLD_PX = 5;

const RELATION_LABEL: Record<MapCamera['relation'], string> = {
  ahead: 'Ahead',
  behind: 'Behind',
  side: 'Off to the side',
  nearby: 'Nearby',
};

export function MapView({ me, heading, cameras, radiusMiles, coneDeg = 60, now, refreshKey, onOpen }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  /** null = automatic zoom that fits the search radius. */
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  /** null = follow my position. Set once you drag the map. */
  const [manualCenter, setManualCenter] = useState<LatLon | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dark = usePrefersDark();

  // Keep track of the map's size on screen.
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
  // Zoom to fit the cameras you actually have (at least 2 miles, at most the search radius),
  // so they aren't all bunched up in the middle.
  const farthest = cameras.reduce((max, c) => Math.max(max, c.distance), 0);
  const fitMeters = Math.min(radiusMeters, Math.max(2 * METERS_PER_MILE, farthest * 1.1));
  const autoZoom = zoomForRadius(me.lat, fitMeters, Math.min(size.width, size.height) || 300);
  const zoom = manualZoom ?? autoZoom;
  const centerLatLon = manualCenter ?? me;
  const center = project(centerLatLon, zoom);
  const tiles = useMemo(
    () => visibleTiles(center, zoom, size.width, size.height),
    [center.x, center.y, zoom, size.width, size.height], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** GPS position → pixel position inside the map box. */
  const toScreen = (p: LatLon): Point => {
    const world = project(p, zoom);
    return { x: world.x - center.x + size.width / 2, y: world.y - center.y + size.height / 2 };
  };

  // Mouse-wheel / trackpad zoom (needs a non-passive listener to stop the page scrolling).
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setManualZoom(clampZoom(zoomRef.current + (e.deltaY < 0 ? 1 : -1)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Drag to pan. We only "capture" the pointer once it has really moved, so taps on pins still work.
  const drag = useRef<{ id: number; startX: number; startY: number; startCenter: Point; moved: boolean } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a, .map-popup')) return;
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, startCenter: center, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!d.moved) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setManualCenter(unproject({ x: d.startCenter.x - dx, y: d.startCenter.y - dy }, zoom));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && !(e.target as HTMLElement).closest('button, a, .map-popup')) setSelectedId(null);
  };

  const recenter = () => {
    setManualCenter(null);
    setManualZoom(null);
  };

  const meScreen = toScreen(me);
  const radiusPx = radiusMeters / metersPerPixel(me.lat, zoom);
  const selected = cameras.find((c) => c.camera.id === selectedId) ?? null;
  // Draw the selected pin last so it sits on top.
  const ordered = [...cameras].sort((a, b) => Number(a.camera.id === selectedId) - Number(b.camera.id === selectedId));

  return (
    <div
      ref={containerRef}
      className={`map ${dark ? 'dark' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      role="region"
      aria-label="Map of nearby cameras"
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

      {ordered.map(({ camera, relation }) => {
        const p = toScreen(camera);
        if (p.x < -20 || p.y < -20 || p.x > size.width + 20 || p.y > size.height + 20) return null;
        const fresh = freshness(ageMs(camera.imageTakenAt, now));
        return (
          <button
            key={camera.id}
            type="button"
            className={`map-pin pin-${relation} ${camera.id === selectedId ? 'selected' : ''}`}
            style={{ left: p.x, top: p.y }}
            onClick={() => setSelectedId(camera.id === selectedId ? null : camera.id)}
            aria-label={`${friendlyCameraName(camera.name)}, ${RELATION_LABEL[relation].toLowerCase()}`}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Zm8 3.2a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z"
                fill="currentColor"
              />
            </svg>
            <span className={`pin-fresh age-${fresh}`} aria-hidden="true" />
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
      </div>

      <div className="map-controls">
        <button type="button" onClick={() => setManualZoom(clampZoom(zoom + 1))} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => setManualZoom(clampZoom(zoom - 1))} aria-label="Zoom out">
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

      {selected && (
        <div className="map-popup">
          <button type="button" className="map-popup-img" onClick={() => onOpen(selected.camera)} aria-label="Enlarge image">
            <img src={withCacheBust(selected.camera.imageUrl, refreshKey)} alt="" />
          </button>
          <div className="map-popup-body">
            <strong>{friendlyCameraName(selected.camera.name)}</strong>
            <span className="muted">
              {RELATION_LABEL[selected.relation]} · {formatDistance(selected.distance)} ·{' '}
              {formatAge(ageMs(selected.camera.imageTakenAt, now))}
            </span>
          </div>
          <button type="button" className="map-popup-close" onClick={() => setSelectedId(null)} aria-label="Close">
            ×
          </button>
        </div>
      )}

      <div className="map-attribution">
        ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>{' '}
        contributors
      </div>
    </div>
  );
}
