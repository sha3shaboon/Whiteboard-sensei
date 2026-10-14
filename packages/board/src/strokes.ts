// Builds stroke-order drawings from real stroke data (KanjiVG): a practice grid, a faint guide of
// the whole character, the strokes revealed so far in writing order (the newest ones in red),
// and stroke numbers. Paths keep KanjiVG's direction, so drawing them in traces the real stroke.

export interface CharStrokes {
  char: string;
  strokes: { d: string; type: string }[];
  numbers: { x: number; y: number }[];
}

const BOX = 109; // KanjiVG coordinate box
const GAP = 14;

/** Plain-language names for KanjiVG stroke types, so the tutor can narrate each stroke correctly. */
const TYPE_NAMES: Record<string, string> = {
  '㇐': 'horizontal',
  '㇑': 'vertical',
  '㇒': 'left-falling sweep',
  '㇓': 'curved left-falling sweep',
  '㇏': 'right-falling sweep',
  '㇔': 'dot',
  '㇀': 'rising flick',
  '㇕': 'horizontal then down',
  '㇖': 'horizontal with hook',
  '㇆': 'horizontal then down with hook',
  '㇇': 'horizontal then left-falling',
  '㇗': 'vertical then horizontal',
  '㇄': 'vertical then horizontal',
  '㇙': 'vertical with rising hook',
  '㇚': 'vertical with hook',
  '㇟': 'vertical curving into a hook',
  '㇛': 'zigzag',
  '㇜': 'zigzag',
  '㇋': 'zigzag with hook',
  '㇉': 'vertical-horizontal-vertical with hook',
};

export function strokeTypeName(type: string): string {
  return TYPE_NAMES[type.charAt(0)] ?? 'stroke';
}

export function totalStrokes(chars: CharStrokes[]): number {
  return chars.reduce((n, c) => n + c.strokes.length, 0);
}

/**
 * `shown` = how many strokes are visible (counted across all characters, in writing order);
 * `newFrom` = strokes at or after this index are highlighted as the ones just added.
 */
export function buildStrokeSvg(chars: CharStrokes[], shown: number, newFrom = 0): { svg: string; vw: number; vh: number } {
  const vw = chars.length * BOX + (chars.length - 1) * GAP;
  const vh = BOX;
  const out: string[] = [];
  let k = 0;
  chars.forEach((c, i) => {
    const ox = i * (BOX + GAP);
    const g = (inner: string, attrs = '') => `<g transform="translate(${ox} 0)"${attrs}>${inner}</g>`;
    // Practice grid and the faint whole-character guide appear instantly (data-static).
    out.push(
      g(
        `<rect x="0.5" y="0.5" width="${BOX - 1}" height="${BOX - 1}" stroke="#d4d4d0" stroke-width="1"/>` +
          `<path d="M${BOX / 2} 0V${BOX}M0 ${BOX / 2}H${BOX}" stroke="#e4e4e0" stroke-width="0.8" stroke-dasharray="3 3"/>` +
          c.strokes.map((s) => `<path d="${s.d}" stroke="#ecece8" stroke-width="3"/>`).join(''),
        ` id="guide-${i}" data-static="1"`,
      ),
    );
    c.strokes.forEach((s, j) => {
      const idx = k++;
      if (idx >= shown) return;
      const isNew = idx >= newFrom;
      out.push(g(`<path id="c${i}s${j + 1}" d="${s.d}" stroke="${isNew ? '#dc2626' : '#1c1c1a'}" stroke-width="3.6"/>`));
      const n = c.numbers[j];
      if (n) out.push(g(`<text id="c${i}n${j + 1}" x="${n.x}" y="${n.y}" font-size="8" fill="${isNew ? '#dc2626' : '#8a8a84'}">${j + 1}</text>`));
    });
  });
  return { svg: `<svg viewBox="0 0 ${vw} ${vh}">${out.join('')}</svg>`, vw, vh };
}
