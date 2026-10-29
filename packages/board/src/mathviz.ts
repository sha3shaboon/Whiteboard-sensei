// Math visuals computed from numbers: number lines (points, hops, intervals), fraction models,
// manipulatives (base-ten blocks, ten frames, arrays, counters) and column arithmetic with carries.
// Each part has an id, so drawing in follows the order a teacher would draw it.

export interface BuiltSvg { svg: string; vw: number; vh: number; warnings: string[] }

const f1 = (n: number) => Math.round(n * 10) / 10;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const PALETTE = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626', '#0891b2'];
const FILLS: Record<string, string> = { '#2563eb': '#bfdbfe', '#ea580c': '#fed7aa', '#16a34a': '#bbf7d0', '#9333ea': '#e9d5ff', '#dc2626': '#fecaca', '#0891b2': '#a5f3fc' };

/** 0.375 with denominator 8 -> "3/8"; whole numbers stay whole; mixed numbers when above 1. */
export function fractionLabel(v: number, den: number): string {
  const n = Math.round(v * den);
  if (Math.abs(n / den - v) > 1e-9) return String(+v.toFixed(3));
  if (n % den === 0) return String(n / den);
  const g = gcd(n, den);
  const [a, b] = [n / g, den / g];
  if (Math.abs(a) > b) return `${Math.trunc(a / b)} ${Math.abs(a % b)}/${b}`;
  return `${a}/${b}`;
}

// ---- Number line

export interface NumberLineSpec {
  min: number;
  max: number;
  step: number;
  /** Label every n-th tick (default: all that fit). */
  labelEvery?: number;
  /** Label ticks as fractions with this denominator. */
  denominator?: number;
  points?: { value: number; label?: string; color?: string; open?: boolean }[];
  /** Hops drawn as arcs above the line, in order (e.g. counting on: 3 -> 5 -> 8). */
  jumps?: { from: number; to: number; label?: string }[];
  /** Shaded ranges for inequalities; open ends drawn as hollow circles. */
  intervals?: { from: number; to: number; openFrom?: boolean; openTo?: boolean; color?: string }[];
}

