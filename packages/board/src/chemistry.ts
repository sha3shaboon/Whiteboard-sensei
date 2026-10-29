// Chemistry helpers: formula parsing, exact equation balancing, the periodic table (real data),
// electron configurations, and a periodic-table drawing.

/** Atom counts in a formula: "Ca(OH)2" -> { Ca: 1, O: 2, H: 2 }. Supports nesting, [ ], and hydrates (CuSO4·5H2O). */
export function parseFormula(formula: string): Record<string, number> {
  const src = formula.replace(/\s+/g, '').replace(/\^?[0-9]*[+-]$/, ''); // drop a trailing charge
  const parts = src.split(/[·.*]/);
  const total: Record<string, number> = {};
  for (const part of parts) {
    const m = /^(\d+)(.*)$/.exec(part);
    const mult = m ? Number(m[1]) : 1;
    const counts = parseGroup(m ? m[2]! : part);
    for (const [el, n] of Object.entries(counts)) total[el] = (total[el] ?? 0) + n * mult;
  }
  if (!Object.keys(total).length) throw new Error(`Couldn't read the formula "${formula}"`);
  return total;
}

function parseGroup(s: string): Record<string, number> {
  const stack: Record<string, number>[] = [{}];
  let i = 0;
  const num = () => {
    const m = /^\d+/.exec(s.slice(i));
    if (!m) return 1;
    i += m[0].length;
    return Number(m[0]);
  };
  while (i < s.length) {
    const c = s[i]!;
    if (c === '(' || c === '[') {
      stack.push({});
      i++;
    } else if (c === ')' || c === ']') {
      i++;
      const n = num();
      const group = stack.pop();
      if (!group || !stack.length) throw new Error(`Unbalanced brackets in "${s}"`);
      const top = stack.at(-1)!;
      for (const [el, k] of Object.entries(group)) top[el] = (top[el] ?? 0) + k * n;
    } else {
      const m = /^[A-Z][a-z]?/.exec(s.slice(i));
      if (!m || !BY_SYMBOL.has(m[0])) throw new Error(`Unknown element in "${s}" at "${s.slice(i)}"`);
      i += m[0].length;
      const n = num();
      const top = stack.at(-1)!;
      top[m[0]] = (top[m[0]] ?? 0) + n;
    }
  }
  if (stack.length !== 1) throw new Error(`Unbalanced brackets in "${s}"`);
  return stack[0]!;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));

/** Smallest whole-number coefficients that balance the equation, or null if it can't be balanced uniquely. */
export function balanceEquation(reactants: string[], products: string[]): number[] | null {
  const species = [...reactants, ...products].map(parseFormula);
  const elements = [...new Set(species.flatMap((s) => Object.keys(s)))];
  // Matrix rows: elements; columns: species (products negative). Find the null space vector.
  const m = elements.map((el) => species.map((s, j) => (s[el] ?? 0) * (j < reactants.length ? 1 : -1)));
  const n = species.length;
  // Gaussian elimination with exact rationals as [num, den] pairs.
  type Q = [number, number];
  const norm = ([a, b]: Q): Q => {
    if (b < 0) [a, b] = [-a, -b];
    const g = gcd(a, b) || 1;
    return [a / g, b / g];
  };
  const sub = (x: Q, y: Q): Q => norm([x[0] * y[1] - y[0] * x[1], x[1] * y[1]]);
  const mul = (x: Q, y: Q): Q => norm([x[0] * y[0], x[1] * y[1]]);
  const div = (x: Q, y: Q): Q => norm([x[0] * y[1], x[1] * y[0]]);
  const A: Q[][] = m.map((row) => row.map((v) => [v, 1] as Q));
  const pivots: number[] = [];
  let r = 0;
  for (let c = 0; c < n && r < A.length; c++) {
    const p = A.findIndex((row, i) => i >= r && row[c]![0] !== 0);
    if (p < 0) continue;
    [A[r], A[p]] = [A[p]!, A[r]!];
    const pv = A[r]![c]!;
    A[r] = A[r]!.map((v) => div(v, pv));
    for (let i = 0; i < A.length; i++) {
      if (i === r || A[i]![c]![0] === 0) continue;
      const f = A[i]![c]!;
      A[i] = A[i]!.map((v, k) => sub(v, mul(f, A[r]![k]!)));
    }
    pivots.push(c);
    r++;
  }
  const free = [...Array(n).keys()].filter((c) => !pivots.includes(c));
  if (free.length !== 1) return null; // no solution or not unique
  const f = free[0]!;
  const x: Q[] = Array.from({ length: n }, () => [0, 1] as Q);
  x[f] = [1, 1];
  pivots.forEach((c, i) => (x[c] = norm([-A[i]![f]![0], A[i]![f]![1]])));
  const lcm = x.reduce((l, [, d]) => (l * d) / gcd(l, d), 1);
  let ints = x.map(([a, d]) => (a * lcm) / d);
  if (ints.some((v) => v <= 0)) ints = ints.map((v) => -v);
  if (ints.some((v) => v <= 0)) return null;
  const g = ints.reduce((a, b) => gcd(a, b));
  return ints.map((v) => v / g);
}

