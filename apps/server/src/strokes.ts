// Stroke-order data for kanji and kana from KanjiVG (https://kanjivg.tagaini.net, CC BY-SA 3.0).
// The AI must never invent strokes; this provides the real paths, in order, with stroke types.

export interface CharStrokes {
  char: string;
  strokes: { d: string; type: string }[];
  /** Where KanjiVG places each stroke number (same 109x109 coordinate box). */
  numbers: { x: number; y: number }[];
}

export type StrokeLoader = (char: string) => Promise<CharStrokes | null>;

const SOURCES = [
  (hex: string) => `https://cdn.jsdelivr.net/gh/KanjiVG/kanjivg@master/kanji/${hex}.svg`,
  (hex: string) => `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex}.svg`,
];

/** Only path commands and numbers: nothing else can reach the page. */
const SAFE_PATH = /^[MmLlCcSsQqTtAaZzHhVv0-9.,\s-]+$/;

export function parseKanjiVG(char: string, svg: string): CharStrokes | null {
  const strokes: { n: number; d: string; type: string }[] = [];
  for (const tag of svg.match(/<path\b[^>]*>/g) ?? []) {
    const n = /id="kvg:[0-9a-f]+-s(\d+)"/.exec(tag)?.[1];
    const d = /\sd="([^"]+)"/.exec(tag)?.[1];
    if (!n || !d || !SAFE_PATH.test(d)) continue;
    strokes.push({ n: Number(n), d: d.trim(), type: /kvg:type="([^"]*)"/.exec(tag)?.[1] ?? '' });
  }
  if (!strokes.length) return null;
  strokes.sort((a, b) => a.n - b.n);
  const numbers: { x: number; y: number }[] = [];
  for (const m of svg.matchAll(/<text transform="matrix\(1 0 0 1 ([\d.]+) ([\d.]+)\)">(\d+)<\/text>/g)) {
    numbers[Number(m[3]) - 1] = { x: Number(m[1]), y: Number(m[2]) };
  }
  return { char, strokes: strokes.map(({ d, type }) => ({ d, type })), numbers: strokes.map((_, i) => numbers[i] ?? { x: 0, y: 0 }) };
}

/** Fetches from KanjiVG (CDN first, GitHub as fallback) and caches in memory. */
export function createStrokeLoader(fetchImpl: typeof fetch = fetch): StrokeLoader {
  const cache = new Map<string, CharStrokes | null>();
  return async (char) => {
    if (cache.has(char)) return cache.get(char)!;
    const hex = char.codePointAt(0)!.toString(16).padStart(5, '0');
    let data: CharStrokes | null = null;
    for (const url of SOURCES) {
      try {
        const res = await fetchImpl(url(hex));
        if (res.status === 404) break; // the character isn't in KanjiVG
        if (!res.ok) continue;
        data = parseKanjiVG(char, await res.text());
        break;
      } catch {
        // try the next source
      }
    }
    if (cache.size > 2000) cache.clear();
    cache.set(char, data);
    return data;
  };
}