export function buildNumberLine(spec: NumberLineSpec, width = 760): BuiltSvg {
  const warnings: string[] = [];
  const { min, max } = spec;
  const ticks = Math.round((max - min) / spec.step);
  if (!(max > min) || !(spec.step > 0) || ticks > 200) return { svg: '', vw: 0, vh: 0, warnings: ['Need min < max and at most 200 ticks'] };
  const pad = 40, y = 120, vw = width, vh = 190;
  const X = (v: number) => pad + ((v - min) / (max - min)) * (vw - 2 * pad);
  const out: string[] = [];
  const labelEvery = spec.labelEvery ?? Math.max(1, Math.ceil((ticks + 1) / ((vw - 2 * pad) / 44)));
  const label = (v: number) => (spec.denominator ? fractionLabel(v, spec.denominator) : String(+v.toFixed(6)));
  out.push(`<line id="axis" x1="${pad - 22}" y1="${y}" x2="${vw - pad + 22}" y2="${y}" stroke-width="2" marker-start="url(#arrow)" marker-end="url(#arrow)"/>`);
  const tickMarks: string[] = [];
  for (let i = 0; i <= ticks; i++) {
    const v = min + i * spec.step, x = f1(X(v));
    const major = i % labelEvery === 0;
    tickMarks.push(`<line x1="${x}" y1="${y - (major ? 9 : 6)}" x2="${x}" y2="${y + (major ? 9 : 6)}" stroke-width="${major ? 2 : 1.3}"/>`);
    if (major) tickMarks.push(`<text x="${x}" y="${y + 32}" text-anchor="middle" font-size="16" fill="#44403c">${esc(label(v))}</text>`);
  }
  out.push(`<g id="ticks">${tickMarks.join('')}</g>`);
  (spec.intervals ?? []).forEach((iv, k) => {
    const c = iv.color ?? PALETTE[k % PALETTE.length]!;
    const x1 = X(Math.max(min, iv.from)), x2 = X(Math.min(max, iv.to));
    out.push(
      `<g id="interval-${k}"><line x1="${f1(x1)}" y1="${y}" x2="${f1(x2)}" y2="${y}" stroke="${c}" stroke-width="7" stroke-linecap="butt" opacity="0.85"/>` +
        (iv.from >= min ? `<circle cx="${f1(x1)}" cy="${y}" r="8" fill="${iv.openFrom ? '#ffffff' : c}" stroke="${c}" stroke-width="3"/>` : '') +
        (iv.to <= max ? `<circle cx="${f1(x2)}" cy="${y}" r="8" fill="${iv.openTo ? '#ffffff' : c}" stroke="${c}" stroke-width="3"/>` : '') +
        `</g>`,
    );
  });
  (spec.jumps ?? []).forEach((j, k) => {
    const x1 = X(j.from), x2 = X(j.to), mid = (x1 + x2) / 2, h = Math.min(70, 18 + Math.abs(x2 - x1) * 0.35);
    const c = PALETTE[k % PALETTE.length]!;
    out.push(
      `<g id="jump-${k}"><path d="M${f1(x1)} ${y - 6} Q${f1(mid)} ${f1(y - 6 - h * 2)} ${f1(x2)} ${y - 6}" stroke="${c}" stroke-width="2.5" marker-end="url(#arrow)"/>` +
        (j.label ? `<text x="${f1(mid)}" y="${f1(y - 14 - h)}" text-anchor="middle" font-size="16" font-weight="600" fill="${c}">${esc(j.label)}</text>` : '') +
        `</g>`,
    );
  });
  (spec.points ?? []).forEach((p, k) => {
    if (p.value < min || p.value > max) return warnings.push(`Point ${p.value} is outside the line`);
    const c = p.color ?? '#dc2626', x = f1(X(p.value));
    out.push(
      `<g id="point-${k}"><circle cx="${x}" cy="${y}" r="7" fill="${p.open ? '#ffffff' : c}" stroke="${c}" stroke-width="3"/>` +
        (p.label ? `<text x="${x}" y="${y - 18}" text-anchor="middle" font-size="16" font-weight="700" fill="${c}">${esc(p.label)}</text>` : '') +
        `</g>`,
    );
  });
  return { svg: `<svg viewBox="0 0 ${vw} ${vh}">${out.join('')}</svg>`, vw, vh, warnings };
}

// ---- Fraction models

export interface FractionModelSpec {
  fractions: { numerator: number; denominator: number; label?: string; color?: string }[];
  shape?: 'bar' | 'circle';
  /** Show the fraction label next to each model (default true). */
  labels?: boolean;
}