/** Atom totals on each side for given coefficients, and whether they balance. */
export function checkBalance(reactants: string[], products: string[], coefficients: number[]): { balanced: boolean; left: Record<string, number>; right: Record<string, number> } {
  const side = (list: string[], offset: number) => {
    const t: Record<string, number> = {};
    list.forEach((f, i) => {
      const k = coefficients[offset + i] ?? 0;
      for (const [el, n] of Object.entries(parseFormula(f))) t[el] = (t[el] ?? 0) + n * k;
    });
    return t;
  };
  const left = side(reactants, 0), right = side(products, reactants.length);
  const els = new Set([...Object.keys(left), ...Object.keys(right)]);
  const balanced = coefficients.every((k) => Number.isInteger(k) && k > 0) && [...els].every((el) => left[el] === right[el]);
  return { balanced, left, right };
}

/** "H2O" -> "H₂O" for display. */
export function prettyFormula(f: string): string {
  return f.replace(/(?<=[A-Za-z)\]])(\d+)/g, (d) => [...d].map((c) => '₀₁₂₃₄₅₆₇₈₉'[Number(c)]).join(''));
}

// ---- Periodic table (standard atomic weights; [n] = mass number of the most stable isotope).

export type ElementCategory = 'alkali' | 'alkaline-earth' | 'transition' | 'post-transition' | 'metalloid' | 'nonmetal' | 'halogen' | 'noble-gas' | 'lanthanide' | 'actinide';
export interface ChemElement { z: number; symbol: string; name: string; mass: string; category: ElementCategory; group: number | null; period: number }

