// Structural formulas from real 2D coordinates (PubChem depictions): skeletal style, carbons as
// corners, heteroatoms labeled with their hydrogens, double/triple bonds, charges. Bonds are
// emitted in breadth-first order so drawing them in grows the molecule outwards like by hand.

export interface MoleculeData {
  cid?: number;
  title: string;
  formula: string;
  iupac?: string;
  weight?: string;
  atoms: { el: string; x: number; y: number; charge?: number }[];
  bonds: { a: number; b: number; order: number }[];
}

export interface BuiltMolecule {
  svg: string;
  vw: number;
  vh: number;
  /** e.g. "Caffeine · C₈H₁₀N₄O₂" */
  title: string;
}

const SCALE = 40;
const PAD = 22;
const LABEL_GAP = 9; // bonds stop short of a labeled atom
const COLORS: Record<string, string> = { O: '#dc2626', N: '#2563eb', S: '#a16207', Cl: '#16a34a', F: '#16a34a', Br: '#991b1b', I: '#7e22ce', P: '#ea580c' };
const SUB = '₀₁₂₃₄₅₆₇₈₉';

/** "C8H10N4O2" -> "C₈H₁₀N₄O₂" */
export function subscriptFormula(formula: string): string {
  return formula.replace(/\d/g, (d) => SUB[Number(d)]!);
}

const f = (n: number) => Math.round(n * 10) / 10;

