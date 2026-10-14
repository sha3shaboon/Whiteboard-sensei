// Geometric figures computed from a description, so marks land exactly where they belong:
// the AI says "angle at B between BA and BC, labeled θ" and this module works out the arc,
// the label on the bisector, side labels outside each edge, point labels away from the figure.
// Coordinates are math coordinates (y up); the figure is scaled to fit its box.

export interface FigurePoint {
  name: string;
  x: number;
  y: number;
}

export interface FigureSpec {
  points?: FigurePoint[];
  /** Triangle from three side lengths: names [A, B, C], sides [a, b, c] (a = BC, b = CA, c = AB). */
  triangle_sss?: { names: [string, string, string]; sides: [number, number, number] };
  /** Foot of the perpendicular from `from` to the line through `to[0]`, `to[1]` (altitudes). */
  feet?: { name: string; from: string; to: [string, string] }[];
  midpoints?: { name: string; of: [string, string] }[];
  segments?: (string | [string, string])[];
  /** Filled polygons, e.g. ["A","B","C"] or "ABC". */
  polygons?: (string | string[])[];
  angles?: { at: string; from: string; to: string; label?: string; right?: boolean; color?: string }[];
  sides?: { from: string; to: string; label: string; color?: string }[];
  ticks?: { from: string; to: string; count?: number }[];
  circles?: { center: string; radius?: number; through?: string }[];
  /** Point labels (default: all points get their name). */
  label_points?: boolean;
  hide_points?: string[];
}

export interface BuiltFigure {
  svg: string;
  vw: number;
  vh: number;
  warnings: string[];
}

type P = { x: number; y: number };