const RAW = `H Hydrogen 1.008 nm;He Helium 4.0026 ng;Li Lithium 6.94 al;Be Beryllium 9.0122 ae;B Boron 10.81 md;C Carbon 12.011 nm;N Nitrogen 14.007 nm;O Oxygen 15.999 nm;F Fluorine 18.998 ha;Ne Neon 20.180 ng;
Na Sodium 22.990 al;Mg Magnesium 24.305 ae;Al Aluminium 26.982 pt;Si Silicon 28.085 md;P Phosphorus 30.974 nm;S Sulfur 32.06 nm;Cl Chlorine 35.45 ha;Ar Argon 39.95 ng;
K Potassium 39.098 al;Ca Calcium 40.078 ae;Sc Scandium 44.956 tr;Ti Titanium 47.867 tr;V Vanadium 50.942 tr;Cr Chromium 51.996 tr;Mn Manganese 54.938 tr;Fe Iron 55.845 tr;Co Cobalt 58.933 tr;Ni Nickel 58.693 tr;Cu Copper 63.546 tr;Zn Zinc 65.38 tr;Ga Gallium 69.723 pt;Ge Germanium 72.630 md;As Arsenic 74.922 md;Se Selenium 78.971 nm;Br Bromine 79.904 ha;Kr Krypton 83.798 ng;
Rb Rubidium 85.468 al;Sr Strontium 87.62 ae;Y Yttrium 88.906 tr;Zr Zirconium 91.224 tr;Nb Niobium 92.906 tr;Mo Molybdenum 95.95 tr;Tc Technetium [98] tr;Ru Ruthenium 101.07 tr;Rh Rhodium 102.91 tr;Pd Palladium 106.42 tr;Ag Silver 107.87 tr;Cd Cadmium 112.41 tr;In Indium 114.82 pt;Sn Tin 118.71 pt;Sb Antimony 121.76 md;Te Tellurium 127.60 md;I Iodine 126.90 ha;Xe Xenon 131.29 ng;
Cs Caesium 132.91 al;Ba Barium 137.33 ae;La Lanthanum 138.91 la;Ce Cerium 140.12 la;Pr Praseodymium 140.91 la;Nd Neodymium 144.24 la;Pm Promethium [145] la;Sm Samarium 150.36 la;Eu Europium 151.96 la;Gd Gadolinium 157.25 la;Tb Terbium 158.93 la;Dy Dysprosium 162.50 la;Ho Holmium 164.93 la;Er Erbium 167.26 la;Tm Thulium 168.93 la;Yb Ytterbium 173.05 la;Lu Lutetium 174.97 la;
Hf Hafnium 178.49 tr;Ta Tantalum 180.95 tr;W Tungsten 183.84 tr;Re Rhenium 186.21 tr;Os Osmium 190.23 tr;Ir Iridium 192.22 tr;Pt Platinum 195.08 tr;Au Gold 196.97 tr;Hg Mercury 200.59 tr;Tl Thallium 204.38 pt;Pb Lead 207.2 pt;Bi Bismuth 208.98 pt;Po Polonium [209] pt;At Astatine [210] ha;Rn Radon [222] ng;
Fr Francium [223] al;Ra Radium [226] ae;Ac Actinium [227] ac;Th Thorium 232.04 ac;Pa Protactinium 231.04 ac;U Uranium 238.03 ac;Np Neptunium [237] ac;Pu Plutonium [244] ac;Am Americium [243] ac;Cm Curium [247] ac;Bk Berkelium [247] ac;Cf Californium [251] ac;Es Einsteinium [252] ac;Fm Fermium [257] ac;Md Mendelevium [258] ac;No Nobelium [259] ac;Lr Lawrencium [266] ac;
Rf Rutherfordium [267] tr;Db Dubnium [268] tr;Sg Seaborgium [269] tr;Bh Bohrium [270] tr;Hs Hassium [269] tr;Mt Meitnerium [278] tr;Ds Darmstadtium [281] tr;Rg Roentgenium [282] tr;Cn Copernicium [285] tr;Nh Nihonium [286] pt;Fl Flerovium [289] pt;Mc Moscovium [290] pt;Lv Livermorium [293] pt;Ts Tennessine [294] ha;Og Oganesson [294] ng`;

const CAT: Record<string, ElementCategory> = { nm: 'nonmetal', ng: 'noble-gas', al: 'alkali', ae: 'alkaline-earth', md: 'metalloid', ha: 'halogen', pt: 'post-transition', tr: 'transition', la: 'lanthanide', ac: 'actinide' };

/** Group and period from Z (lanthanides/actinides have no group here; they sit in the f-block rows). */
function position(z: number): { group: number | null; period: number } {
  const starts = [1, 3, 11, 19, 37, 55, 87, 119];
  const period = starts.findIndex((s, i) => z >= s && z < starts[i + 1]!) + 1;
  const k = z - starts[period - 1]! + 1; // index within the period
  if (period === 1) return { group: z === 1 ? 1 : 18, period };
  if (period <= 3) return { group: k <= 2 ? k : k + 10, period };
  if (period <= 5) return { group: k, period };
  // Periods 6-7: 2 s-block, then 15 f-block (La–Lu / Ac–Lr), then groups 4–18.
  if (k <= 2) return { group: k, period };
  if (k <= 17) return { group: null, period };
  return { group: k - 14, period };
}

