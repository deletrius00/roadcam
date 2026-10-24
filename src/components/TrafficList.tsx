import { ageMs, formatAge } from '../lib/age';
import { alertIcon, kindClass } from '../lib/alertIcons';
import { classifyRelation, distanceMeters, formatDistance } from '../lib/geo';
import type { FlowReading, Incident, LatLon, SignMessage } from '../lib/types';
import { FLOW_LABEL } from './MapView';

interface Props {
  me: LatLon;
  heading: number | null;
  incidents: Incident[];
  signs: SignMessage[];
  flow?: FlowReading[];
  now: number;
}

const MAX_ITEMS = 8;

type Item =
  | { type: 'incident'; item: Incident; distance: number; ahead: boolean | null }
  | { type: 'sign'; item: SignMessage; distance: number; ahead: boolean | null }
  | { type: 'flow'; item: FlowReading; distance: number; ahead: boolean | null };

/** The closest traffic alerts, with the ones ahead of you first. */
export function TrafficList({ me, heading, incidents, signs, flow = [], now }: Props) {
  const where = (p: LatLon) => {
    if (heading === null) return null;
    const r = classifyRelation(me, heading, p);
    return r === 'ahead' ? true : r === 'behind' ? false : null;
  };
  const items: Item[] = [
    ...incidents.map((i) => ({ type: 'incident' as const, item: i, distance: distanceMeters(me, i), ahead: where(i) })),
    ...signs.map((s) => ({ type: 'sign' as const, item: s, distance: distanceMeters(me, s), ahead: where(s) })),
    // Only the slow spots: green "flowing freely" sensors aren't alerts.
    ...flow
      .filter((f) => f.level === 'Heavy' || f.level === 'StopAndGo')
      .map((f) => ({ type: 'flow' as const, item: f, distance: distanceMeters(me, f), ahead: where(f) })),
  ]
    .sort((a, b) => Number(b.ahead === true) - Number(a.ahead === true) || a.distance - b.distance)
    .slice(0, MAX_ITEMS);

  if (items.length === 0) return null;

  return (
    <section className="traffic" aria-label="Traffic alerts">
      <h2>
        Traffic alerts <span className="count">{items.length}</span>
      </h2>
      <ul>
        {items.map((entry) => {
          const position = `${formatDistance(entry.distance)}${entry.ahead === true ? ' ahead' : entry.ahead === false ? ' behind' : ''}`;
          if (entry.type === 'flow') {
            return (
              <li key={entry.item.id} className="traffic-item">
                <span className={`traffic-icon flow-${entry.item.level}`} aria-hidden="true" />
                <span className="traffic-text">
                  <strong>{FLOW_LABEL[entry.item.level]}</strong>
                  <span>
                    {entry.item.route} {entry.item.direction ? `${entry.item.direction.toLowerCase()}bound` : ''} at {entry.item.name}
                  </span>
                  <span className="muted">WSDOT road sensor, live</span>
                </span>
                <span className="traffic-dist">{position}</span>
              </li>
            );
          }
          return entry.type === 'incident' ? (
            <li key={entry.item.id} className="traffic-item">
              <span className={`traffic-icon incident emoji ${kindClass(entry.item.kind)}`} aria-hidden="true">
                {alertIcon(entry.item.kind)}
              </span>
              <span className="traffic-text">
                <strong>{entry.item.kind}</strong>
                <span>{entry.item.description}</span>
                <span className="muted">
                  {entry.item.location}
                  {entry.item.startedAt ? ` · ${formatAge(ageMs(entry.item.startedAt, now))}` : ''}
                  {entry.item.delaySeconds ? ` · +${Math.round(entry.item.delaySeconds / 60)} min delay` : ''}
                  {` · ${entry.item.source ?? 'CHP'}`}
                </span>
              </span>
              <span className="traffic-dist">{position}</span>
            </li>
          ) : (
            <li key={entry.item.id} className="traffic-item">
              <span className="traffic-icon sign" aria-hidden="true">▭</span>
              <span className="traffic-text">
                <strong>Freeway sign</strong>
                <span>“{entry.item.lines.join(' ')}”</span>
                <span className="muted">
                  {entry.item.route} {entry.item.direction ? `${entry.item.direction.toLowerCase()}bound` : ''}
                </span>
              </span>
              <span className="traffic-dist">{position}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
