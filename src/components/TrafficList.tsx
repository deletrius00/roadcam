import { ageMs, formatAge } from '../lib/age';
import { classifyRelation, distanceMeters, formatDistance } from '../lib/geo';
import type { Incident, LatLon, SignMessage } from '../lib/types';

interface Props {
  me: LatLon;
  heading: number | null;
  incidents: Incident[];
  signs: SignMessage[];
  now: number;
}

const MAX_ITEMS = 6;

type Item =
  | { type: 'incident'; item: Incident; distance: number; ahead: boolean | null }
  | { type: 'sign'; item: SignMessage; distance: number; ahead: boolean | null };

/** The closest traffic alerts, with the ones ahead of you first. */
export function TrafficList({ me, heading, incidents, signs, now }: Props) {
  const where = (p: LatLon) => {
    if (heading === null) return null;
    const r = classifyRelation(me, heading, p);
    return r === 'ahead' ? true : r === 'behind' ? false : null;
  };
  const items: Item[] = [
    ...incidents.map((i) => ({ type: 'incident' as const, item: i, distance: distanceMeters(me, i), ahead: where(i) })),
    ...signs.map((s) => ({ type: 'sign' as const, item: s, distance: distanceMeters(me, s), ahead: where(s) })),
  ]
    .sort((a, b) => Number(b.ahead === true) - Number(a.ahead === true) || a.distance - b.distance)
    .slice(0, MAX_ITEMS);

  if (items.length === 0) return null;

  return (
    <section className="traffic" aria-label="Traffic alerts">
      <h2>
        Traffic alerts <span className="count">{incidents.length + signs.length}</span>
      </h2>
      <ul>
        {items.map((entry) => {
          const position = `${formatDistance(entry.distance)}${entry.ahead === true ? ' ahead' : entry.ahead === false ? ' behind' : ''}`;
          return entry.type === 'incident' ? (
            <li key={entry.item.id} className="traffic-item">
              <span className={`traffic-icon incident kind-${entry.item.kind.toLowerCase().replace(/\s+/g, '-')}`} aria-hidden="true">
                !
              </span>
              <span className="traffic-text">
                <strong>{entry.item.kind}</strong>
                <span>{entry.item.description}</span>
                <span className="muted">
                  {entry.item.location}
                  {entry.item.startedAt ? ` · ${formatAge(ageMs(entry.item.startedAt, now))}` : ''}
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
