import { useCallback, useMemo, useState } from 'react';
import { CameraCard } from './components/CameraCard';
import { CameraSection } from './components/CameraSection';
import { Lightbox } from './components/Lightbox';
import { MapView } from './components/MapView';
import { StartScreen } from './components/StartScreen';
import { StatusBar } from './components/StatusBar';
import { TrafficList } from './components/TrafficList';
import { useCameras } from './hooks/useCameras';
import { useLocation, type LocationMode } from './hooks/useLocation';
import { useNow } from './hooks/useNow';
import { useTraffic } from './hooks/useTraffic';
import { classifyRelation, distanceMeters } from './lib/geo';
import { guessCurrentRoute } from './lib/route';
import { loadRadiusMiles, saveRadiusMiles } from './lib/settings';
import type { LatLon, NearbyCamera, Relation } from './lib/types';

const MAX_PER_SECTION = 12;

const MAP_PREF_KEY = 'roadcam.showMap';

function initialShowMap(): boolean {
  try {
    return window.localStorage.getItem(MAP_PREF_KEY) !== 'false';
  } catch {
    return true; // storage can throw in private browsing; default to showing the map
  }
}

/** `?at=47.2529,-122.4443` pins the app to a spot (handy for previewing Tacoma from anywhere). */
function fixedSpot(): LatLon | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(new URLSearchParams(window.location.search).get('at') ?? '');
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

const FIXED_AT = fixedSpot();

function initialMode(): LocationMode {
  if (FIXED_AT) return 'fixed';
  return new URLSearchParams(window.location.search).get('demo') === '1' ? 'demo' : 'off';
}

interface Placed {
  camera: NearbyCamera;
  distance: number;
  relation: Relation | 'nearby';
}