export const ELEMENTS: ChemElement[] = RAW.replace(/\n/g, '').split(';').map((row, i) => {
  const [symbol, name, mass, cat] = row.trim().split(' ') as [string, string, string, string];
  return { z: i + 1, symbol, name, mass, category: CAT[cat]!, ...position(i + 1) };
});
const BY_SYMBOL = new Map(ELEMENTS.map((e) => [e.symbol, e]));

export function findElement(q: string | number): ChemElement | undefined {
  if (typeof q === 'number' || /^\d+$/.test(String(q))) return ELEMENTS[Number(q) - 1];
  const s = String(q).trim();
  return BY_SYMBOL.get(s) ?? ELEMENTS.find((e) => e.name.toLowerCase() === s.toLowerCase() || (s.toLowerCase() === 'aluminum' && e.symbol === 'Al') || (s.toLowerCase() === 'cesium' && e.symbol === 'Cs') || (s.toLowerCase() === 'sulphur' && e.symbol === 'S'));
}

// Ground-state configurations that break the Madelung order.
const CONFIG_EXCEPTIONS: Record<string, string> = {
  Cr: '[Ar] 3d⁵ 4s¹', Cu: '[Ar] 3d¹⁰ 4s¹', Nb: '[Kr] 4d⁴ 5s¹', Mo: '[Kr] 4d⁵ 5s¹', Ru: '[Kr] 4d⁷ 5s¹', Rh: '[Kr] 4d⁸ 5s¹',
  Pd: '[Kr] 4d¹⁰', Ag: '[Kr] 4d¹⁰ 5s¹', La: '[Xe] 5d¹ 6s²', Ce: '[Xe] 4f¹ 5d¹ 6s²', Gd: '[Xe] 4f⁷ 5d¹ 6s²', Pt: '[Xe] 4f¹⁴ 5d⁹ 6s¹',
  Au: '[Xe] 4f¹⁴ 5d¹⁰ 6s¹', Ac: '[Rn] 6d¹ 7s²', Th: '[Rn] 6d² 7s²', Pa: '[Rn] 5f² 6d¹ 7s²', U: '[Rn] 5f³ 6d¹ 7s²', Np: '[Rn] 5f⁴ 6d¹ 7s²', Cm: '[Rn] 5f⁷ 6d¹ 7s²',
};
const SUP = (n: number) => [...String(n)].map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]).join('');

/** Electron configuration in noble-gas shorthand, e.g. Fe -> "[Ar] 3d⁶ 4s²". Not given beyond Z = 103. */
export function electronConfiguration(z: number): string | null {
  const el = ELEMENTS[z - 1];
  if (!el || z > 103) return null;
  if (CONFIG_EXCEPTIONS[el.symbol]) return CONFIG_EXCEPTIONS[el.symbol]!;
  const order = ['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p', '5s', '4d', '5p', '6s', '4f', '5d', '6p', '7s', '5f', '6d', '7p'];
  const cap: Record<string, number> = { s: 2, p: 6, d: 10, f: 14 };
  const nobles: [number, string][] = [[86, 'Rn'], [54, 'Xe'], [36, 'Kr'], [18, 'Ar'], [10, 'Ne'], [2, 'He']];
  const core = nobles.find(([nz]) => nz < z);
  const fill = (n: number) => {
    const out: [string, number][] = [];
    let left = n;
    for (const o of order) {
      if (left <= 0) break;
      const k = Math.min(cap[o[1]!]!, left);
      out.push([o, k]);
      left -= k;
    }
    return out;
  };
  const coreSubs = new Set(core ? fill(core[0]).map(([o]) => o) : []);
  const subs = fill(z).filter(([o]) => !coreSubs.has(o));
  // Conventional display order: by shell number, then s p d f.
  subs.sort((a, b) => Number(a[0][0]) - Number(b[0][0]) || 'spdf'.indexOf(a[0][1]!) - 'spdf'.indexOf(b[0][1]!));
  return `${core ? `[${core[1]}] ` : ''}${subs.map(([o, k]) => `${o}${SUP(k)}`).join(' ')}`.trim();
}