export function buildMoleculeSvg(m: MoleculeData): BuiltMolecule {
  const n = m.atoms.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  m.bonds.forEach((b, i) => {
    adj[b.a]?.push(i);
    adj[b.b]?.push(i);
  });
  const isH = (i: number) => m.atoms[i]!.el === 'H';
  const other = (bond: number, i: number) => (m.bonds[bond]!.a === i ? m.bonds[bond]!.b : m.bonds[bond]!.a);
  const heavyNeighbors = (i: number) => adj[i]!.map((b) => other(b, i)).filter((j) => !isH(j));
  const hCount = (i: number) => adj[i]!.filter((b) => isH(other(b, i))).length;

  // Hydrogens are implied (skeletal formula), except a lone H2 or similar.
  const heavy = m.atoms.map((_, i) => i).filter((i) => !isH(i));
  const visible = heavy.length ? heavy : m.atoms.map((_, i) => i);
  const shown = new Set(visible);

  const xs = visible.map((i) => m.atoms[i]!.x), ys = visible.map((i) => m.atoms[i]!.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const vw = Math.max(80, f((maxX - minX) * SCALE + 2 * PAD + 20));
  const vh = Math.max(60, f((maxY - minY) * SCALE + 2 * PAD));
  const ox = (vw - (maxX - minX) * SCALE) / 2;
  // PubChem's y axis points up; SVG's points down.
  const P = (i: number) => ({ x: (m.atoms[i]!.x - minX) * SCALE + ox, y: (maxY - m.atoms[i]!.y) * SCALE + PAD });

  const labeled = (i: number) => m.atoms[i]!.el !== 'C' || heavyNeighbors(i).length === 0 || !!m.atoms[i]!.charge;

  const atomSvg = (i: number): string => {
    const a = m.atoms[i]!;
    const p = P(i);
    const color = COLORS[a.el] ?? '#1c1c1a';
    const h = a.el === 'C' && heavyNeighbors(i).length ? 0 : hCount(i);
    // Hydrogens go on the side away from the bonds.
    const nb = heavyNeighbors(i).filter((j) => shown.has(j));
    const meanDx = nb.reduce((s, j) => s + P(j).x - p.x, 0);
    const left = nb.length > 0 && meanDx > 0.5;
    const w = a.el.length * 8;
    const parts = [`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${9 + (a.el.length - 1) * 3}" fill="#ffffff" stroke="none"/>`];
    parts.push(`<text x="${f(p.x)}" y="${f(p.y + 5)}" text-anchor="middle" font-size="15" font-weight="600" fill="${color}">${a.el}</text>`);
    if (h) {
      const sub = h > 1 ? `<tspan dy="4" font-size="10">${h}</tspan>` : '';
      parts.push(
        left
          ? `<text x="${f(p.x - w / 2 - 1 - (h > 1 ? 6 : 0))}" y="${f(p.y + 5)}" text-anchor="end" font-size="15" font-weight="600" fill="${color}">H${sub}</text>`
          : `<text x="${f(p.x + w / 2 + 1)}" y="${f(p.y + 5)}" text-anchor="start" font-size="15" font-weight="600" fill="${color}">H${sub}</text>`,
      );
    }
    if (a.charge) {
      const mag = Math.abs(a.charge);
      const sign = (mag > 1 ? String(mag) : '') + (a.charge > 0 ? '+' : '−');
      parts.push(`<text x="${f(p.x + w / 2 + (h && !left ? 12 : 2))}" y="${f(p.y - 5)}" font-size="11" font-weight="600" fill="${color}">${sign}</text>`);
    }
    return `<g id="atom-${i}">${parts.join('')}</g>`;
  };

  const line = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;

  const bondSvg = (bi: number): string => {
    const { a, b, order } = m.bonds[bi]!;
    let p = P(a), q = P(b);
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const ux = (q.x - p.x) / len, uy = (q.y - p.y) / len;
    const nx = -uy, ny = ux;
    const sa = labeled(a) ? LABEL_GAP : 0, sb = labeled(b) ? LABEL_GAP : 0;
    p = { x: p.x + ux * sa, y: p.y + uy * sa };
    q = { x: q.x - ux * sb, y: q.y - uy * sb };
    const out: string[] = [];
    if (order === 2) {
      // Which side are the other atoms on? Ring double bonds put their second line inside the ring.
      const others = [...heavyNeighbors(a).filter((j) => j !== b), ...heavyNeighbors(b).filter((j) => j !== a)];
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      const side = others.reduce((s, j) => s + Math.sign((P(j).x - mid.x) * nx + (P(j).y - mid.y) * ny), 0);
      const terminal = heavyNeighbors(a).length === 1 || heavyNeighbors(b).length === 1;
      if (side === 0 || (terminal && (labeled(a) || labeled(b)))) {
        out.push(line(p.x + nx * 3, p.y + ny * 3, q.x + nx * 3, q.y + ny * 3), line(p.x - nx * 3, p.y - ny * 3, q.x - nx * 3, q.y - ny * 3));
      } else {
        const s = Math.sign(side) * 6;
        const trimA = labeled(a) ? 0 : 5, trimB = labeled(b) ? 0 : 5;
        out.push(line(p.x, p.y, q.x, q.y), line(p.x + nx * s + ux * trimA, p.y + ny * s + uy * trimA, q.x + nx * s - ux * trimB, q.y + ny * s - uy * trimB));
      }
    } else if (order === 3) {
      out.push(line(p.x, p.y, q.x, q.y), line(p.x + nx * 4.5, p.y + ny * 4.5, q.x + nx * 4.5, q.y + ny * 4.5), line(p.x - nx * 4.5, p.y - ny * 4.5, q.x - nx * 4.5, q.y - ny * 4.5));
    } else {
      out.push(line(p.x, p.y, q.x, q.y));
    }
    return `<g id="bond-${bi}">${out.join('')}</g>`;
  };

  // Breadth-first from the first heavy atom (and again for each disconnected fragment). An atom's
  // label goes right after the last of its bonds, so its white backing sits above them.
  const items: string[] = [];
  const seenAtom = new Set<number>(), seenBond = new Set<number>();
  const pending = new Map(visible.map((i) => [i, adj[i]!.filter((bi) => shown.has(other(bi, i))).length]));
  const settle = (i: number) => {
    if (pending.get(i) === 0 && labeled(i)) items.push(atomSvg(i));
  };
  for (const start of visible) {
    if (seenAtom.has(start)) continue;
    const queue = [start];
    seenAtom.add(start);
    settle(start);
    while (queue.length) {
      const i = queue.shift()!;
      for (const bi of adj[i]!) {
        const j = other(bi, i);
        if (!shown.has(j) || seenBond.has(bi)) continue;
        seenBond.add(bi);
        items.push(bondSvg(bi));
        for (const end of [i, j]) {
          pending.set(end, pending.get(end)! - 1);
          settle(end);
        }
        if (!seenAtom.has(j)) {
          seenAtom.add(j);
          queue.push(j);
        }
      }
    }
  }

  const name = m.title ? m.title.charAt(0).toUpperCase() + m.title.slice(1) : 'Molecule';
  return {
    svg: `<svg viewBox="0 0 ${vw} ${vh}" stroke-width="1.8">${items.join('')}</svg>`,
    vw,
    vh,
    title: m.formula ? `${name} · ${subscriptFormula(m.formula)}` : name,
  };
}