const INK = '#1c1c1a';
const BLUE = '#2563eb';
const RED = '#dc2626';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const f = (n: number) => Math.round(n * 10) / 10;
const pair = (s: string | [string, string]): [string, string] | null => {
  if (Array.isArray(s)) return s.length === 2 ? [s[0], s[1]] : null;
  const m = /^([A-Za-z][0-9']*)([A-Za-z][0-9']*)$/.exec(s.trim());
  return m ? [m[1]!, m[2]!] : null;
};
const names = (s: string | string[]): string[] => (Array.isArray(s) ? s : s.match(/[A-Za-z][0-9']*/g) ?? []);

/** Resolves all points (given + constructed) in math coordinates. */
export function resolvePoints(spec: FigureSpec, warnings: string[] = []): Map<string, P> {
  const pts = new Map<string, P>();
  for (const p of spec.points ?? []) if (Number.isFinite(p.x) && Number.isFinite(p.y)) pts.set(p.name, { x: p.x, y: p.y });
  if (spec.triangle_sss) {
    const [A, B, C] = spec.triangle_sss.names;
    const [a, b, c] = spec.triangle_sss.sides;
    if (!(a > 0 && b > 0 && c > 0) || a + b <= c || a + c <= b || b + c <= a) warnings.push('triangle_sss: those side lengths do not form a triangle');
    else {
      // A at the origin, B along the x-axis, C above: from the law of cosines.
      const cx = (b * b + c * c - a * a) / (2 * c);
      pts.set(A, { x: 0, y: 0 });
      pts.set(B, { x: c, y: 0 });
      pts.set(C, { x: cx, y: Math.sqrt(Math.max(0, b * b - cx * cx)) });
    }
  }
  for (const m of spec.midpoints ?? []) {
    const a = pts.get(m.of[0]), b = pts.get(m.of[1]);
    if (a && b) pts.set(m.name, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    else warnings.push(`midpoint ${m.name}: unknown point`);
  }
  for (const ft of spec.feet ?? []) {
    const p = pts.get(ft.from), a = pts.get(ft.to[0]), b = pts.get(ft.to[1]);
    if (!p || !a || !b) {
      warnings.push(`foot ${ft.name}: unknown point`);
      continue;
    }
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1);
    pts.set(ft.name, { x: a.x + t * dx, y: a.y + t * dy });
  }
  return pts;
}

export function buildFigure(spec: FigureSpec): BuiltFigure {
  const warnings: string[] = [];
  const math = resolvePoints(spec, warnings);
  if (!math.size) return { svg: '', vw: 0, vh: 0, warnings: [...warnings, 'No points: give points or triangle_sss'] };

  // Fit math coordinates into the drawing (y flipped), keeping proportions.
  const xs = [...math.values()].map((p) => p.x), ys = [...math.values()].map((p) => p.y);
  for (const c of spec.circles ?? []) {
    const o = math.get(c.center);
    const r = circleRadius(c, math);
    if (o && r) xs.push(o.x - r, o.x + r), ys.push(o.y - r, o.y + r);
  }
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
  const PAD = 44, W = 360;
  const s = Math.min(W / spanX, 260 / spanY);
  const vw = Math.round(spanX * s + PAD * 2), vh = Math.round(spanY * s + PAD * 2);
  const P = new Map<string, P>([...math].map(([k, p]) => [k, { x: PAD + (p.x - minX) * s, y: PAD + (maxY - p.y) * s }]));
  const centroid = average([...P.values()]);
  const get = (n: string) => {
    const p = P.get(n);
    if (!p) warnings.push(`unknown point ${n}`);
    return p;
  };

  const parts: string[] = [];
  const polygonCenters: P[] = [];

  for (const poly of spec.polygons ?? []) {
    const ns = names(poly);
    const ps = ns.map(get).filter(Boolean) as P[];
    if (ps.length < 3) continue;
    polygonCenters.push(average(ps));
    parts.push(`<polygon id="poly-${ns.join('')}" points="${ps.map((p) => `${f(p.x)},${f(p.y)}`).join(' ')}" fill="#dbeafe" stroke="${BLUE}" stroke-width="2"/>`);
  }
  for (const seg of spec.segments ?? []) {
    const pr = pair(seg);
    const a = pr && get(pr[0]), b = pr && get(pr[1]);
    if (!pr || !a || !b) continue;
    parts.push(`<line id="seg-${pr[0]}${pr[1]}" x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="${INK}" stroke-width="2"/>`);
  }
  for (const c of spec.circles ?? []) {
    const o = get(c.center);
    const r = circleRadius(c, math);
    if (o && r) parts.push(`<circle id="circle-${c.center}" cx="${f(o.x)}" cy="${f(o.y)}" r="${f(r * s)}" stroke="${BLUE}" stroke-width="2"/>`);
  }
  for (const t of spec.ticks ?? []) {
    const a = get(t.from), b = get(t.to);
    if (!a || !b) continue;
    const n = Math.min(3, Math.max(1, t.count ?? 1));
    const d = unit(sub(b, a)), nrm = { x: -d.y, y: d.x }, m = mid(a, b);
    const ticks = Array.from({ length: n }, (_, i) => {
      const o = (i - (n - 1) / 2) * 5;
      const c = { x: m.x + d.x * o, y: m.y + d.y * o };
      return `M${f(c.x - nrm.x * 6)} ${f(c.y - nrm.y * 6)}L${f(c.x + nrm.x * 6)} ${f(c.y + nrm.y * 6)}`;
    });
    parts.push(`<path id="tick-${t.from}${t.to}" d="${ticks.join('')}" stroke="${INK}" stroke-width="1.8"/>`);
  }
  for (const ang of spec.angles ?? []) {
    const v = get(ang.at), a = get(ang.from), b = get(ang.to);
    if (!v || !a || !b) continue;
    const u1 = unit(sub(a, v)), u2 = unit(sub(b, v));
    const color = ang.color ?? RED;
    const r = Math.min(30, 0.32 * Math.min(len(sub(a, v)), len(sub(b, v))));
    let bis = unit({ x: u1.x + u2.x, y: u1.y + u2.y });
    if (!Number.isFinite(bis.x) || len(bis) < 0.5) bis = { x: -u1.y, y: u1.x }; // straight angle
    if (ang.right) {
      const k = Math.min(14, r * 0.7);
      const p1 = add(v, mul(u1, k)), p2 = add(add(v, mul(u1, k)), mul(u2, k)), p3 = add(v, mul(u2, k));
      parts.push(`<path id="angle-${ang.at}" d="M${f(p1.x)} ${f(p1.y)}L${f(p2.x)} ${f(p2.y)}L${f(p3.x)} ${f(p3.y)}" stroke="${color}" stroke-width="1.8"/>`);
    } else {
      // Arc through the interior (the smaller angle between the two rays).
      const s1 = add(v, mul(u1, r)), s2 = add(v, mul(u2, r));
      const cross = u1.x * u2.y - u1.y * u2.x;
      parts.push(`<path id="angle-${ang.at}" d="M${f(s1.x)} ${f(s1.y)}A${f(r)} ${f(r)} 0 0 ${cross > 0 ? 1 : 0} ${f(s2.x)} ${f(s2.y)}" stroke="${color}" stroke-width="1.8"/>`);
    }
    if (ang.label) {
      const lp = add(v, mul(bis, r + 13));
      parts.push(`<text id="angle-label-${ang.at}" x="${f(lp.x)}" y="${f(lp.y + 5)}" text-anchor="middle" fill="${color}" font-size="15" font-style="italic">${esc(ang.label)}</text>`);
    }
  }
  for (const side of spec.sides ?? []) {
    const a = get(side.from), b = get(side.to);
    if (!a || !b) continue;
    const m = mid(a, b);
    let n = unit({ x: -(b.y - a.y), y: b.x - a.x });
    // Outward: away from the polygon (or figure) center the edge belongs to.
    const ref = nearest(polygonCenters, m) ?? centroid;
    if ((m.x - ref.x) * n.x + (m.y - ref.y) * n.y < 0) n = mul(n, -1);
    const lp = add(m, mul(n, 16));
    const anchor = Math.abs(n.x) < 0.35 ? 'middle' : n.x > 0 ? 'start' : 'end';
    parts.push(`<text id="side-${side.from}${side.to}" x="${f(lp.x)}" y="${f(lp.y + 5)}" text-anchor="${anchor}" fill="${side.color ?? BLUE}" font-size="15" font-style="italic">${esc(side.label)}</text>`);
  }
  const hidden = new Set(spec.hide_points ?? []);
  for (const [name, p] of P) {
    if (hidden.has(name)) continue;
    parts.push(`<circle id="point-${name}" cx="${f(p.x)}" cy="${f(p.y)}" r="3.2" fill="${INK}" stroke="none"/>`);
    if (spec.label_points !== false) {
      let d = unit(sub(p, centroid));
      if (!Number.isFinite(d.x)) d = { x: 0, y: -1 };
      const lp = add(p, mul(d, 15));
      const anchor = Math.abs(d.x) < 0.35 ? 'middle' : d.x > 0 ? 'start' : 'end';
      parts.push(`<text id="label-${name}" x="${f(lp.x)}" y="${f(lp.y + 5)}" text-anchor="${anchor}" font-size="16" font-weight="600" fill="${INK}">${esc(name)}</text>`);
    }
  }

  return { svg: `<svg viewBox="0 0 ${vw} ${vh}">${parts.join('')}</svg>`, vw, vh, warnings };
}

function circleRadius(c: { center: string; radius?: number; through?: string }, math: Map<string, P>): number | undefined {
  if (c.radius && c.radius > 0) return c.radius;
  const o = math.get(c.center), t = c.through ? math.get(c.through) : undefined;
  return o && t ? len(sub(t, o)) : undefined;
}

const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: P, k: number): P => ({ x: a.x * k, y: a.y * k });
const len = (a: P) => Math.hypot(a.x, a.y);
const unit = (a: P): P => mul(a, 1 / (len(a) || 1));
const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const average = (ps: P[]): P => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
const nearest = (cs: P[], p: P) => (cs.length ? cs.reduce((best, c) => (len(sub(c, p)) < len(sub(best, p)) ? c : best)) : undefined);