export function buildFractionModel(spec: FractionModelSpec): BuiltSvg {
  const warnings: string[] = [];
  const fr = spec.fractions.slice(0, 6).filter((f) => {
    const ok = f.denominator >= 1 && f.denominator <= 24 && f.numerator >= 0 && f.numerator <= f.denominator * 3;
    if (!ok) warnings.push(`Can't draw ${f.numerator}/${f.denominator} (denominator 1-24)`);
    return ok;
  });
  if (!fr.length) return { svg: '', vw: 0, vh: 0, warnings: [...warnings, 'No drawable fractions'] };
  const out: string[] = [];
  const showLabels = spec.labels !== false;
  if ((spec.shape ?? 'bar') === 'bar') {
    // Bars of equal width stacked, so equivalent fractions line up.
    const W = 560, H = 54, gap = 22, lx = showLabels ? 110 : 20;
    fr.forEach((f, k) => {
      const c = f.color ?? PALETTE[k % PALETTE.length]!, fill = FILLS[c] ?? c;
      const wholes = Math.max(1, Math.ceil(f.numerator / f.denominator));
      const y = 20 + k * (H + gap);
      const bw = (W - (wholes - 1) * 12) / wholes;
      const cells: string[] = [];
      for (let w = 0; w < wholes; w++) {
        const x0 = lx + w * (bw + 12);
        for (let i = 0; i < f.denominator; i++) {
          const idx = w * f.denominator + i, x = x0 + (i * bw) / f.denominator;
          cells.push(`<rect x="${f1(x)}" y="${y}" width="${f1(bw / f.denominator)}" height="${H}" fill="${idx < f.numerator ? fill : '#ffffff'}" stroke="${c}" stroke-width="2"/>`);
        }
      }
      out.push(`<g id="fraction-${k}">${cells.join('')}${showLabels ? `<text x="${lx - 16}" y="${y + H / 2 + 8}" text-anchor="end" font-size="24" font-weight="700" fill="${c}">${esc(f.label ?? `${f.numerator}/${f.denominator}`)}</text>` : ''}</g>`);
    });
    return { svg: `<svg viewBox="0 0 ${lx + W + 20} ${40 + fr.length * (H + gap) - gap}">${out.join('')}</svg>`, vw: lx + W + 20, vh: 40 + fr.length * (H + gap) - gap, warnings };
  }
  const R = 70, cell = 2 * R + 60;
  fr.forEach((f, k) => {
    const c = f.color ?? PALETTE[k % PALETTE.length]!, fill = FILLS[c] ?? c;
    const wholes = Math.max(1, Math.ceil(f.numerator / f.denominator));
    const parts: string[] = [];
    for (let w = 0; w < wholes; w++) {
      const cx = 30 + R + k * cell + w * (2 * R + 14), cy = 30 + R;
      for (let i = 0; i < f.denominator; i++) {
        const idx = w * f.denominator + i;
        const a0 = -Math.PI / 2 + (i / f.denominator) * 2 * Math.PI, a1 = -Math.PI / 2 + ((i + 1) / f.denominator) * 2 * Math.PI;
        const d = f.denominator === 1 ? `M${cx - R} ${cy}A${R} ${R} 0 1 1 ${cx + R} ${cy}A${R} ${R} 0 1 1 ${cx - R} ${cy}Z` : `M${cx} ${cy}L${f1(cx + R * Math.cos(a0))} ${f1(cy + R * Math.sin(a0))}A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${f1(cx + R * Math.cos(a1))} ${f1(cy + R * Math.sin(a1))}Z`;
        parts.push(`<path d="${d}" fill="${idx < f.numerator ? fill : '#ffffff'}" stroke="${c}" stroke-width="2"/>`);
      }
    }
    const cx = 30 + R + k * cell;
    out.push(`<g id="fraction-${k}">${parts.join('')}${showLabels ? `<text x="${cx}" y="${30 + 2 * R + 36}" text-anchor="middle" font-size="24" font-weight="700" fill="${c}">${esc(f.label ?? `${f.numerator}/${f.denominator}`)}</text>` : ''}</g>`);
  });
  const extra = fr.reduce((s, f) => s + (Math.max(1, Math.ceil(f.numerator / f.denominator)) - 1) * (2 * R + 14), 0);
  const vw = 60 + fr.length * cell - 60 + extra + 2 * R / 2 + 20, vh = 30 + 2 * R + 56;
  return { svg: `<svg viewBox="0 0 ${f1(vw)} ${vh}">${out.join('')}</svg>`, vw: f1(vw), vh, warnings };
}

// ---- Manipulatives

export type ManipulativeSpec =
  | { kind: 'base_ten'; number: number }
  | { kind: 'ten_frame'; number: number; color?: string }
  | { kind: 'array'; rows: number; columns: number; groupBy?: 'rows' | 'columns' }
  | { kind: 'counters'; groups: number[]; labels?: string[] };

