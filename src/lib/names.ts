/**
 * Turn Caltrans' internal camera names into something a person can read.
 *
 * Real examples from the live feed:
 *   "KER-5-AT TRUCK ESCAPE RAMP (SHOULDER)"  →  "Truck Escape Ramp (shoulder)"
 *   "LA-5-AT LEBEC (FRAZIER)"                →  "Lebec (Frazier)"
 *   "FRE-99-JNO ASHLAN AVE"                  →  "Just north of Ashlan Ave"
 *   "I-5 : (971) Gorman School Dr"           →  "Gorman School Dr"
 *   "TV320 -- I-80 : West of Truckee"        →  "West of Truckee"
 */

/** Caltrans shorthand for "just north of" etc. */
const QUALIFIERS: Record<string, string> = {
  AT: '',
  JNO: 'Just north of',
  JSO: 'Just south of',
  JEO: 'Just east of',
  JWO: 'Just west of',
  'N/O': 'North of',
  'S/O': 'South of',
  'E/O': 'East of',
  'W/O': 'West of',
  NO: 'North of',
  SO: 'South of',
  EO: 'East of',
  WO: 'West of',
  NEAR: 'Near',
  NR: 'Near',
};

/** Words that stay in capitals when we convert SHOUTING to Title Case. */
const KEEP_UPPER = new Set(['I', 'US', 'SR', 'CA', 'II', 'III', 'IV', 'UC', 'CHP', 'DMV']);
/** Small words that stay lowercase inside a title. */
const KEEP_LOWER = new Set(['of', 'at', 'and', 'the', 'to', 'on', 'in', 'near', 'shoulder', 'median']);

function isShouting(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, '');
  return letters.length > 0 && letters === letters.toUpperCase();
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(\S)\(/g, '$1 (') // "RAMP(MEDIAN)" → "ramp (median)"
    .split(/(\s+|-|\/)/)
    .map((token, i) => {
      if (!token.trim() || token === '-' || token === '/') return token;
      // Handle words wrapped in brackets, e.g. "(shoulder)".
      const [, open = '', core = '', close = ''] = /^(\(?)(.*?)(\)?)$/.exec(token) ?? [];
      let word: string;
      if (KEEP_UPPER.has(core.toUpperCase())) word = core.toUpperCase();
      else if (i > 0 && KEEP_LOWER.has(core)) word = core;
      else word = core.charAt(0).toUpperCase() + core.slice(1);
      return open + word + close;
    })
    .join('');
}

export function friendlyCameraName(raw: string): string {
  // Drop internal camera ids like "TV320 --" at the start.
  const name = raw.trim().replace(/^TV\d+\s*-+\s*/i, '');

  let qualifier = '';
  let place = name;

  // "KER-5-AT TRUCK ESCAPE RAMP" style: COUNTY-ROUTE-QUALIFIER PLACE
  const coded = /^[A-Z]{2,3}-[A-Z0-9]+-\s*(AT|JNO|JSO|JEO|JWO|N\/O|S\/O|E\/O|W\/O|NO|SO|EO|WO|NEAR|NR)\b\s*(.*)$/i.exec(name);
  if (coded) {
    qualifier = QUALIFIERS[coded[1]!.toUpperCase()] ?? '';
    place = coded[2]!;
  } else {
    // "I-5 : Gorman School Dr" style: drop the route before the colon.
    const colon = name.indexOf(':');
    if (colon !== -1 && name.slice(colon + 1).trim()) place = name.slice(colon + 1);
  }

  // Drop camera numbers like "(971)" and tidy spaces.
  place = place.replace(/\(\s*\d+\s*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!place) return raw.trim() || 'Unnamed camera';

  if (isShouting(place)) place = titleCase(place);
  return qualifier ? `${qualifier} ${place}` : place;
}

/** "North" → "Northbound side", "Median" → "Median". */
export function sideLabel(direction: string): string {
  const d = direction.trim().toLowerCase();
  if (!d) return '';
  if (d === 'median') return 'Median';
  if (['north', 'south', 'east', 'west'].includes(d)) {
    return `${d.charAt(0).toUpperCase()}${d.slice(1)}bound side`;
  }
  return direction;
}
