import { beforeEach, describe, expect, it } from 'vitest';
import type { HandlerDeps } from '../server/handler';
import {
  CHP_URL,
  chpTimeToIso,
  clearTrafficCache,
  describeIncident,
  handleTrafficRequest,
  incidentKind,
  parseChpIncidents,
  parseSignFeed,
} from '../server/traffic';
import type { TrafficResponse } from '../src/lib/types';

// Trimmed from the real CHP feed (Oct 2026), including the kind of broken, cut-off entry the live feed has.
const CHP_XML = `<?xml version="1.0"?><State><Center ID="SAHB"><Dispatch ID="SACC">
  <Log ID="261023SAFSP0086">
    <LogTime>"Oct 23 2026  4:59PM"</LogTime>
    <LogType>"1183-Trfc Collision-Unkn Inj"</LogType>
    <Location>"I5 S / J St"</Location>
    <LocationDesc>"SB 5 AT J"</LocationDesc>
    <LATLON>"38583139:121503406"</LATLON>
    <LogDetails><details/></LogDetails></Log>
  <Log ID="261023GVHB0012">
    <LogTime>"Oct 23 2026 11:02PM"</LogTime>
    <LogType>"1125-Traffic Hazard"</LogType>
    <Location>"I5 N / Frazier Mountain Park Rd"</Location>
    <LATLON>"34811500:118855200"</LATLON>
  </Log>
  <Log ID="261023NOLOC01">
    <LogTime>"Oct 23 2026 10:00PM"</LogTime>
    <LogType>"1182-Trfc Collision-No Inj"</LogType>
    <Location>"Somewhere"</Location>
    <LATLON>""</LATLON>
  </Log>
  <Log ID="261023BROKEN">
    <LogTime>"Oct 23 2026 10:10PM"</LogTime>
    <UnitT`;

// Trimmed from the real Caltrans district 6 message-sign feed (Oct 2026).
const SIGN_JSON = {
  data: [
    { cms: { index: 'SV-001', inService: 'true', location: { district: '6', latitude: '34.96794', longitude: '-118.939197', route: 'I-5', direction: 'North', locationName: '1 - NB I-5 JNO GRPVNE TRK INSP (PM 12.2)' },
      message: { display: 'Blank', phase1: { phase1Line1: '', phase1Line2: '', phase1Line3: '' }, phase2: {} } } },
    { cms: { index: 'SV-002', inService: 'true', location: { district: '6', latitude: '35.0101', longitude: '-118.95', route: 'I-5', direction: 'South', locationName: '2 - SB I-5 JSO RTE 99 (PM 15.8)' },
      message: { display: '1 Page (Normal)', messageTimestamp: { messageDate: '2026-10-22', messageTime: '06:45:02' },
        phase1: { phase1Line1: 'I-5 GUSTY', phase1Line2: 'WINDS', phase1Line3: 'OVER SUMMIT' }, phase2: { phase2Line1: '', phase2Line2: '', phase2Line3: '' } } } },
    { cms: { index: 'SV-003', inService: 'false', location: { district: '6', latitude: '35.1', longitude: '-119', route: 'I-5', direction: 'South' },
      message: { display: '1 Page (Normal)', phase1: { phase1Line1: 'OUT OF SERVICE SIGN' } } } },
  ],
};

describe('CHP incidents', () => {
  const incidents = parseChpIncidents(CHP_XML);

  it('reads complete entries and skips broken or location-less ones', () => {
    expect(incidents.map((i) => i.id)).toEqual(['chp-261023SAFSP0086', 'chp-261023GVHB0012']);
  });

  it('converts CHP coordinates (west longitudes come without a minus sign)', () => {
    expect(incidents[0]).toMatchObject({ lat: 38.583139, lon: -121.503406, location: 'I5 S / J St' });
  });

  it('describes incidents in plain English', () => {
    expect(incidents[0]).toMatchObject({ kind: 'Crash', description: 'Traffic collision, unknown injuries' });
    expect(incidents[1]).toMatchObject({ kind: 'Hazard', description: 'Traffic hazard' });
    expect(describeIncident('1182-Trfc Collision-No Inj')).toBe('Traffic collision, no injuries');
    expect(incidentKind('1125-Disabled Veh')).toBe('Stalled vehicle');
    expect(incidentKind('SIG Alert')).toBe('Road closure');
  });

  it('converts CHP times (Pacific) to UTC', () => {
    expect(chpTimeToIso('Oct 23 2026  4:59PM')).toBe('2026-10-23T23:59:00.000Z');
    expect(chpTimeToIso('Oct 23 2026 11:02PM')).toBe('2026-10-24T06:02:00.000Z');
    expect(chpTimeToIso('Jan 5 2026 12:15AM')).toBe('2026-01-05T08:15:00.000Z');
    expect(chpTimeToIso('garbage')).toBeNull();
  });
});

// Exactly as the live feed sends it (Oct 2026): spaces around "=", Windows line endings.
const CHP_RAW = '<?xml version="1.0" ?>\r\n<State><Center ID = "SAHB">\r\n<Dispatch ID = "STCC">\r\n\r\n\t\t<Log ID = "261023ST0404">\r\n\t\t\t<LogTime>"Oct 23 2026 11:22PM"</LogTime>\r\n\t\t\t<LogType>"1125-Traffic Hazard"</LogType>\r\n\t\t\t<Location>"I205 E / N Macarthur Dr Onr"</Location>\r\n\t\t\t<LocationDesc>"JWO"</LocationDesc>\r\n\t\t\t<Area>"Tracy"</Area>\r\n\t\t\t<ThomasBrothers>""</ThomasBrothers>\r\n\t\t\t<LATLON>"37764645:121410691"</LATLON>\r\n\t\t\t<LogDetails>\r\n\t\t</LogDetails></Log>';

