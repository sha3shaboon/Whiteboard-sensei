// Music notation computed from note names: a staff (treble or bass) with notes, chords,
// accidentals, ledger lines and note names, plus a piano keyboard with highlighted keys.
// Frequencies are exposed so the app can play what's shown.

export interface ParsedNote { letter: string; accidental: '' | '#' | 'b'; octave: number; midi: number; duration: 'w' | 'h' | 'q' | 'e' }

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C4", "F#5", "Bb3", optionally with a duration: "C4/h" (w h q e). */
export function parseNote(s: string): ParsedNote {
  const m = /^([A-Ga-g])(#|♯|b|♭)?(-?\d)(?:\/(w|h|q|e))?$/.exec(s.trim());
  if (!m) throw new Error(`Couldn't read the note "${s}" (use names like C4, F#4, Bb3)`);
  const letter = m[1]!.toUpperCase();
  const accidental = m[2] === '#' || m[2] === '♯' ? '#' : m[2] === 'b' || m[2] === '♭' ? 'b' : '';
  const octave = Number(m[3]);
  const midi = 12 * (octave + 1) + SEMI[letter]! + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  return { letter, accidental, octave, midi, duration: (m[4] as ParsedNote['duration']) ?? 'q' };
}

export const noteFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** A sequence of notes/chords: "C4 E4 G4" or chords joined with + ("C4+E4+G4 F4+A4+C5"). */
export function parseSequence(src: string): ParsedNote[][] {
  return src.trim().split(/\s+/).filter(Boolean).map((tok) => {
    const dur = /\/(w|h|q|e)$/.exec(tok)?.[1];
    return tok.replace(/\/(w|h|q|e)$/, '').split('+').map((n) => parseNote(dur ? `${n}/${dur}` : n));
  });
}

export interface NotationSpec {
  notes: string;
  clef?: 'treble' | 'bass';
  /** Show note names under the staff (default true). */
  names?: boolean;
  /** Draw a piano keyboard below with these notes highlighted (default true). */
  keyboard?: boolean;
  title?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f1 = (n: number) => Math.round(n * 10) / 10;

// A compact G clef and F clef outline (stylized, drawn at staff scale).
const G_CLEF = 'M14 52 C2 44 4 26 18 22 C30 19 36 32 28 40 C22 46 12 42 14 34 C16 28 24 28 24 34 M20 60 L20 -4 C20 -14 30 -14 28 -4 C26 6 12 14 8 26 C4 38 10 50 22 50 C32 50 34 38 26 36';
const F_CLEF = 'M6 10 C6 -2 26 -4 28 10 C30 26 16 40 4 46 M8 10 C8 4 16 4 16 10 C16 15 8 15 8 10 Z M34 4 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M34 16 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0';

export function buildNotation(spec: NotationSpec): { svg: string; vw: number; vh: number; sequence: ParsedNote[][] } {
  const seq = parseSequence(spec.notes).slice(0, 24);
  const clef = spec.clef ?? (seq.flat().some((n) => n.midi < 55) && !seq.flat().some((n) => n.midi > 67) ? 'bass' : 'treble');
  const L = 14; // half the distance between lines
  const top = 60, staffW = Math.max(300, 110 + seq.length * 64);
  // Diatonic step of the bottom line: E4 (treble) / G2 (bass).
  const bottom = clef === 'treble' ? { letter: 'E', octave: 4 } : { letter: 'G', octave: 2 };
  const stepOf = (n: ParsedNote) => LETTERS.indexOf(n.letter) + 7 * n.octave - (LETTERS.indexOf(bottom.letter) + 7 * bottom.octave);
  const yOf = (step: number) => top + 8 * L - step * L;
  const out: string[] = [];
  const lines = Array.from({ length: 5 }, (_, i) => `<line x1="20" y1="${top + i * 2 * L}" x2="${staffW}" y2="${top + i * 2 * L}" stroke-width="1.6"/>`).join('');
  out.push(`<g id="staff" data-static="">${lines}<path d="${clef === 'treble' ? G_CLEF : F_CLEF}" transform="translate(${clef === 'treble' ? 26 : 30} ${clef === 'treble' ? top + 4 : top + 2}) scale(${clef === 'treble' ? 0.98 : 1})" stroke-width="2.4" fill="none"/></g>`);
  seq.forEach((chord, k) => {
    const x = 110 + k * 64;
    const parts: string[] = [];
    const steps = chord.map(stepOf);
    // Ledger lines.
    const minS = Math.min(...steps), maxS = Math.max(...steps);
    for (let s = -2; s >= minS; s -= 2) parts.push(`<line x1="${x - 16}" y1="${yOf(s)}" x2="${x + 16}" y2="${yOf(s)}" stroke-width="1.6"/>`);
    for (let s = 10; s <= maxS; s += 2) parts.push(`<line x1="${x - 16}" y1="${yOf(s)}" x2="${x + 16}" y2="${yOf(s)}" stroke-width="1.6"/>`);
    const dur = chord[0]!.duration;
    const open = dur === 'w' || dur === 'h';
    chord.forEach((n, i) => {
      const y = yOf(steps[i]!);
      parts.push(`<ellipse cx="${x}" cy="${y}" rx="${L * 0.92}" ry="${L * 0.68}" transform="rotate(-20 ${x} ${y})" fill="${open ? '#ffffff' : '#1c1c1a'}" stroke="#1c1c1a" stroke-width="2.2"/>`);
      if (n.accidental) parts.push(`<text x="${x - 26}" y="${y + 8}" text-anchor="middle" font-size="26" fill="#1c1c1a">${n.accidental === '#' ? '♯' : '♭'}</text>`);
    });
    if (dur !== 'w') {
      const up = (minS + maxS) / 2 < 4;
      const sx = up ? x + L * 0.85 : x - L * 0.85;
      const y1 = yOf(up ? minS : maxS), y2 = up ? yOf(maxS) - 6 * L : yOf(minS) + 6 * L;
      parts.push(`<line x1="${f1(sx)}" y1="${y1}" x2="${f1(sx)}" y2="${y2}" stroke-width="2"/>`);
      if (dur === 'e') parts.push(`<path d="M${f1(sx)} ${y2} q${up ? 14 : -14} ${up ? 14 : -14} ${up ? 10 : -10} ${up ? 30 : -30}" stroke-width="2.4"/>`);
    }
    if (spec.names !== false) parts.push(`<text x="${x}" y="${top + 8 * L + 58}" text-anchor="middle" font-size="15" font-weight="600" fill="#2563eb">${chord.map((n) => n.letter + (n.accidental === '#' ? '♯' : n.accidental === 'b' ? '♭' : '')).join(' ')}</text>`);
    out.push(`<g id="note-${k}">${parts.join('')}</g>`);
  });
  let vh = top + 8 * L + 76;
  const vw = staffW + 20;
  if (spec.keyboard !== false) {
    const all = seq.flat();
    const lo = Math.min(...all.map((n) => n.midi), clef === 'treble' ? 60 : 43);
    const startC = 12 * Math.floor(lo / 12); // the C at or below the lowest note
    const octaves = Math.max(1, Math.min(4, Math.ceil((Math.max(...all.map((n) => n.midi)) + 1 - startC) / 12)));
    const on = new Set(all.map((n) => n.midi));
    const WW = Math.min(30, (vw - 40) / (7 * octaves)), WH = 110, ky = vh + 6;
    const whites: string[] = [], blacks: string[] = [];
    let wi = 0;
    for (let m = startC; m < startC + 12 * octaves; m++) {
      const pc = m % 12, black = [1, 3, 6, 8, 10].includes(pc);
      if (!black) {
        whites.push(`<rect x="${f1(20 + wi * WW)}" y="${ky}" width="${f1(WW)}" height="${WH}" rx="3" fill="${on.has(m) ? '#93c5fd' : '#ffffff'}" stroke="#57534e"/>${pc === 0 ? `<text x="${f1(20 + wi * WW + WW / 2)}" y="${ky + WH - 8}" text-anchor="middle" font-size="10" fill="#78716c">C${m / 12 - 1}</text>` : ''}`);
        wi++;
      } else {
        blacks.push(`<rect x="${f1(20 + wi * WW - WW * 0.3)}" y="${ky}" width="${f1(WW * 0.6)}" height="${WH * 0.62}" rx="2" fill="${on.has(m) ? '#2563eb' : '#1c1c1a'}" stroke="#1c1c1a"/>`);
      }
    }
    out.push(`<g id="keyboard" data-static="">${whites.join('')}${blacks.join('')}</g>`);
    vh = ky + WH + 16;
  }
  if (spec.title) out.unshift(`<text id="title" x="20" y="28" font-size="18" font-weight="700" fill="#1c1c1a">${esc(spec.title)}</text>`);
  return { svg: `<svg viewBox="0 0 ${f1(vw)} ${f1(vh)}">${out.join('')}</svg>`, vw: f1(vw), vh: f1(vh), sequence: seq };
}