export function buildManipulatives(spec: ManipulativeSpec): BuiltSvg {
  const out: string[] = [];
  switch (spec.kind) {
    case 'base_ten': {
      const n = Math.round(spec.number);
      if (n < 0 || n > 9999) return { svg: '', vw: 0, vh: 0, warnings: ['base_ten works for 0-9999'] };
      const th = Math.floor(n / 1000), h = Math.floor((n % 1000) / 100), t = Math.floor((n % 100) / 10), o = n % 10;
      const U = 12;
      let x = 20;
      const top = 30;
      const label = (cx: number, count: number, name: string) => `<text x="${cx}" y="${top + 10 * U + 40}" text-anchor="middle" font-size="16" fill="#44403c"><tspan font-weight="700">${count}</tspan> ${name}</text>`;
      const cube = (cx: number, cy: number, fill: string) => `<rect x="${cx}" y="${cy}" width="${U}" height="${U}" fill="${fill}" stroke="#1e3a8a" stroke-width="1"/>`;
      if (th) {
        const g: string[] = [];
        for (let k = 0; k < th; k++) {
          const bx = x + k * (10 * U + 26);
          g.push(`<rect x="${bx + 14}" y="${top - 14}" width="${10 * U}" height="${10 * U}" fill="#c7d2fe" stroke="#3730a3"/><rect x="${bx}" y="${top}" width="${10 * U}" height="${10 * U}" fill="#a5b4fc" stroke="#3730a3"/><path d="M${bx} ${top}l14 -14M${bx + 10 * U} ${top}l14 -14M${bx + 10 * U} ${top + 10 * U}l14 -14" stroke="#3730a3"/>`);
        }
        out.push(`<g id="thousands">${g.join('')}${label(x + (th * (10 * U + 26)) / 2, th, th === 1 ? 'thousand' : 'thousands')}</g>`);
        x += th * (10 * U + 26) + 24;
      }
      if (h) {
        const g: string[] = [];
        for (let k = 0; k < h; k++) {
          const bx = x + k * (10 * U + 10);
          for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) g.push(cube(bx + c * U, top + r * U, '#93c5fd'));
        }
        out.push(`<g id="hundreds">${g.join('')}${label(x + (h * (10 * U + 10)) / 2, h, h === 1 ? 'hundred' : 'hundreds')}</g>`);
        x += h * (10 * U + 10) + 24;
      }
      if (t) {
        const g: string[] = [];
        for (let k = 0; k < t; k++) for (let r = 0; r < 10; r++) g.push(cube(x + k * (U + 6), top + r * U, '#86efac'));
        out.push(`<g id="tens">${g.join('')}${label(x + (t * (U + 6)) / 2, t, t === 1 ? 'ten' : 'tens')}</g>`);
        x += t * (U + 6) + 24;
      }
      if (o || n === 0) {
        const g: string[] = [];
        for (let k = 0; k < o; k++) g.push(cube(x + (k % 2) * (U + 4), top + 10 * U - (Math.floor(k / 2) + 1) * (U + 4), '#fde68a'));
        out.push(`<g id="ones">${g.join('')}${label(x + U, o, o === 1 ? 'one' : 'ones')}</g>`);
        x += 2 * (U + 4) + 30;
      }
      const vw = Math.max(x + 10, 160), vh = top + 10 * U + 60;
      return { svg: `<svg viewBox="0 0 ${vw} ${vh}">${out.join('')}</svg>`, vw, vh, warnings: [] };
    }
    case 'ten_frame': {
      const n = Math.round(spec.number);
      if (n < 0 || n > 40) return { svg: '', vw: 0, vh: 0, warnings: ['ten_frame works for 0-40'] };
      const frames = Math.max(1, Math.ceil(n / 10)), S = 52, c = spec.color ?? '#dc2626';
      for (let fIdx = 0; fIdx < frames; fIdx++) {
        const y0 = 20 + fIdx * (2 * S + 24);
        const cells: string[] = [];
        for (let i = 0; i < 10; i++) cells.push(`<rect x="${20 + (i % 5) * S}" y="${y0 + Math.floor(i / 5) * S}" width="${S}" height="${S}" fill="#ffffff" stroke="#57534e" stroke-width="2"/>`);
        out.push(`<g id="frame-${fIdx}" data-static="">${cells.join('')}</g>`);
        for (let i = 0; i < 10; i++) {
          const k = fIdx * 10 + i;
          if (k >= n) break;
          out.push(`<circle id="dot-${k}" cx="${20 + (i % 5) * S + S / 2}" cy="${y0 + Math.floor(i / 5) * S + S / 2}" r="${S / 2 - 8}" fill="${c}" stroke="none"/>`);
        }
      }
      const vw = 40 + 5 * S, vh = 40 + frames * (2 * S + 24) - 24;
      return { svg: `<svg viewBox="0 0 ${vw} ${vh}">${out.join('')}</svg>`, vw, vh, warnings: [] };
    }
    case 'array': {
      const R = Math.round(spec.rows), C = Math.round(spec.columns);
      if (R < 1 || C < 1 || R * C > 400) return { svg: '', vw: 0, vh: 0, warnings: ['array needs 1-400 dots'] };
      const S = Math.max(14, Math.min(40, 520 / Math.max(R, C)));
      const groups = spec.groupBy === 'columns' ? C : R;
      for (let gIdx = 0; gIdx < groups; gIdx++) {
        const dots: string[] = [];
        const color = PALETTE[gIdx % PALETTE.length]!;
        const n = spec.groupBy === 'columns' ? R : C;
        for (let i = 0; i < n; i++) {
          const r = spec.groupBy === 'columns' ? i : gIdx, c = spec.groupBy === 'columns' ? gIdx : i;
          dots.push(`<circle cx="${f1(30 + c * S + S / 2)}" cy="${f1(30 + r * S + S / 2)}" r="${f1(S * 0.34)}" fill="${spec.groupBy ? color : '#2563eb'}" stroke="none"/>`);
        }
        out.push(`<g id="${spec.groupBy === 'columns' ? 'column' : 'row'}-${gIdx}">${dots.join('')}</g>`);
      }
      out.push(`<text id="caption" x="${f1(30 + (C * S) / 2)}" y="${f1(30 + R * S + 30)}" text-anchor="middle" font-size="18" font-weight="600" fill="#44403c">${R} × ${C} = ${R * C}</text>`);
      const vw = f1(60 + C * S), vh = f1(70 + R * S);
      return { svg: `<svg viewBox="0 0 ${vw} ${vh}">${out.join('')}</svg>`, vw, vh, warnings: [] };
    }
    case 'counters': {
      const groups = spec.groups.slice(0, 6).map((g) => Math.max(0, Math.min(30, Math.round(g))));
      const S = 30;
      let x = 20;
      groups.forEach((n, gIdx) => {
        const color = PALETTE[gIdx % PALETTE.length]!, cols = Math.min(5, Math.max(1, n)), rows = Math.ceil(n / 5) || 1;
        const dots: string[] = [];
        for (let i = 0; i < n; i++) dots.push(`<circle cx="${x + (i % 5) * S + S / 2}" cy="${30 + Math.floor(i / 5) * S + S / 2}" r="11" fill="${color}" stroke="none"/>`);
        const label = spec.labels?.[gIdx] ?? String(n);
        out.push(`<g id="group-${gIdx}"><rect x="${x - 6}" y="24" width="${cols * S + 12}" height="${rows * S + 12}" rx="12" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="5 4"/>${dots.join('')}<text x="${x + (cols * S) / 2}" y="${30 + rows * S + 34}" text-anchor="middle" font-size="18" font-weight="700" fill="${color}">${esc(label)}</text></g>`);
        x += cols * S + 40;
        if (gIdx < groups.length - 1) out.push(`<text id="plus-${gIdx}" x="${x - 21}" y="${30 + S}" text-anchor="middle" font-size="26" font-weight="700" fill="#57534e">+</text>`);
      });
      const maxRows = Math.max(1, ...groups.map((n) => Math.ceil(n / 5)));
      const vw = x, vh = 30 + maxRows * S + 50;
      return { svg: `<svg viewBox="0 0 ${vw} ${vh}">${out.join('')}</svg>`, vw, vh, warnings: [] };
    }
  }
}

