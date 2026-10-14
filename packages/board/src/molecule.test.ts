import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildMoleculeSvg, subscriptFormula, type MoleculeData } from './index';

const here = path.dirname(fileURLToPath(import.meta.url));
const caffeine = JSON.parse(readFileSync(path.join(here, '../test-fixtures/caffeine.json'), 'utf8')) as MoleculeData;

describe('molecule drawings', () => {
  it('draws heavy atoms and bonds from real coordinates, hydrogens implied', () => {
    const m = buildMoleculeSvg(caffeine);
    const heavyBonds = caffeine.bonds.filter((b) => caffeine.atoms[b.a]!.el !== 'H' && caffeine.atoms[b.b]!.el !== 'H');
    expect((m.svg.match(/id="bond-/g) ?? []).length).toBe(heavyBonds.length);
    // 4 N and 2 O labeled; carbons are corners (no C labels: all carbons are bonded).
    expect((m.svg.match(/>N</g) ?? []).length).toBe(4);
    expect((m.svg.match(/>O</g) ?? []).length).toBe(2);
    expect(m.svg).not.toMatch(/>C</);
    expect(m.title).toBe('Caffeine · C₈H₁₀N₄O₂');
    // Two C=O plus the ring double bonds draw two lines each.
    const doubles = heavyBonds.filter((b) => b.order === 2).length;
    expect(doubles).toBeGreaterThanOrEqual(3);
    const lines = (m.svg.match(/<line /g) ?? []).length;
    expect(lines).toBe(heavyBonds.length + doubles);
  });

  it('puts each atom label after all its bonds so it sits on top', () => {
    const { svg } = buildMoleculeSvg(caffeine);
    const order = [...svg.matchAll(/id="(bond|atom)-(\d+)"/g)].map((m) => `${m[1]}-${m[2]}`);
    caffeine.bonds.forEach((b, i) => {
      for (const end of [b.a, b.b]) {
        const at = order.indexOf(`atom-${end}`);
        if (at >= 0 && order.includes(`bond-${i}`)) expect(order.indexOf(`bond-${i}`)).toBeLessThan(at);
      }
    });
  });

  it('labels hydrogens on heteroatoms (water, ammonium)', () => {
    const water: MoleculeData = { title: 'water', formula: 'H2O', atoms: [{ el: 'O', x: 0, y: 0 }, { el: 'H', x: 1, y: 0 }, { el: 'H', x: -0.3, y: 0.9 }], bonds: [{ a: 0, b: 1, order: 1 }, { a: 0, b: 2, order: 1 }] };
    const w = buildMoleculeSvg(water);
    expect(w.svg).toContain('>O<');
    expect(w.svg).toMatch(/H<tspan[^>]*>2<\/tspan>/);
    const nh4: MoleculeData = { title: 'ammonium', formula: 'H4N+', atoms: [{ el: 'N', x: 0, y: 0, charge: 1 }, ...[0, 1, 2, 3].map((k) => ({ el: 'H', x: Math.cos(k), y: Math.sin(k) }))], bonds: [1, 2, 3, 4].map((b) => ({ a: 0, b, order: 1 })) };
    expect(buildMoleculeSvg(nh4).svg).toContain('>+<');
  });

  it('formats formulas with subscripts', () => {
    expect(subscriptFormula('C6H12O6')).toBe('C₆H₁₂O₆');
  });
});
