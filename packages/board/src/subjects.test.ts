import { describe, expect, it } from 'vitest';
import {
  buildColumnArithmetic, buildFractionModel, buildGloss, buildManipulatives, buildNotation, buildNumberLine, buildPunnett,
  fractionLabel, parseNote, parseSequence, punnett, simFacts, simFrame, simParams, noteFrequency,
} from './index';

const texts = (svg: string, id: string) => [...svg.matchAll(new RegExp(`id="${id}"[^>]*>([^<]*)<`, 'g'))].map((m) => m[1]);

describe('math visuals', () => {
  it('labels fractions', () => {
    expect(fractionLabel(0.375, 8)).toBe('3/8');
    expect(fractionLabel(0.5, 8)).toBe('1/2');
    expect(fractionLabel(1, 4)).toBe('1');
    expect(fractionLabel(1.25, 4)).toBe('1 1/4');
  });

  it('draws number lines with hops, points and intervals', () => {
    const n = buildNumberLine({ min: 0, max: 10, step: 1, jumps: [{ from: 3, to: 5, label: '+2' }, { from: 5, to: 8, label: '+3' }], points: [{ value: 8, label: '8' }] });
    expect(n.svg).toContain('id="jump-1"');
    expect(n.svg).toContain('+3');
    expect(buildNumberLine({ min: 0, max: 1, step: 0.25, denominator: 4 }).svg).toContain('>3/4<');
    expect(buildNumberLine({ min: -5, max: 5, step: 1, intervals: [{ from: 2, to: 99, openFrom: true }] }).svg).toContain('id="interval-0"');
    expect(buildNumberLine({ min: 1, max: 0, step: 1 }).warnings.length).toBe(1);
  });

  it('draws fraction models, shading the right number of parts', () => {
    const b = buildFractionModel({ fractions: [{ numerator: 3, denominator: 4 }, { numerator: 6, denominator: 8 }] });
    expect((b.svg.match(/fill="#bfdbfe"/g) ?? []).length).toBe(3);
    expect((b.svg.match(/fill="#fed7aa"/g) ?? []).length).toBe(6);
    expect(buildFractionModel({ fractions: [{ numerator: 5, denominator: 4 }] }).svg).toContain('5/4'); // improper: two wholes
    expect(buildFractionModel({ shape: 'circle', fractions: [{ numerator: 1, denominator: 3 }] }).svg).toContain('<path');
  });

  it('builds manipulatives', () => {
    const b = buildManipulatives({ kind: 'base_ten', number: 243 });
    expect(b.svg).toContain('id="hundreds"');
    expect(b.svg).toContain('<tspan font-weight="700">4</tspan> tens');
    expect((buildManipulatives({ kind: 'ten_frame', number: 7 }).svg.match(/id="dot-/g) ?? []).length).toBe(7);
    expect(buildManipulatives({ kind: 'array', rows: 3, columns: 4 }).svg).toContain('3 × 4 = 12');
    expect(buildManipulatives({ kind: 'counters', groups: [3, 4] }).svg).toContain('id="plus-0"');
  });

  it('works column arithmetic out correctly', () => {
    const add = buildColumnArithmetic({ a: 478, b: 256, op: '+' }).svg;
    expect(texts(add, 'result-\\d').reverse().join('')).toBe('734');
    expect(add).toContain('id="carry-1"');
    const sub = buildColumnArithmetic({ a: 503, b: 178, op: '-' }).svg;
    expect(texts(sub, 'result-\\d').reverse().join('')).toBe('325');
    expect(sub).toContain('id="borrow-');
    const mul = buildColumnArithmetic({ a: 47, b: 36, op: '×' }).svg;
    expect(mul).toContain('id="partial-1"');
    expect(texts(mul, 'r-\\d').join('')).toBe('1692');
    const div = buildColumnArithmetic({ a: 7458, b: 6, op: '÷' }).svg;
    expect(texts(div, 'q-\\d').join('')).toBe('1243');
    expect(buildColumnArithmetic({ a: 100, b: 7, op: '÷' }).svg).toContain('r 2');
    expect(buildColumnArithmetic({ a: 5, b: 0, op: '÷' }).warnings[0]).toContain('zero');
  });
});

describe('genetics', () => {
  it('computes monohybrid and dihybrid crosses', () => {
    const m = punnett({ parent1: 'Aa', parent2: 'Aa' });
    expect(m.genotypes).toEqual([{ genotype: 'Aa', count: 2 }, { genotype: 'AA', count: 1 }, { genotype: 'aa', count: 1 }]);
    expect(m.phenotypes.map((p) => p.count)).toEqual([3, 1]);
    const d = punnett({ parent1: 'AaBb', parent2: 'AaBb' });
    expect(d.total).toBe(16);
    expect(d.phenotypes.map((p) => p.count)).toEqual([9, 3, 3, 1]);
    expect(buildPunnett({ parent1: 'Pp', parent2: 'pp', traits: { P: 'purple', p: 'white' } }).svg).toContain('purple: 2/4 (50%)');
    expect(() => punnett({ parent1: 'Ab', parent2: 'Aa' })).toThrow();
  });
});

describe('music', () => {
  it('parses notes and frequencies', () => {
    expect(parseNote('A4').midi).toBe(69);
    expect(parseNote('C4').midi).toBe(60);
    expect(parseNote('F#4').midi).toBe(66);
    expect(parseNote('Bb3').midi).toBe(58);
    expect(noteFrequency(69)).toBe(440);
    expect(parseSequence('C4+E4+G4 F4/h')[0]).toHaveLength(3);
    expect(() => parseNote('H4')).toThrow();
  });

  it('draws notes on the staff at the right height, with ledger lines', () => {
    const n = buildNotation({ notes: 'C4 E4 G4 C5' });
    expect(n.svg).toContain('id="note-3"');
    expect(n.svg).toContain('id="keyboard"');
    // E4 sits on the bottom line (y = top + 8L = 60 + 112 = 172), C4 one ledger below.
    expect(n.svg).toMatch(/id="note-1"><ellipse cx="174" cy="172"/);
    expect(n.svg).toMatch(/id="note-0"><line x1="94" y1="200"/);
  });
});

describe('gloss and simulations', () => {
  it('builds glossed text with readings and translation', () => {
    const g = buildGloss({ words: [{ text: '猫', reading: 'ねこ', gloss: 'cat', pos: 'noun' }, { text: 'が', gloss: 'SUBJ', pos: 'particle' }, { text: '寝る', reading: 'ねる', gloss: 'sleeps', pos: 'verb' }], translation: 'The cat sleeps.' });
    expect(g.svg).toContain('ねこ');
    expect(g.svg).toContain('The cat sleeps.');
    expect(g.svg).toContain('id="legend"');
  });

  it('computes physics correctly', () => {
    const p = simParams('projectile', { speed: 20, angle: 45 });
    expect(simFacts('projectile', p).range).toBeCloseTo((20 * 20) / 9.8, 3);
    expect(simFacts('pendulum', simParams('pendulum', { length: 1 })).period).toBeCloseTo(2.006, 2);
    expect(simParams('projectile', { angle: 200 }).angle).toBe(85); // clamped
    expect(simFrame('pendulum', simParams('pendulum'), 1.2)).toContain('<circle');
    expect(simFrame('wave', simParams('wave', { amplitude2: 0.4 }), 0.5)).toContain('#9333ea');
  });
});
