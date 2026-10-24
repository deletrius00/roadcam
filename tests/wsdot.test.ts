import { beforeEach, describe, expect, it } from 'vitest';
import { clearFeedCache, handleCamerasRequest, type HandlerDeps } from '../server/handler';
import { clearImageTimeCache } from '../server/imageTime';
import { regionsNear } from '../server/regions';
import { clearTrafficCache, handleTrafficRequest } from '../server/traffic';
import {
  parseWsdotAlerts,
  parseWsdotCameras,
  parseWsdotFlow,
  routeFromNumber,
  routeFromText,
  WSDOT_ALERTS_URL,
  WSDOT_CAMERAS_URL,
  WSDOT_FLOW_URL,
} from '../server/wsdot';
import { friendlyCameraName } from '../src/lib/names';
import type { CamerasResponse, TrafficResponse } from '../src/lib/types';

// Trimmed from the live WSDOT feeds (Oct 2026).
const CAMERAS_KML = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Style id="HighwayCamera"></Style>
<Folder><name><![CDATA[WA]]></name><description><![CDATA[WA]]></description>
<Placemark id="ID 9818"><name><![CDATA[Anacortes Airport Fuel Pump]]></name><description><![CDATA[<div><img width="400" height="166" src="https://images.wsdot.wa.gov/airports/anafuel.jpg" alt=""></div>]]></description><Point><coordinates>-122.66,48.5</coordinates></Point></Placemark>
</Folder>
<Folder><name><![CDATA[NW]]></name><description><![CDATA[NW]]></description>
<Placemark id="ID 1001"><name><![CDATA[I-5 at MP 163.4: S. Forest St]]></name><description><![CDATA[<div><img width="335" height="249" src="https://images.wsdot.wa.gov/nw/005vc16342.jpg" alt=""></div>]]></description><styleUrl>#HighwayCamera</styleUrl><Point><coordinates>-122.3205,47.5755</coordinates></Point></Placemark>
<Placemark id="ID 1002"><name><![CDATA[I-405 at MP 25.5: 236th St SE, SB]]></name><description><![CDATA[<div><img src="https://images.wsdot.wa.gov/nw/405vc02553.jpg" alt=""></div>]]></description><Point><coordinates>-122.205,47.783</coordinates></Point></Placemark>
<Placemark id="ID 1003"><name><![CDATA[Broken camera]]></name><description><![CDATA[no image]]></description><Point><coordinates>-122.2,47.7</coordinates></Point></Placemark>
</Folder>
<Folder><name><![CDATA[OL]]></name>
<Placemark id="ID 2001"><name><![CDATA[SR 167 at MP 10.8: Stewart Rd]]></name><description><![CDATA[<div><img src="https://images.wsdot.wa.gov/orflow/167vc01087.jpg" alt=""></div>]]></description><Point><coordinates>-122.2516,47.2393</coordinates></Point></Placemark>
<Placemark id="ID 2002"><name><![CDATA[I-5 at MP 128.9: 84th St]]></name><description><![CDATA[<div><img src="https://images.wsdot.wa.gov/orflow/005vc12890.jpg" alt=""></div>]]></description><Point><coordinates>-122.4568,47.1903</coordinates></Point></Placemark>
<Placemark id="ID 2003"><name><![CDATA[I-5 at MP 131: S 56th St]]></name><description><![CDATA[<div><img src="https://images.wsdot.wa.gov/orflow/005vc13100.jpg" alt=""></div>]]></description><Point><coordinates>-122.4508,47.2105</coordinates></Point></Placemark>
</Folder></Document></kml>`;

const ALERTS_KML = `<kml><Document>
<Placemark id="ID 718186"><name><![CDATA[Two right lanes of northbound I-5 at S 56th St blocked by a collision.]]></name><description><![CDATA[<div>High Impact</div><div>Two right lanes of northbound I-5 at S 56th St blocked by a collision.</div><div></div>]]></description><styleUrl>#HighIncident</styleUrl><Point><coordinates>-122.4510,47.2110</coordinates></Point></Placemark>
<Placemark id="ID 718187"><name><![CDATA[Up to two general-purpose lanes of westbound SR 522 between I-405 (milepost 11.6) and Campus Way Northeast will be closed nightly.]]></name><description><![CDATA[<div>Low Impact</div>]]></description><styleUrl>#LowConstruction</styleUrl><Point><coordinates>-122.19,47.76</coordinates></Point></Placemark>
<Placemark id="ID 718189"><name><![CDATA[Work is for the <a href="https://example.com/x">Port of Tacoma project</a>.]]></name><description><![CDATA[x]]></description><styleUrl>#LowIncident</styleUrl><Point><coordinates>-122.6,48.5</coordinates></Point></Placemark>
<Placemark id="ID 718188"><name><![CDATA[Rest area closed.]]></name><description><![CDATA[x]]></description><styleUrl>#LowRestArea</styleUrl><Point><coordinates>-122.3,47.3</coordinates></Point></Placemark>
</Document></kml>`;

const FLOW_KML = `<kml><Document>
<Folder><name><![CDATA[005]]></name><description><![CDATA[Route starting on 005]]></description>
<Placemark id="ID 3001"><name><![CDATA[S 56th St, NB]]></name><description><![CDATA[<p>Located on 005 milepost 131</p><p>Direction: NB</p><p>Reading: StopAndGo</p>]]></description><Point><coordinates>-122.4505,47.2107</coordinates></Point></Placemark>
<Placemark id="ID 3002"><name><![CDATA[84th St]]></name><description><![CDATA[<p>Direction: SB</p><p>Reading: WideOpen</p>]]></description><Point><coordinates>-122.457,47.19</coordinates></Point></Placemark>
<Placemark id="ID 3003"><name><![CDATA[Unknown sensor]]></name><description><![CDATA[<p>Direction: SB</p><p>Reading: Unknown</p>]]></description><Point><coordinates>-122.45,47.2</coordinates></Point></Placemark>
</Folder>
<Folder><name><![CDATA[167]]></name>
<Placemark id="ID 3004"><name><![CDATA[Stewart Rd]]></name><description><![CDATA[<p>Direction: NB</p><p>Reading: Heavy</p>]]></description><Point><coordinates>-122.2516,47.2394</coordinates></Point></Placemark>
</Folder></Document></kml>`;

// Real places from the asker's corridor.
const TACOMA = { lat: 47.2529, lon: -122.4443 };
const SOUTH_HILL = { lat: 47.1418, lon: -122.27 };
const BELLINGHAM = { lat: 48.7519, lon: -122.4787 };
const LOS_ANGELES = { lat: 34.05, lon: -118.25 };

describe('regions', () => {
  it('uses Washington feeds for Tacoma, South Hill and Bellingham', () => {
    for (const p of [TACOMA, SOUTH_HILL, BELLINGHAM]) expect(regionsNear(p, 25 * 1609)).toEqual(['washington']);
  });
  it('uses California feeds for Los Angeles', () => {
    expect(regionsNear(LOS_ANGELES, 25 * 1609)).toEqual(['california']);
  });
});

describe('WSDOT routes', () => {
  it('reads highway names from camera titles', () => {
    expect(routeFromText('I-5 at MP 163.4: S. Forest St')).toBe('I-5');
    expect(routeFromText('SR 167 at MP 10.8: Stewart Rd')).toBe('SR-167');
    expect(routeFromText('US 2 at MP 64: Stevens Pass')).toBe('US-2');
    expect(routeFromText('WSF Kingston Ferry Sign East')).toBe('');
  });
  it('turns sensor route numbers into names', () => {
    expect(routeFromNumber('005')).toBe('I-5');
    expect(routeFromNumber('405')).toBe('I-405');
    expect(routeFromNumber('002')).toBe('US-2');
    expect(routeFromNumber('167')).toBe('SR-167');
  });
});

describe('WSDOT cameras', () => {
  const cams = parseWsdotCameras(CAMERAS_KML);
  it('keeps highway cameras and skips airport cameras and ones without an image', () => {
    expect(cams.map((c) => c.id)).toEqual(['wsdot-1001', 'wsdot-1002', 'wsdot-2001', 'wsdot-2002', 'wsdot-2003']);
  });
  it('fills in route, side of the road, position and image', () => {
    expect(cams[1]).toMatchObject({
      route: 'I-405',
      direction: 'South',
      lat: 47.783,
      lon: -122.205,
      imageUrl: 'https://images.wsdot.wa.gov/nw/405vc02553.jpg',
      source: 'wsdot',
      facing: null,
    });
  });
  it('gets friendly titles', () => {
    expect(friendlyCameraName('I-5 at MP 163.4: S. Forest St')).toBe('S. Forest St');
    expect(friendlyCameraName('I-5 @ MP 150.31: S 216th St')).toBe('S 216th St');
  });
});

describe('WSDOT alerts and traffic flow', () => {
  it('reads alerts, labels them, and skips rest-area notices', () => {
    const alerts = parseWsdotAlerts(ALERTS_KML);
    expect(alerts.map((a) => a.kind)).toEqual(['Crash or incident', 'Roadwork', 'Crash or incident']);
    expect(alerts[2]!.description).toBe('Low impact: Work is for the Port of Tacoma project.');
    expect(alerts[0]).toMatchObject({
      description: 'High impact: Two right lanes of northbound I-5 at S 56th St blocked by a collision.',
      location: 'I-5',
      lat: 47.211,
      lon: -122.451,
    });
  });
  it('reads congestion levels and skips unknown sensors', () => {
    const flow = parseWsdotFlow(FLOW_KML);
    expect(flow.map((f) => [f.name, f.route, f.direction, f.level])).toEqual([
      ['S 56th St', 'I-5', 'North', 'StopAndGo'],
      ['84th St', 'I-5', 'South', 'WideOpen'],
      ['Stewart Rd', 'SR-167', 'North', 'Heavy'],
    ]);
  });
});

describe('Washington end to end', () => {
  const NOW = Date.parse('2026-10-24T07:00:00Z');
  const calls: string[] = [];
  const deps: HandlerDeps = {
    now: () => NOW,
    fetch: (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === WSDOT_CAMERAS_URL) return new Response(CAMERAS_KML);
      if (url === WSDOT_ALERTS_URL) return new Response(ALERTS_KML);
      if (url === WSDOT_FLOW_URL) return new Response(FLOW_KML);
      if (url.startsWith('https://api.weather.gov/')) return Response.json({ features: [] });
      if (url.endsWith('.jpg')) return new Response(new Uint8Array([0xff, 0xd8]), { status: 206, headers: { 'last-modified': 'Sat, 24 Oct 2026 06:59:00 GMT' } });
      return new Response('unexpected', { status: 500 });
    }) as typeof fetch,
  };

  beforeEach(() => {
    calls.length = 0;
    clearFeedCache();
    clearImageTimeCache();
    clearTrafficCache();
  });

  it('shows Tacoma cameras from WSDOT without touching California feeds', async () => {
    const res = await handleCamerasRequest(new Request(`http://x/api/cameras?lat=${TACOMA.lat}&lon=${TACOMA.lon}&radius=10`), deps);
    const body = (await res.json()) as CamerasResponse;
    expect(res.status).toBe(200);
    expect(body.cameras.map((c) => c.name)).toEqual(['I-5 at MP 131: S 56th St', 'I-5 at MP 128.9: 84th St', 'SR 167 at MP 10.8: Stewart Rd']);
    expect(body.cameras[0]).toMatchObject({ imageTakenAt: '2026-10-24T06:59:00.000Z', unavailable: false });
    expect(calls.some((u) => u.includes('dot.ca.gov') || u.includes('chp.ca.gov'))).toBe(false);
  });

  it('shows Tacoma traffic: alerts and congestion', async () => {
    const res = await handleTrafficRequest(new Request(`http://x/api/traffic?lat=${TACOMA.lat}&lon=${TACOMA.lon}&radius=10`), deps);
    const body = (await res.json()) as TrafficResponse;
    expect(body.incidents.map((i) => i.kind)).toEqual(['Crash or incident']);
    expect(body.flow.map((f) => f.level)).toEqual(['StopAndGo', 'WideOpen', 'Heavy']);
    expect(body.signs).toEqual([]);
    expect(body.warnings).toEqual([]);
  });
});
