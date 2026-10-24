import { compassLabel } from '../lib/geo';
import type { LocationState } from '../hooks/useLocation';

interface Props {
  location: LocationState;
  demo: boolean;
  radiusMiles: number;
  onRadiusChange: (miles: number) => void;
  onStop: () => void;
}

export const RADIUS_OPTIONS = [10, 25, 50];

export function StatusBar({ location, demo, radiusMiles, onRadiusChange, onStop }: Props) {
  const { heading, speed, status } = location;
  const mph = speed !== null ? Math.round(speed * 2.23694) : null;

  return (
    <div className="status">
      <div className="status-left">
        <span className={`live ${status === 'tracking' ? 'on' : ''}`}>
          <span className="dot" aria-hidden="true" />
          {demo ? 'Demo drive' : status === 'tracking' ? 'Live GPS' : 'Locating…'}
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
          {heading === null ? 'Heading —' : `Heading ${compassLabel(heading)}`}
        </span>
        {mph !== null && <span className="speed">{mph} mph</span>}
      </div>
      <div className="status-right">
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
