// Interlinear glossed text for language learning: each word with its reading (furigana, pinyin,
// romanization) above and its meaning below, colored by part of speech, plus the full translation.

export interface GlossSpec {
  words: { text: string; reading?: string; gloss?: string; pos?: string }[];
  translation?: string;
  /** Right-to-left scripts (Arabic, Hebrew). */
  rtl?: boolean;
}

export const POS_COLORS: Record<string, string> = {
  noun: '#2563eb', pronoun: '#0891b2', verb: '#dc2626', adjective: '#16a34a', adverb: '#65a30d',
  particle: '#78716c', preposition: '#78716c', postposition: '#78716c', article: '#a8a29e', conjunction: '#9333ea', auxiliary: '#ea580c', number: '#ca8a04',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Rough text width: wide (CJK, kana, Hangul) characters take 1em, others about 0.58em. */
function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/.test(ch) ? size : size * 0.58;
  return w;
}

export function buildGloss(spec: GlossSpec, maxWidth = 760): { svg: string; vw: number; vh: number } {
  const words = spec.words.slice(0, 40);
  const WS = 34, RS = 15, GS = 15, gap = 22;
  const cols = words.map((w) => Math.max(textWidth(w.text, WS), textWidth(w.reading ?? '', RS), textWidth(w.gloss ?? '', GS)) + 6);
  // Wrap words into lines.
  const lines: number[][] = [[]];
  let lw = 0;
  cols.forEach((cw, i) => {
    if (lw + cw > maxWidth && lines.at(-1)!.length) {
      lines.push([]);
      lw = 0;
    }
    lines.at(-1)!.push(i);
    lw += cw + gap;
  });
  const lineH = 112;
  const out: string[] = [];
  let vw = 0;
  lines.forEach((line, li) => {
    const total = line.reduce((s, i) => s + cols[i]! + gap, -gap);
    vw = Math.max(vw, total + 40);
    let x = spec.rtl ? 20 + total : 20;
    for (const i of line) {
      const w = words[i]!, cw = cols[i]!;
      const cx = spec.rtl ? x - cw / 2 : x + cw / 2;
      const y = 30 + li * lineH;
      const c = (w.pos && POS_COLORS[w.pos.toLowerCase()]) || '#1c1c1a';
      out.push(
        `<g id="word-${i}">` +
          (w.reading ? `<text x="${cx}" y="${y}" text-anchor="middle" font-size="${RS}" fill="#78716c">${esc(w.reading)}</text>` : '') +
          `<text x="${cx}" y="${y + 40}" text-anchor="middle" font-size="${WS}" font-weight="600" fill="#1c1c1a">${esc(w.text)}</text>` +
          `<line x1="${cx - cw / 2 + 2}" y1="${y + 50}" x2="${cx + cw / 2 - 2}" y2="${y + 50}" stroke="${c}" stroke-width="3"/>` +
          (w.gloss ? `<text x="${cx}" y="${y + 72}" text-anchor="middle" font-size="${GS}" fill="${c}">${esc(w.gloss)}</text>` : '') +
          `</g>`,
      );
      x += spec.rtl ? -(cw + gap) : cw + gap;
    }
  });
  let vh = 30 + lines.length * lineH - 20;
  if (spec.translation) {
    out.push(`<text id="translation" x="20" y="${vh + 14}" font-size="18" font-style="italic" fill="#44403c">“${esc(spec.translation)}”</text>`);
    vw = Math.max(vw, textWidth(spec.translation, 18) + 60);
    vh += 34;
  }
  const used = [...new Set(words.map((w) => w.pos?.toLowerCase()).filter((p): p is string => !!p && !!POS_COLORS[p]))];
  if (used.length) {
    out.push(`<g id="legend" data-static="">${used.map((p, i) => `<rect x="${20 + i * 112}" y="${vh + 6}" width="12" height="4" fill="${POS_COLORS[p]}"/><text x="${36 + i * 112}" y="${vh + 12}" font-size="12" fill="#78716c">${p}</text>`).join('')}</g>`);
    vh += 26;
  }
  return { svg: `<svg viewBox="0 0 ${Math.round(vw)} ${Math.round(vh)}">${out.join('')}</svg>`, vw: Math.round(vw), vh: Math.round(vh) };
}
