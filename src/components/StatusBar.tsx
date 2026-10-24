import { compassLabel } from '../lib/geo';
import type { RouteGuess } from '../lib/route';
import type { LocationState } from '../hooks/useLocation';

interface Props {
  location: LocationState;
  demo: boolean;
  /** Our best guess at the highway you're on, or null if we can't tell. */
  route: RouteGuess | null;
  radiusMiles: number;
  onRadiusChange: (miles: number) => void;
  showMap: boolean;
  onToggleMap: () => void;
  onStop: () => void;
}

export const RADIUS_OPTIONS = [10, 25, 50];

export function StatusBar({ location, demo, route, radiusMiles, onRadiusChange, showMap, onToggleMap, onStop }: Props) {
  const { heading, speed, status } = location;
  const mph = speed !== null ? Math.round(speed * 2.23694) : null;

  return (
    <div className="status">
      <div className="status-left">
        <span className={`live ${status === 'tracking' ? 'on' : ''}`}>
          <span className="dot" aria-hidden="true" />
          {demo ? 'Demo drive' : location.accuracyMeters === 0 ? 'Pinned spot' : status === 'tracking' ? 'Live GPS' : 'Locating…'}
        </span>
        <span
          className={`road ${route ? 'known' : ''}`}
          title={
            route
              ? `Best guess from the highway cameras around you${route.nearbyPlace ? `, near ${route.nearbyPlace}` : ''}`
              : 'Not near a highway with cameras'
          }
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M8 3 4 21M16 3l4 18M12 4v3M12 10.5v3M12 17v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
          {route ? `On ${route.route}` : 'Highway —'}
        </span>
        <span className="heading" title="Direction of travel">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            style={{ transform: `rotate(${heading ?? 0}deg)`, opacity: heading === null ? 0.35 : 1 }}
          >
            <path d="M12 2 L19 21 L12 17 L5 21 Z" fill="currentColor" />
          </svg>
          <span className="sr-only">Heading </span>
          {heading === null ? '—' : compassLabel(heading)}
        </span>
        {mph !== null && <span className="speed">{mph} mph</span>}
      </div>
      <div className="status-right">
        <button type="button" className={`ghost ${showMap ? 'pressed' : ''}`} onClick={onToggleMap} aria-pressed={showMap}>
          Map
        </button>
        <label className="radius">
          <span className="sr-only">Search radius</span>
          <select value={radiusMiles} onChange={(e) => onRadiusChange(Number(e.target.value))}>
            {RADIUS_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r} mi
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="ghost" onClick={onStop}>
          Stop
        </button>
      </div>
    </div>
  );
}