describe('CHP live format', () => {
  it('reads entries written as <Log ID = "…"> with Windows line endings', () => {
    expect(parseChpIncidents(CHP_RAW)).toEqual([
      {
        id: 'chp-261023ST0404',
        kind: 'Hazard',
        description: 'Traffic hazard',
        location: 'I205 E / N Macarthur Dr Onr',
        startedAt: '2026-10-24T06:22:00.000Z',
        lat: 37.764645,
        lon: -121.410691,
      },
    ]);
  });
});

describe('CHP noise handling', () => {
  const log = (id: string, type: string, loc: string, latlon: string) =>
    `<Log ID = "${id}"><LogTime>"Oct 23 2026 11:20PM"</LogTime><LogType>"${type}"</LogType><Location>"${loc}"</Location><LATLON>"${latlon}"</LATLON></Log>`;

  it('explains MZP (CHP guarding a Caltrans work crew) as roadwork', () => {
    const [inc] = parseChpIncidents(log('1', 'MZP-Assist CT with Maintenance', 'I5 N / Main St', '34050000:118250000'));
    expect(inc).toMatchObject({ kind: 'Roadwork', description: 'CHP protecting a Caltrans work zone' });
  });

  it('drops duplicate entries for the same event', () => {
    const xml =
      log('1', 'MZP-Assist CT with Maintenance', '777 W Washington Blvd', '34030000:118270000') +
      log('2', 'MZP-Assist CT with Maintenance', '777 W Washington Blvd', '34030000:118270000') +
      log('3', '1125-Traffic Hazard', '777 W Washington Blvd', '34030000:118270000');
    expect(parseChpIncidents(xml).map((i) => i.id)).toEqual(['chp-1', 'chp-3']);
  });
});

describe('Caltrans message signs', () => {
  it('keeps only signs showing a message', () => {
    const signs = parseSignFeed(SIGN_JSON);
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatchObject({
      route: 'I-5',
      direction: 'South',
      lines: ['I-5 GUSTY', 'WINDS', 'OVER SUMMIT'],
      postedAt: '2026-10-22T13:45:02.000Z',
      lat: 35.0101,
      lon: -118.95,
    });
  });

  it('survives junk input', () => {
    expect(parseSignFeed(null)).toEqual([]);
    expect(parseSignFeed({ data: [{}] })).toEqual([]);
  });
});

describe('GET /api/traffic', () => {
  const NOW = Date.parse('2026-10-24T06:10:00Z');
  function deps(options: { chpDown?: boolean } = {}): HandlerDeps {
    return {
      now: () => NOW,
      fetch: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === CHP_URL) return options.chpDown ? new Response('', { status: 503 }) : new Response(CHP_XML);
        if (url.includes('cmsStatusD06')) return Response.json(SIGN_JSON);
        return Response.json({ data: [] });
      }) as typeof fetch,
    };
  }
  const call = async (query: string, d: HandlerDeps) => {
    const res = await handleTrafficRequest(new Request(`http://localhost/api/traffic?${query}`), d);
    return { status: res.status, body: (await res.json()) as TrafficResponse & { field?: string } };
  };

  beforeEach(() => clearTrafficCache());

  it('returns nearby incidents and signs, closest first', async () => {
    const { status, body } = await call('lat=34.82&lon=-118.86&radius=25', deps());
    expect(status).toBe(200);
    expect(body.incidents.map((i) => i.id)).toEqual(['chp-261023GVHB0012']); // Sacramento one is too far
    expect(body.signs.map((s) => s.lines[0])).toEqual(['I-5 GUSTY']);
    expect(body.incidents[0]!.distanceMeters).toBeLessThan(2000);
  });

  it('still returns signs when CHP is down, with a warning', async () => {
    const { body } = await call('lat=34.82&lon=-118.86&radius=25', deps({ chpDown: true }));
    expect(body.incidents).toEqual([]);
    expect(body.signs).toHaveLength(1);
    expect(body.warnings).toContain('CHP incidents unavailable');
  });

  it('tells the map whether live speed tiles are available', async () => {
    const query = 'http://localhost/api/traffic?lat=34.82&lon=-118.86&radius=25';
    const on = (await (await handleTrafficRequest(new Request(query), deps(), { tomtomKey: 'k' })).json()) as TrafficResponse;
    const off = (await (await handleTrafficRequest(new Request(query), deps(), { tomtomKey: '' })).json()) as TrafficResponse;
    expect(on.speedTiles).toBe(true);
    expect(off.speedTiles).toBe(false);
  });

  it('validates the location like /api/cameras', async () => {
    const { status, body } = await call('lat=999&lon=0', deps());
    expect(status).toBe(400);
    expect(body.field).toBe('lat');
  });

  it('serves demo traffic without calling the real feeds', async () => {
    let calls = 0;
    const d: HandlerDeps = { now: () => NOW, fetch: (async () => { calls++; return new Response(''); }) as typeof fetch };
    const { body } = await call('lat=34.6&lon=-118.7&radius=50&demo=1', d);
    expect(calls).toBe(0);
    expect(body.incidents.length).toBeGreaterThan(0);
    expect(body.signs.length).toBeGreaterThan(0);
  });
});