// ---- Column arithmetic

export interface ColumnArithmeticSpec { a: number; b: number; op: '+' | '-' | '×' | '÷' }

const digitsOf = (n: number) => String(n).split('').map(Number);

/**
 * Standard written methods with every carry, borrow and partial product computed: addition and
 * subtraction (with carries/borrows), long multiplication, and long division (with remainder).
 * Parts are emitted right to left, so drawing in follows the order the steps are done.
 */
export function buildColumnArithmetic(spec: ColumnArithmeticSpec): BuiltSvg {
  const { a, b, op } = spec;
  if (![a, b].every((n) => Number.isInteger(n) && n >= 0 && n < 1e9)) return { svg: '', vw: 0, vh: 0, warnings: ['Use whole numbers from 0 to 999,999,999'] };
  const CW = 34, RH = 46, FS = 30;
  const out: string[] = [];
  const digit = (id: string, d: string | number, col: number, row: number, x0: number, color = '#1c1c1a', size = FS) => `<text id="${id}" x="${x0 + col * CW}" y="${row * RH}" text-anchor="middle" font-size="${size}" font-family="ui-monospace, Menlo, monospace" fill="${color}">${d}</text>`;
  if (op === '+' || op === '-') {
    if (op === '-' && b > a) return { svg: '', vw: 0, vh: 0, warnings: ['Subtraction here needs a ≥ b'] };
    const res = op === '+' ? a + b : a - b;
    const width = Math.max(String(a).length, String(b).length, String(res).length) + 1;
    const x0 = 30 + CW / 2;
    const col = (len: number, i: number) => width - len + i; // right-aligned
    const da = digitsOf(a), db = digitsOf(b), dr = digitsOf(res);
    out.push(`<g id="problem" data-static="">${da.map((d, i) => digit('', d, col(da.length, i), 2, x0)).join('')}${db.map((d, i) => digit('', d, col(db.length, i), 3, x0)).join('')}${digit('', op === '+' ? '+' : '−', 0, 3, x0)}<line x1="${x0 - CW / 2}" y1="${3 * RH + 14}" x2="${x0 + (width - 0.5) * CW}" y2="${3 * RH + 14}" stroke-width="2.5"/></g>`);
    // Column by column from the right.
    const A = [...da].reverse(), B = [...db].reverse();
    let carry = 0;
    const work = [...A];
    for (let k = 0; k < dr.length; k++) {
      const c = width - 1 - k;
      if (op === '+') {
        const s = (A[k] ?? 0) + (B[k] ?? 0) + carry;
        if (carry) out.push(digit(`carry-${k}`, carry, c, 1, x0, '#dc2626', 18));
        carry = s >= 10 ? 1 : 0;
      } else {
        const top = work[k] ?? 0;
        if (top < (B[k] ?? 0)) {
          // Borrow from the next non-zero digit to the left.
          let j = k + 1;
          while ((work[j] ?? 0) === 0) j++;
          for (let m = j; m > k; m--) {
            work[m] = (work[m] ?? 0) - 1;
            if (m - 1 > k) work[m - 1] = (work[m - 1] ?? 0) + 10;
            out.push(`<g id="borrow-${k}-${m}"><line x1="${x0 + (width - 1 - m) * CW - 11}" y1="${2 * RH - 10}" x2="${x0 + (width - 1 - m) * CW + 11}" y2="${2 * RH - 26}" stroke="#dc2626" stroke-width="2"/>${digit('', work[m] ?? 0, width - 1 - m, 1, x0, '#dc2626', 18)}</g>`);
          }
          work[k] = top + 10;
          out.push(digit(`borrowed-${k}`, work[k]!, c, 1, x0, '#dc2626', 18));
        }
      }
      out.push(digit(`result-${k}`, dr[dr.length - 1 - k]!, c, 4, x0, '#2563eb'));
    }
    const vw = 60 + width * CW, vh = 4 * RH + 24;
    return { svg: `<svg viewBox="0 0 ${vw} ${vh}">${out.join('')}</svg>`, vw, vh, warnings: [] };
  }
  if (op === '×') {
    const res = a * b;
    const db = digitsOf(b).reverse();
    const width = Math.max(String(res).length, String(a).length, String(b).length) + 1;
    const x0 = 30 + CW / 2;
    const right = (s: string, row: number, id: string, shift = 0, color = '#1c1c1a') => s.split('').map((d, i) => digit(`${id}-${i}`, d, width - s.length + i - shift, row, x0, color)).join('');
    out.push(`<g id="problem" data-static="">${right(String(a), 2, 'a')}${right(String(b), 3, 'b')}${digit('', '×', 0, 3, x0)}<line x1="${x0 - CW / 2}" y1="${3 * RH + 14}" x2="${x0 + (width - 0.5) * CW}" y2="${3 * RH + 14}" stroke-width="2.5"/></g>`);
    let row = 4;
    if (db.length > 1) {
      db.forEach((d, k) => {
        const partial = a * d;
        out.push(`<g id="partial-${k}">${right(String(partial), row, `p${k}`, k, '#ea580c')}${Array.from({ length: k }, (_, z) => digit('', 0, width - 1 - z, row, x0, '#a8a29e')).join('')}</g>`);
        row++;
      });
      out.push(`<line id="sum-line" x1="${x0 - CW / 2}" y1="${(row - 1) * RH + 14}" x2="${x0 + (width - 0.5) * CW}" y2="${(row - 1) * RH + 14}" stroke-width="2.5"/>`);
    }
    out.push(`<g id="result">${right(String(res), row, 'r', 0, '#2563eb')}</g>`);
    const vw = 60 + width * CW, vh = row * RH + 24;
    return { svg: `<svg viewBox="0 0 ${vw} ${vh}">${out.join('')}</svg>`, vw, vh, warnings: [] };
  }
  // Long division: divisor ) dividend with the quotient on top and each subtract-and-bring-down step.
  if (b === 0) return { svg: '', vw: 0, vh: 0, warnings: ["Can't divide by zero"] };
  const dd = digitsOf(a), divisor = String(b);
  const left = 30 + divisor.length * CW + 18, x0 = left + CW / 2;
  out.push(`<g id="problem" data-static="">${divisor.split('').map((d, i) => `<text x="${30 + i * CW + CW / 2}" y="${2 * RH}" text-anchor="middle" font-size="${FS}" font-family="ui-monospace, Menlo, monospace">${d}</text>`).join('')}` +
    `<path d="M${left - 8} ${2 * RH + 12} Q${left + 6} ${2 * RH - 14} ${left - 8} ${RH + 12}L${left + dd.length * CW + 6} ${RH + 12}" stroke-width="2.5"/>${dd.map((d, i) => digit('', d, i, 2, x0)).join('')}</g>`);
  let rem = 0, row = 3, started = false;
  const q: number[] = [];
  dd.forEach((d, i) => {
    rem = rem * 10 + d;
    const qd = Math.floor(rem / b);
    q.push(qd);
    if (qd > 0 || started || i === dd.length - 1) {
      started = true;
      const prod = qd * b;
      out.push(`<g id="step-${i}">${digit(`q-${i}`, qd, i, 1, x0, '#2563eb')}` +
        `${String(prod).split('').map((c, k) => digit('', c, i - String(prod).length + 1 + k, row, x0, '#ea580c')).join('')}${digit('', '−', i - String(prod).length, row, x0, '#a8a29e', 22)}` +
        `<line x1="${x0 + (i - String(prod).length + 0.5) * CW - CW}" y1="${row * RH + 12}" x2="${x0 + (i + 0.5) * CW}" y2="${row * RH + 12}" stroke-width="2"/>` +
        `${String(rem - prod).split('').map((c, k) => digit('', c, i - String(rem - prod).length + 1 + k, row + 1, x0)).join('')}` +
        (i < dd.length - 1 ? digit('', dd[i + 1]!, i + 1, row + 1, x0, '#16a34a') : '') +
        `</g>`);
      row += 2;
      rem -= prod;
    }
  });
  if (rem) out.push(`<text id="remainder" x="${x0 + dd.length * CW + 4}" y="${RH}" font-size="22" fill="#dc2626">r ${rem}</text>`);
  const vw = x0 + dd.length * CW + (rem ? 90 : 30), vh = row * RH;
  return { svg: `<svg viewBox="0 0 ${vw} ${vh}">${out.join('')}</svg>`, vw, vh, warnings: [] };
}
