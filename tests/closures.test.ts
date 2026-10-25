import { describe, expect, it } from 'vitest';
import { closureWhat, lcsFeedUrl, parseLaneClosures } from '../server/lcs';
import { nwsAlertsUrl, parseNwsAlerts } from '../server/nws';
import { MAX_HALF_SIDE_KM, parseTomtomIncidents, routeFromRoadNumbers, tomtomIncidentsUrl } from '../server/tomtomIncidents';
import { wsdotAlertToClosure } from '../server/wsdot';
import { alertIcon, kindClass, weatherIcon } from '../src/lib/alertIcons';
import { closuresForMap, closureWhen, splitClosures } from '../src/lib/closures';
import type { Closure } from '../src/lib/types';

// "Now" for these tests: Sat Oct 24 2026, 12:30 PM Pacific.
const NOW = Date.parse('2026-10-24T19:30:00Z');
const sec = (iso: string) => String(Date.parse(iso) / 1000);

/** One Caltrans LCS record, shaped like the live feed (field names copied from lcsStatusD07.json). */
function lcs(o: {
  index: string;
  start: string;
  end: string;
  started?: boolean;
  done?: boolean;
  cancelled?: boolean;
  type?: string;
  facility?: string;
  work?: string;
  lanes?: string;
  total?: string;
  lat?: string;
}) {
  return {
    lcs: {
      index: o.index,
      location: {
        travelFlowDirection: 'North',
        begin: {
          beginLocationName: 'Avenue H',
          beginNearbyPlace: 'Lancaster',
          beginLatitude: o.lat ?? '34.718709',
          beginLongitude: '-118.169993',
          beginRoute: 'SR-14',
        },
        end: { endLocationName: 'Avenue F' },
      },
      closure: {
        closureTimestamp: { closureStartEpoch: sec(o.start), closureEndEpoch: sec(o.end), isClosureEndIndefinite: 'false' },
        facility: o.facility ?? 'Mainline',
        typeOfClosure: o.type ?? 'Full',
        typeOfWork: o.work ?? 'Pavement Work',
        lanesClosed: o.lanes ?? 'All',
        totalExistingLanes: o.total ?? '3',
        code1097: { isCode1097: String(!!o.started) },
        code1098: { isCode1098: String(!!o.done) },
        code1022: { isCode1022: String(!!o.cancelled) },
      },
    },
  };
}

describe('Caltrans lane closures (LCS)', () => {
  const feed = {
    data: [
      lcs({ index: 'active', start: '2026-10-24T12:01:00Z', end: '2026-10-24T23:59:00Z', started: true, type: 'Lane', lanes: '1, 2', total: '4' }),
      lcs({ index: 'monday', start: '2026-10-27T03:01:00Z', end: '2026-10-27T12:59:00Z' }),
      lcs({ index: 'cancelled', start: '2026-10-24T12:01:00Z', end: '2026-10-24T23:59:00Z', cancelled: true }),
      lcs({ index: 'finished', start: '2026-10-24T06:01:00Z', end: '2026-10-24T23:59:00Z', started: true, done: true }),
      lcs({ index: 'already-over', start: '2026-10-24T06:01:00Z', end: '2026-10-24T13:00:00Z' }),
      lcs({ index: 'too-far-ahead', start: '2026-11-05T06:01:00Z', end: '2026-11-05T13:00:00Z' }),
      lcs({ index: 'no-location', start: '2026-10-25T06:01:00Z', end: '2026-10-25T13:00:00Z', lat: '0.000001' }),
    ],
  };

  it('keeps what a driver needs: active now and upcoming within 7 days', () => {
    const closures = parseLaneClosures(feed, NOW);
    expect(closures.map((c) => [c.id, c.status])).toEqual([
      ['lcs-active', 'active'],
      ['lcs-monday', 'upcoming'],
    ]);
  });

  it('writes it in plain English', () => {
    const [active, monday] = parseLaneClosures(feed, NOW);
    expect(active).toMatchObject({
      route: 'SR-14',
      direction: 'Northbound',
      what: 'Lane closure',
      facility: 'Highway',
      work: 'Pavement work',
      place: 'Avenue H to Avenue F, Lancaster',
      lanes: 'Lanes 1, 2 of 4',
      source: 'Caltrans',
    });
    expect(monday).toMatchObject({ what: 'Full closure', lanes: 'All lanes', startsAt: '2026-10-27T03:01:00.000Z' });
  });

  it('survives junk', () => {
    expect(parseLaneClosures(null, NOW)).toEqual([]);
    expect(parseLaneClosures({ data: [{}, { lcs: {} }] }, NOW)).toEqual([]);
  });

  it('builds feed URLs and labels', () => {
    expect(lcsFeedUrl(7)).toBe('https://cwwp2.dot.ca.gov/data/d7/lcs/lcsStatusD07.json');
    expect(closureWhat('One-Way Traffic')).toBe('One-way traffic control');
    expect(closureWhat('???')).toBe('Closure');
  });
});