export const CATEGORY_COLORS: Record<ElementCategory, string> = {
  alkali: '#fecaca', 'alkaline-earth': '#fed7aa', transition: '#fef3c7', 'post-transition': '#ecfccb', metalloid: '#d1fae5',
  nonmetal: '#e0f2fe', halogen: '#c7d2fe', 'noble-gas': '#e9d5ff', lanthanide: '#fbcfe8', actinide: '#f5d0fe',
};
export const CATEGORY_NAMES: Record<ElementCategory, string> = {
  alkali: 'Alkali metals', 'alkaline-earth': 'Alkaline earth metals', transition: 'Transition metals', 'post-transition': 'Post-transition metals', metalloid: 'Metalloids',
  nonmetal: 'Other nonmetals', halogen: 'Halogens', 'noble-gas': 'Noble gases', lanthanide: 'Lanthanides', actinide: 'Actinides',
};

export interface PeriodicTableSpec {
  /** Elements to highlight (symbols, names or numbers). */
  highlight?: string[];
  /** Or highlight a whole group / period / category. */
  group?: number;
  period?: number;
  category?: ElementCategory;
  /** One element to show in detail beside the table. */
  focus?: string;
  /** Show atomic masses in the tiles. */
  masses?: boolean;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The full periodic table as SVG with category colors; highlighted elements stand out, the rest dim. */
export function buildPeriodicTable(spec: PeriodicTableSpec): { svg: string; vw: number; vh: number; warnings: string[] } {
  const warnings: string[] = [];
  const hi = new Set<number>();
  for (const q of spec.highlight ?? []) {
    const el = findElement(q);
    if (el) hi.add(el.z);
    else warnings.push(`Unknown element "${q}"`);
  }
  for (const el of ELEMENTS) {
    if (spec.group && el.group === spec.group) hi.add(el.z);
    if (spec.period && el.period === spec.period && el.group !== null) hi.add(el.z);
    if (spec.category && el.category === spec.category) hi.add(el.z);
  }
  const focus = spec.focus ? findElement(spec.focus) : undefined;
  if (spec.focus && !focus) warnings.push(`Unknown element "${spec.focus}"`);
  if (focus) hi.add(focus.z);
  const anyHi = hi.size > 0;
  const S = 46, G = 3, X0 = 20, Y0 = 30;
  const cellXY = (el: ChemElement): [number, number] => {
    if (el.group !== null) return [X0 + (el.group - 1) * (S + G), Y0 + (el.period - 1) * (S + G)];
    const k = el.category === 'lanthanide' ? el.z - 57 : el.z - 89;
    return [X0 + (k + 2) * (S + G), Y0 + (el.period + 1.5) * (S + G) + 6];
  };
  const out: string[] = [];
  // Group numbers and the f-block placeholders appear instantly.
  out.push(`<g id="frame" data-static="">${Array.from({ length: 18 }, (_, g) => `<text x="${X0 + g * (S + G) + S / 2}" y="${Y0 - 9}" text-anchor="middle" font-size="10" fill="#9a9a94">${g + 1}</text>`).join('')}` +
    `<rect x="${X0 + 2 * (S + G)}" y="${Y0 + 5 * (S + G)}" width="${S}" height="${S}" rx="5" fill="#f5f5f4" stroke="#e7e5e4"/><text x="${X0 + 2 * (S + G) + S / 2}" y="${Y0 + 5 * (S + G) + S / 2 + 4}" text-anchor="middle" font-size="10" fill="#78716c">57–71</text>` +
    `<rect x="${X0 + 2 * (S + G)}" y="${Y0 + 6 * (S + G)}" width="${S}" height="${S}" rx="5" fill="#f5f5f4" stroke="#e7e5e4"/><text x="${X0 + 2 * (S + G) + S / 2}" y="${Y0 + 6 * (S + G) + S / 2 + 4}" text-anchor="middle" font-size="10" fill="#78716c">89–103</text></g>`);
  for (const el of ELEMENTS) {
    const [x, y] = cellXY(el);
    const on = !anyHi || hi.has(el.z);
    const strong = anyHi && hi.has(el.z);
    out.push(
      `<g id="el-${el.symbol}"${strong ? '' : ' data-static=""'} opacity="${on ? 1 : 0.28}">` +
        `<rect x="${x}" y="${y}" width="${S}" height="${S}" rx="5" fill="${CATEGORY_COLORS[el.category]}" stroke="${strong ? '#2563eb' : '#d6d3d1'}" stroke-width="${strong ? 2.5 : 1}"/>` +
        `<text x="${x + 4}" y="${y + 11}" font-size="9" fill="#57534e">${el.z}</text>` +
        `<text x="${x + S / 2}" y="${y + (spec.masses ? 29 : 32)}" text-anchor="middle" font-size="17" font-weight="700" fill="#1c1c1a">${el.symbol}</text>` +
        (spec.masses ? `<text x="${x + S / 2}" y="${y + 41}" text-anchor="middle" font-size="8" fill="#57534e">${el.mass}</text>` : '') +
        `</g>`,
    );
  }
  let vw = X0 * 2 + 18 * (S + G);
  // The f-block rows end at about Y0 + 8.5 rows; the legend goes below them.
  const legendY = Y0 + 8.5 * (S + G) + 6 + S + 26;
  const vh = legendY + 2 * 18 + 8;
  // Legend under the table.
  const cats = Object.keys(CATEGORY_NAMES) as ElementCategory[];
  out.push(`<g id="legend" data-static="">${cats.map((c, i) => {
    const lx = X0 + (i % 5) * 176, ly = legendY + Math.floor(i / 5) * 18;
    return `<rect x="${lx}" y="${ly - 9}" width="11" height="11" rx="2" fill="${CATEGORY_COLORS[c]}" stroke="#d6d3d1"/><text x="${lx + 16}" y="${ly}" font-size="11" fill="#57534e">${CATEGORY_NAMES[c]}</text>`;
  }).join('')}</g>`);
  if (focus) {
    const fx = vw + 10, fy = Y0, W = 230;
    const cfg = electronConfiguration(focus.z);
    out.push(
      `<g id="focus-${focus.symbol}"><rect x="${fx}" y="${fy}" width="${W}" height="250" rx="14" fill="${CATEGORY_COLORS[focus.category]}" stroke="#2563eb" stroke-width="2.5"/>` +
        `<text x="${fx + 16}" y="${fy + 30}" font-size="18" fill="#57534e">${focus.z}</text>` +
        `<text x="${fx + W / 2}" y="${fy + 110}" text-anchor="middle" font-size="70" font-weight="800" fill="#1c1c1a">${focus.symbol}</text>` +
        `<text x="${fx + W / 2}" y="${fy + 145}" text-anchor="middle" font-size="20" font-weight="600" fill="#1c1c1a">${esc(focus.name)}</text>` +
        `<text x="${fx + W / 2}" y="${fy + 172}" text-anchor="middle" font-size="15" fill="#44403c">${focus.mass} u</text>` +
        `<text x="${fx + W / 2}" y="${fy + 198}" text-anchor="middle" font-size="13" fill="#44403c">${esc(CATEGORY_NAMES[focus.category].replace(/s$/, ''))}${focus.group ? ` · group ${focus.group}` : ''} · period ${focus.period}</text>` +
        (cfg ? `<text x="${fx + W / 2}" y="${fy + 226}" text-anchor="middle" font-size="14" fill="#1c1c1a">${cfg}</text>` : '') +
        `</g>`,
    );
    vw = fx + W + 20;
  }
  return { svg: `<svg viewBox="0 0 ${vw} ${vh}">${out.join('')}</svg>`, vw, vh, warnings };
}
