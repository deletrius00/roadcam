/**
 * One small picture (emoji) per kind of alert, used on map pins and in the lists,
 * so you can tell a crash from fog from roadwork at a glance.
 */

const ICONS: Record<string, string> = {
  crash: '💥',
  'crash or incident': '💥',
  'traffic jam': '🐢',
  hazard: '⚠️',
  debris: '🪵',
  'stalled vehicle': '🚗',
  fire: '🔥',
  fog: '🌫️',
  rain: '🌧️',
  ice: '🧊',
  weather: '🌨️',
  wind: '💨',
  flooding: '🌊',
  'police activity': '🚓',
  roadwork: '🚧',
  'lane closure': '🚧',
  'road closure': '⛔',
  'full closure': '⛔',
  'moving closure': '🚧',
  'one-way traffic control': '🚦',
  'traffic break': '🚓',
};

/** "Traffic jam" → "🐢". Unknown kinds get a plain "❗". */
export function alertIcon(kind: string): string {
  return ICONS[kind.trim().toLowerCase()] ?? '❗';
}

/** Weather alert names → icon: "Dense Fog Advisory" → "🌫️". */
export function weatherIcon(event: string): string {
  const e = event.toLowerCase();
  if (/fog|smoke|dust/.test(e)) return '🌫️';
  if (/flood|surf|coastal/.test(e)) return '🌊';
  if (/wind|gale/.test(e)) return '💨';
  if (/snow|winter|blizzard|ice|freez|frost/.test(e)) return '🌨️';
  if (/heat/.test(e)) return '🌡️';
  if (/fire|red flag/.test(e)) return '🔥';
  if (/thunder|tornado|storm/.test(e)) return '⛈️';
  if (/rain/.test(e)) return '🌧️';
  return '⚠️';
}

/** CSS class for a kind: "Stalled vehicle" → "kind-stalled-vehicle". */
export function kindClass(kind: string): string {
  return `kind-${kind.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}