describe('National Weather Service alerts', () => {
  it('asks about a rounded point', () => {
    expect(nwsAlertsUrl(47.2529, -122.4443)).toBe('https://api.weather.gov/alerts/active?point=47.3,-122.4&status=actual');
  });

  it('puts the most severe first, drops cancellations and repeats', () => {
    const feature = (event: string, severity: string, extra: object = {}) => ({
      properties: { id: event, event, severity, headline: `${event} until 3 PM`, areaDesc: 'Tacoma', onset: '2026-10-24T08:00:00-07:00', ends: null, expires: '2026-10-24T15:00:00-07:00', ...extra },
    });
    const alerts = parseNwsAlerts({
      features: [
        feature('Dense Fog Advisory', 'Minor'),
        feature('Flood Warning', 'Severe'),
        feature('Dense Fog Advisory', 'Minor', { id: 'update' }),
        feature('Wind Advisory', 'Moderate', { messageType: 'Cancel' }),
      ],
    });
    expect(alerts.map((a) => a.event)).toEqual(['Flood Warning', 'Dense Fog Advisory']);
    expect(alerts[1]).toMatchObject({ headline: 'Dense Fog Advisory until 3 PM', area: 'Tacoma', endsAt: '2026-10-24T15:00:00-07:00' });
    expect(parseNwsAlerts({})).toEqual([]);
  });
});

describe('TomTom incidents', () => {
  const incident = (props: object, coordinates: unknown = [[-118.6, 34.4], [-118.61, 34.41]]) => ({
    geometry: { type: Array.isArray((coordinates as unknown[])[0]) ? 'LineString' : 'Point', coordinates },
    properties: { id: 'x', roadNumbers: ['Golden State Fwy S', 'I-5 S'], startTime: '2026-10-24T19:00:00Z', endTime: null, timeValidity: 'present', ...props },
  });

  it('keeps highway crashes, real jams and hazards; skips city streets and small slowdowns', () => {
    const { incidents, closures } = parseTomtomIncidents({
      incidents: [
        incident({ id: 'crash', iconCategory: 1, events: [{ description: 'Accident' }], from: 'Lake Hughes Rd (I-5)', to: 'Parker Rd (I-5)' }),
        incident({ id: 'jam', iconCategory: 6, magnitudeOfDelay: 3, delay: 449, events: [{ description: 'Stopped traffic' }] }),
        incident({ id: 'small-jam', iconCategory: 6, magnitudeOfDelay: 1 }),
        incident({ id: 'street', iconCategory: 1, roadNumbers: [] }),
        incident({ id: 'debris', iconCategory: 3, events: [{ description: 'Debris on road' }] }),
        incident({ id: 'fog', iconCategory: 2, events: [{ description: 'Fog' }] }, [-118.6, 34.4]),
      ],
    });
    expect(incidents.map((i) => [i.id, i.kind])).toEqual([
      ['tomtom-crash', 'Crash'],
      ['tomtom-jam', 'Traffic jam'],
      ['tomtom-debris', 'Hazard'],
      ['tomtom-fog', 'Fog'],
    ]);
    expect(incidents[0]).toMatchObject({ location: 'I-5 southbound · Lake Hughes Rd to Parker Rd', source: 'TomTom', lat: 34.4, lon: -118.6 });
    expect(incidents[1]!.delaySeconds).toBe(449);
    expect(incidents[3]).toMatchObject({ lat: 34.4, lon: -118.6 }); // Point geometry works too
    expect(closures).toEqual([]);
  });

  it('turns roadwork and closures (now and scheduled) into closures', () => {
    const { incidents, closures } = parseTomtomIncidents({
      incidents: [
        incident({ id: 'closed-later', iconCategory: 8, timeValidity: 'future', startTime: '2026-10-29T07:01:00Z', endTime: '2026-10-29T10:59:00Z', events: [{ description: 'Closed' }] }),
        incident({ id: 'works', iconCategory: 9, events: [{ description: 'Roadworks' }] }),
      ],
    });
    expect(incidents).toEqual([]);
    expect(closures.map((c) => [c.id, c.what, c.status, c.route, c.direction])).toEqual([
      ['tomtom-closed-later', 'Full closure', 'upcoming', 'I-5', 'Southbound'],
      ['tomtom-works', 'Roadwork', 'active', 'I-5', 'Southbound'],
    ]);
  });

  it('reads route names', () => {
    expect(routeFromRoadNumbers(['Ventura Fwy W', 'US-101 N'])).toEqual({ route: 'US-101', direction: 'Northbound' });
    expect(routeFromRoadNumbers(['CA-14 S'])).toEqual({ route: 'SR-14', direction: 'Southbound' });
    expect(routeFromRoadNumbers([])).toEqual({ route: '', direction: '' });
  });

  it('never asks for a box bigger than TomTom allows', () => {
    const url = new URL(tomtomIncidentsUrl({ lat: 34, lon: -118 }, 800_000, 'k'));
    const [w, s, e, n] = url.searchParams.get('bbox')!.split(',').map(Number);
    const heightKm = (n! - s!) * 111.32;
    const widthKm = (e! - w!) * 111.32 * Math.cos((34 * Math.PI) / 180);
    expect(heightKm * widthKm).toBeLessThanOrEqual(10_000);
    expect(heightKm).toBeCloseTo(MAX_HALF_SIDE_KM * 2, 0);
    expect(url.searchParams.get('timeValidityFilter')).toBe('present,future');
  });
});

