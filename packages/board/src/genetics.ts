// Punnett squares computed from parent genotypes (one or two genes, simple dominance).

export interface PunnettSpec {
  /** e.g. "Aa" x "Aa", or "AaBb" x "aabb". */
  parent1: string;
  parent2: string;
  /** Trait names for each allele letter, e.g. { A: "purple", a: "white" }. */
  traits?: Record<string, string>;
}

export interface PunnettResult {
  gametes1: string[];
  gametes2: string[];
  grid: string[][];
  genotypes: { genotype: string; count: number }[];
  phenotypes: { phenotype: string; count: number }[];
  total: number;
}

// Dominant (uppercase) allele first: "aA" -> "Aa".
const order = (pair: string) => [...pair].sort((x, y) => Number(x !== x.toUpperCase()) - Number(y !== y.toUpperCase()) || (x < y ? -1 : x > y ? 1 : 0)).join('');

function genes(g: string): string[] {
  const s = g.replace(/\s+/g, '');
  if (!/^([A-Za-z]{2}){1,3}$/.test(s)) throw new Error(`Genotype "${g}" should be letter pairs like Aa or AaBb`);
  const pairs = s.match(/../g)!;
  for (const p of pairs) if (p[0]!.toLowerCase() !== p[1]!.toLowerCase()) throw new Error(`"${p}" mixes two genes; write each gene's two alleles together (Aa, Bb)`);
  return pairs;
}

function gametes(pairs: string[]): string[] {
  return pairs.reduce<string[]>((acc, p) => acc.flatMap((g) => [g + p[0], g + p[1]]), ['']);
}

export function punnett(spec: PunnettSpec): PunnettResult {
  const p1 = genes(spec.parent1), p2 = genes(spec.parent2);
  if (p1.length !== p2.length || p1.some((p, i) => p[0]!.toLowerCase() !== p2[i]![0]!.toLowerCase())) throw new Error('Both parents need the same genes in the same order');
  const g1 = gametes(p1), g2 = gametes(p2);
  const grid = g2.map((b) => g1.map((a) => [...a].map((ch, i) => order(ch + b[i])).join('')));
  const geno = new Map<string, number>(), pheno = new Map<string, number>();
  for (const row of grid) for (const g of row) {
    geno.set(g, (geno.get(g) ?? 0) + 1);
    const ph = (g.match(/../g) ?? []).map((pair) => {
      const dom = pair[0] === pair[0]!.toUpperCase() ? pair[0]! : pair[1]!;
      return spec.traits?.[dom] ?? (dom === dom.toUpperCase() ? `dominant ${dom}` : `recessive ${dom}`);
    }).join(', ');
    pheno.set(ph, (pheno.get(ph) ?? 0) + 1);
  }
  const sort = <T extends { count: number }>(xs: T[]) => xs.sort((a, b) => b.count - a.count);
  return {
    gametes1: g1, gametes2: g2, grid,
    genotypes: sort([...geno].map(([genotype, count]) => ({ genotype, count }))),
    phenotypes: sort([...pheno].map(([phenotype, count]) => ({ phenotype, count }))),
    total: g1.length * g2.length,
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Light pastels (lightness > 0.8) so the dark theme turns them into deep tints with readable text.
const COLORS = ['#bfdbfe', '#fef3c7', '#bbf7d0', '#fecaca', '#e9d5ff', '#fed7aa', '#cffafe', '#fbcfe8', '#ecfccb'];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export function buildPunnett(spec: PunnettSpec): { svg: string; vw: number; vh: number; result: PunnettResult } {
  const r = punnett(spec);
  const n = r.gametes1.length, S = n <= 2 ? 92 : n <= 4 ? 70 : 52, H = 46;
  const phenoColor = new Map(r.phenotypes.map((p, i) => [p.phenotype, COLORS[i % COLORS.length]!]));
  const phenoOf = (g: string) => (g.match(/../g) ?? []).map((pair) => {
    const dom = pair[0] === pair[0]!.toUpperCase() ? pair[0]! : pair[1]!;
    return spec.traits?.[dom] ?? (dom === dom.toUpperCase() ? `dominant ${dom}` : `recessive ${dom}`);
  }).join(', ');
  const x0 = 40 + H, y0 = 50 + H;
  const out: string[] = [];
  out.push(`<g id="parents" data-static=""><text x="${x0 + (n * S) / 2}" y="26" text-anchor="middle" font-size="16" fill="#57534e">Parent 1: <tspan font-weight="700">${esc(spec.parent1)}</tspan></text><text x="22" y="${y0 + (n * S) / 2}" text-anchor="middle" font-size="16" fill="#57534e" transform="rotate(-90 22 ${y0 + (n * S) / 2})">Parent 2: <tspan font-weight="700">${esc(spec.parent2)}</tspan></text></g>`);
  out.push(`<g id="gametes">${r.gametes1.map((g, i) => `<text x="${x0 + i * S + S / 2}" y="${y0 - 14}" text-anchor="middle" font-size="20" font-weight="700" fill="#2563eb">${g}</text>`).join('')}${r.gametes2.map((g, j) => `<text x="${x0 - 14}" y="${y0 + j * S + S / 2 + 7}" text-anchor="end" font-size="20" font-weight="700" fill="#ea580c">${g}</text>`).join('')}</g>`);
  r.grid.forEach((row, j) => row.forEach((g, i) => {
    out.push(`<g id="cell-${j}-${i}"><rect x="${x0 + i * S}" y="${y0 + j * S}" width="${S}" height="${S}" fill="${phenoColor.get(phenoOf(g))}" stroke="#57534e" stroke-width="1.5"/><text x="${x0 + i * S + S / 2}" y="${y0 + j * S + S / 2 + 7}" text-anchor="middle" font-size="${S > 60 ? 22 : 15}" font-weight="600" fill="#1c1c1a">${g}</text></g>`);
  }));
  const ratio = (xs: { count: number }[]) => {
    const g = xs.reduce((a, x) => gcd(a, x.count), 0) || 1;
    return xs.map((x) => x.count / g).join(' : ');
  };
  const ly = y0 + n * S + 36;
  out.push(`<g id="summary"><text x="${x0}" y="${ly}" font-size="16" fill="#1c1c1a"><tspan font-weight="700">Genotypes</tspan> ${r.genotypes.map((g) => `${g.genotype} ${g.count}/${r.total}`).join(' · ')}</text>` +
    r.phenotypes.map((p, i) => `<rect x="${x0}" y="${ly + 16 + i * 24}" width="14" height="14" rx="3" fill="${phenoColor.get(p.phenotype)}" stroke="#57534e"/><text x="${x0 + 22}" y="${ly + 28 + i * 24}" font-size="16" fill="#1c1c1a">${esc(p.phenotype)}: ${p.count}/${r.total} (${Math.round((p.count / r.total) * 100)}%)</text>`).join('') +
    `<text x="${x0}" y="${ly + 40 + r.phenotypes.length * 24}" font-size="15" fill="#57534e">Phenotype ratio ${ratio(r.phenotypes)}</text></g>`);
  const vw = Math.max(x0 + n * S + 30, 480), vh = ly + 56 + r.phenotypes.length * 24;
  return { svg: `<svg viewBox="0 0 ${vw} ${vh}">${out.join('')}</svg>`, vw, vh, result: r };
}
