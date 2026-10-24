import { useState } from 'react';
import { alertIcon, weatherIcon } from '../lib/alertIcons';
import { closureWhen, splitClosures } from '../lib/closures';
import { distanceMeters, formatDistance } from '../lib/geo';
import type { Closure, LatLon, WeatherAlert } from '../lib/types';

interface Props {
  me: LatLon;
  closures: Closure[];
  weather: WeatherAlert[];
  now: number;
}

const MAX_ITEMS = 10;

/** Weather alerts for where you are, then closures and roadwork with a Now / Upcoming switch. */
export function ClosuresList({ me, closures, weather, now }: Props) {
  const [tab, setTab] = useState<'now' | 'upcoming'>('now');
  const split = splitClosures(closures);
  const list = (tab === 'now' ? split.now : split.upcoming).slice(0, MAX_ITEMS);

  if (weather.length === 0 && closures.length === 0) return null;

  return (
    <>
      {weather.length > 0 && (
        <section className="traffic weather" aria-label="Weather alerts">
          <h2>
            Weather alerts <span className="count">{weather.length}</span>
          </h2>
          <ul>
            {weather.map((w) => (
              <li key={w.id} className={`traffic-item severity-${w.severity.toLowerCase()}`}>
                <span className="traffic-icon emoji" aria-hidden="true">
                  {weatherIcon(w.event)}
                </span>
                <span className="traffic-text">
                  <strong>{w.event}</strong>
                  <span>{w.headline}</span>
                  <span className="muted">{w.area} · National Weather Service</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {closures.length > 0 && (
        <section className="traffic closures" aria-label="Closures and roadwork">
          <h2>
            Closures &amp; roadwork
            <span className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'now'} className={tab === 'now' ? 'on' : ''} onClick={() => setTab('now')}>
                Now <span className="count">{split.now.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'upcoming'}
                className={tab === 'upcoming' ? 'on' : ''}
                onClick={() => setTab('upcoming')}
              >
                Upcoming <span className="count">{split.upcoming.length}</span>
              </button>
            </span>
          </h2>
          {list.length === 0 ? (
            <p className="muted empty">{tab === 'now' ? 'No closures right now.' : 'Nothing scheduled in the next 7 days.'}</p>
          ) : (
            <ul>
              {list.map((c) => (
                <li key={c.id} className={`traffic-item closure ${c.status}`}>
                  <span className="traffic-icon emoji" aria-hidden="true">
                    {alertIcon(c.what)}
                  </span>
                  <span className="traffic-text">
                    <strong>
                      {c.what}
                      {c.facility !== 'Highway' ? ` (${c.facility.toLowerCase()})` : ''} · {c.route}
                      {c.direction ? ` ${c.direction.toLowerCase()}` : ''}
                    </strong>
                    <span>{closureWhen(c, now)}</span>
                    <span className="muted">{[c.place, c.work, c.lanes, c.source].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="traffic-dist">{formatDistance(distanceMeters(me, c))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