describe('WSDOT roadwork as closures', () => {
  const alert = (kind: string, description: string) => ({ id: 'wsdot-alert-1', kind, description, location: 'SR 522', startedAt: null, lat: 47.7, lon: -122.2 });

  it('uses the wording to tell upcoming from now', () => {
    expect(wsdotAlertToClosure(alert('Lane closure', 'Low impact: Two lanes of westbound SR 522 will be closed nightly.'))).toMatchObject({
      status: 'upcoming',
      direction: 'Westbound',
      what: 'Lane closure',
      startsAt: null,
      source: 'WSDOT',
    });
    expect(wsdotAlertToClosure(alert('Road closure', 'High impact: SR 410 is closed at Crystal Mountain Blvd.'))?.status).toBe('active');
  });

  it('treats long-running work that "will remain" as happening now, and strips web links', () => {
    const text =
      'Low impact: The right lane of northbound I-5 is closed from East 28th Street to 20th Street East. The lane closure will remain in place through August 2027.';
    expect(wsdotAlertToClosure(alert('Roadwork', text))?.status).toBe('active');
  });

  it('leaves crashes and hazards alone', () => {
    expect(wsdotAlertToClosure(alert('Crash or incident', 'Collision'))).toBeNull();
  });
});

describe('closure wording and order', () => {
  const closure = (o: Partial<Closure>): Closure => ({
    id: 'c',
    route: 'I-5',
    direction: '',
    what: 'Lane closure',
    facility: 'Highway',
    work: '',
    place: '',
    lanes: '',
    startsAt: null,
    endsAt: null,
    status: 'upcoming',
    source: 'Caltrans',
    lat: 0,
    lon: 0,
    distanceMeters: 1000,
    ...o,
  });
  const TZ = 'America/Los_Angeles';

  it('says when, in plain English', () => {
    expect(closureWhen(closure({ status: 'active', endsAt: '2026-10-25T12:59:00Z' }), NOW, TZ)).toBe('Now, until Sun 5:59 AM');
    expect(closureWhen(closure({ status: 'active' }), NOW, TZ)).toBe('Now');
    expect(closureWhen(closure({ startsAt: '2026-10-24T19:50:00Z' }), NOW, TZ)).toBe('Starts in 20 min');
    expect(closureWhen(closure({ startsAt: '2026-10-24T23:00:00Z' }), NOW, TZ)).toBe('Starts in 4 h (Sat 4:00 PM)');
    expect(closureWhen(closure({ startsAt: '2026-10-27T03:01:00Z' }), NOW, TZ)).toBe('Starts Mon 8:01 PM');
    expect(closureWhen(closure({}), NOW, TZ)).toBe('Scheduled: see details');
  });

  it('lists highway closures before ramps, and upcoming ones soonest first', () => {
    const { now, upcoming } = splitClosures([
      closure({ id: 'ramp', status: 'active', facility: 'On ramp', distanceMeters: 100 }),
      closure({ id: 'road', status: 'active', distanceMeters: 5000 }),
      closure({ id: 'later', startsAt: '2026-10-28T03:00:00Z' }),
      closure({ id: 'unknown-time' }),
      closure({ id: 'soon', startsAt: '2026-10-25T03:00:00Z' }),
    ]);
    expect(now.map((c) => c.id)).toEqual(['road', 'ramp']);
    expect(upcoming.map((c) => c.id)).toEqual(['soon', 'later', 'unknown-time']);
  });
});

describe('alert icons', () => {
  it('gives each kind a picture', () => {
    expect(alertIcon('Crash')).toBe('💥');
    expect(alertIcon('Traffic jam')).toBe('🐢');
    expect(alertIcon('Police activity')).toBe('🚓');
    expect(alertIcon('Full closure')).toBe('⛔');
    expect(alertIcon('Something new')).toBe('❗');
    expect(weatherIcon('Dense Fog Advisory')).toBe('🌫️');
    expect(weatherIcon('Coastal Flood Warning')).toBe('🌊');
    expect(kindClass('Stalled vehicle')).toBe('kind-stalled-vehicle');
  });
});

describe('closuresForMap', () => {
  const list = [
    { id: 'road-now', status: 'active' as const, facility: 'Highway' },
    { id: 'ramp-now', status: 'active' as const, facility: 'On ramp' },
    { id: 'road-later', status: 'upcoming' as const, facility: 'Highway' },
  ];
  it('keeps the map calm: only highway closures happening now', () => {
    expect(closuresForMap(list, false).map((c) => c.id)).toEqual(['road-now']);
  });
  it('shows everything when asked', () => {
    expect(closuresForMap(list, true).map((c) => c.id)).toEqual(['road-now', 'ramp-now', 'road-later']);
  });
});