export function App() {
  const [mode, setMode] = useState<LocationMode>(initialMode);
  // Start on the radius you picked last time (or 25 mi), and remember any new pick.
  const [radiusMiles, setRadiusMiles] = useState(() => loadRadiusMiles());
  const changeRadius = (miles: number) => {
    setRadiusMiles(miles);
    saveRadiusMiles(miles);
  };
  const [open, setOpen] = useState<NearbyCamera | null>(null);
  const [showMap, setShowMap] = useState(initialShowMap);
  const toggleMap = () =>
    setShowMap((v) => {
      try {
        window.localStorage.setItem(MAP_PREF_KEY, String(!v));
      } catch {
        // ignore: the toggle still works for this visit
      }
      return !v;
    });

  // Bumped on each "Use my location" tap, so you can retry after denying permission.
  const [attempt, setAttempt] = useState(0);
  const location = useLocation(mode, attempt, FIXED_AT);
  const cameras = useCameras(location.position, radiusMiles, mode === 'demo');
  const traffic = useTraffic(location.position, radiusMiles, mode === 'demo');
  const now = useNow(1000);
  const closeLightbox = useCallback(() => setOpen(null), []);

  // Sort every camera into ahead / behind / side using where you are *right now*.
  const placed = useMemo<Placed[]>(() => {
    const pos = location.position;
    if (!pos || !cameras.data) return [];
    return cameras.data.cameras
      .map((camera) => ({
        camera,
        distance: distanceMeters(pos, camera),
        relation: location.heading === null ? ('nearby' as const) : classifyRelation(pos, location.heading, camera),
      }))
      // Working cameras first, then offline ones; closest first within each.
      .sort((a, b) => Number(a.camera.unavailable) - Number(b.camera.unavailable) || a.distance - b.distance);
  }, [cameras.data, location.position, location.heading]);

  // Which highway are you on? Worked out from the cameras around you.
  const route = useMemo(
    () => (location.position && cameras.data ? guessCurrentRoute(location.position, cameras.data.cameras) : null),
    [cameras.data, location.position],
  );

  if (mode === 'off' || location.status === 'denied' || location.status === 'unavailable') {
    return (
      <StartScreen
        error={location.error}
        onStartLive={() => {
          setMode('live');
          setAttempt((n) => n + 1);
        }}
        onStartDemo={() => setMode('demo')}
      />
    );
  }

  const by = (r: Placed['relation']) => placed.filter((p) => p.relation === r).slice(0, MAX_PER_SECTION);
  const refreshKey = cameras.fetchedAt ?? 0;
  const renderCards = (list: Placed[]) =>
    list.map(({ camera, distance }) => (
      <CameraCard
        key={camera.id}
        camera={camera}
        distanceMeters={distance}
        now={now}
        refreshKey={refreshKey}
        onOpen={setOpen}
        heading={location.heading}
      />
    ));
  const offlineCount = placed.filter((p) => p.camera.unavailable).length;

  const headingKnown = location.heading !== null;
  const waiting = !cameras.data && (cameras.loading || location.status === 'locating');
  const failedWithNoData = !cameras.data && !!cameras.error;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          <span>RoadCam</span>
        </div>
        <StatusBar
          location={location}
          demo={mode === 'demo'}
          route={route}
          radiusMiles={radiusMiles}
          onRadiusChange={changeRadius}
          showMap={showMap}
          onToggleMap={toggleMap}
          onStop={() => setMode('off')}
        />
      </header>

      {mode === 'fixed' && (
        <p className="banner">Preview mode: showing a pinned spot from the link, not your GPS.</p>
      )}
      {mode === 'demo' && (
        <p className="banner">Demo mode: a simulated drive north on I-5 with sample images.</p>
      )}
      {cameras.error && <p className="banner banner-error" role="alert">Couldn’t load cameras: {cameras.error}</p>}
      {cameras.data?.warnings.length ? (
        <p className="banner banner-warn">Some camera data is missing right now: {cameras.data.warnings.join(', ')}.</p>
      ) : null}

      {showMap && location.position && (
        <div className="map-wrap">
          <MapView
            me={location.position}
            heading={location.heading}
            cameras={placed}
            incidents={traffic?.incidents ?? []}
            signs={traffic?.signs ?? []}
            flow={traffic?.flow ?? []}
            radiusMiles={radiusMiles}
            now={now}
            refreshKey={refreshKey}
            onOpen={setOpen}
          />
        </div>
      )}

      {location.position && traffic && (
        <TrafficList
          me={location.position}
          heading={location.heading}
          incidents={traffic.incidents}
          signs={traffic.signs}
          flow={traffic.flow ?? []}
          now={now}
        />
      )}

      {placed.length > 0 && (
        <p className="tip">
          {offlineCount > 0 && (
            <>
              <strong>
                {offlineCount} of {placed.length} cameras are offline
              </strong>{' '}
              (Caltrans shows “Temporarily Unavailable”); they’re listed last.{' '}
            </>
          )}
          Reading a picture: red taillights are moving away from the camera, white headlights are coming toward it. Where
          Caltrans says which way a camera points, the lanes are labeled.
        </p>
      )}

      {failedWithNoData ? (
        <main className="loading">Retrying shortly…</main>
      ) : waiting ? (
        <main className="loading" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          {location.status === 'locating' ? 'Finding your location…' : 'Finding nearby cameras…'}
        </main>
      ) : headingKnown ? (
        <main className="columns">
          <CameraSection title="Ahead" icon="▲" count={by('ahead').length} emptyText={`No cameras ahead within ${radiusMiles} miles.`}>
            {renderCards(by('ahead'))}
          </CameraSection>
          <CameraSection title="Behind" icon="▼" count={by('behind').length} emptyText={`No cameras behind within ${radiusMiles} miles.`}>
            {renderCards(by('behind'))}
          </CameraSection>
          {by('side').length > 0 && (
            <details className="side">
              <summary>Off to the side ({by('side').length})</summary>
              <div className="grid">{renderCards(by('side'))}</div>
            </details>
          )}
        </main>
      ) : (
        <main className="columns single">
          <p className="hint">Start moving and RoadCam will split these into ahead and behind.</p>
          <CameraSection title="Nearby" icon="●" count={by('nearby').length} emptyText={`No cameras within ${radiusMiles} miles. Try a bigger radius.`}>
            {renderCards(by('nearby'))}
          </CameraSection>
        </main>
      )}

      <footer className="footer">
        Camera images © Caltrans. Ages update live; pictures refresh every minute.
        <strong> Passengers only.</strong>
      </footer>

      {open && <Lightbox camera={open} now={now} refreshKey={refreshKey} onClose={closeLightbox} heading={location.heading} />}
    </div>
  );
}
