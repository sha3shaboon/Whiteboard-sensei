import { describe, expect, it } from 'vitest';
import { clozeBlanks, gradeActivity, parseNumber, selectTokens, shuffled, solutionFor, validateActivity, type ActivitySpec } from './index';

const all: ActivitySpec[] = [
  { kind: 'choice', options: ['2', '4', '6'], answer: [1] },
  { kind: 'answer', answers: ['3/4'], numeric: true },
  { kind: 'answer', answers: ['Paris'] },
  { kind: 'order', items: ['egg', 'larva', 'pupa', 'butterfly'] },
  { kind: 'sort', categories: [{ name: 'Mammals', items: ['whale', 'bat'] }, { name: 'Reptiles', items: ['snake'] }] },
  { kind: 'match', pairs: [['H', 'Hydrogen'], ['O', 'Oxygen']] },
  { kind: 'cloze', text: 'Je [[suis]] content, tu [[es|êtes]] là.', bank: ['sommes'] },
  { kind: 'select', text: 'The [quick] fox [jumped] over the dog' },
  { kind: 'number_line', min: 0, max: 1, step: 0.125, answer: 0.375, denominator: 8 },
  { kind: 'fraction_shade', parts: 8, shape: 'bar', numerator: 3, denominator: 4 },
  { kind: 'plot_point', xRange: [-5, 5], yRange: [-5, 5], points: [{ x: 2, y: -3 }] },
  { kind: 'map_click', svg: '<svg/>', vw: 1, vh: 1, answers: ['kenya'], names: { kenya: 'Kenya' } },
  { kind: 'chem_balance', reactants: ['H2', 'O2'], products: ['H2O'] },
  { kind: 'label', svg: '<svg/>', vw: 1, vh: 1, targets: [{ part: 'nucleus', label: 'Nucleus' }] },
];

describe('activities', () => {
  it('reads numbers the way students write them', () => {
    expect(parseNumber('3/4')).toBe(0.75);
    expect(parseNumber('1 1/2')).toBe(1.5);
    expect(parseNumber('75%')).toBe(0.75);
    expect(parseNumber('−2')).toBe(-2);
    expect(parseNumber('2/3 + 1/6')).toBeCloseTo(5 / 6);
    expect(parseNumber('sqrt(2)')).toBeCloseTo(Math.SQRT2);
    expect(parseNumber('banana')).toBeNull();
    expect(parseNumber('2x')).toBeNull();
  });

  it('accepts its own solution for every kind, and validates', () => {
    for (const spec of all) {
      expect(validateActivity(spec), spec.kind).toEqual([]);
      expect(gradeActivity(spec, solutionFor(spec)).correct, spec.kind).toBe(true);
    }
  });

  it('grades wrong answers with useful feedback', () => {
    expect(gradeActivity(all[0]!, [0])).toMatchObject({ correct: false, detail: 'picked A) 2' });
    expect(gradeActivity(all[1]!, '0.75').correct).toBe(true);
    expect(gradeActivity(all[1]!, '6/8').correct).toBe(true);
    expect(gradeActivity(all[1]!, '0.7').correct).toBe(false);
    expect(gradeActivity(all[2]!, ' paris. ').correct).toBe(true);
    expect(gradeActivity(all[3]!, ['egg', 'pupa', 'larva', 'butterfly']).feedback).toBe('2 of 4 in the right place.');
    expect(gradeActivity(all[6]!, ['suis', 'êtes']).correct).toBe(true);
    expect(gradeActivity(all[7]!, [1]).feedback).toBe('Almost: 1 more to find.');
    expect(gradeActivity(all[8]!, 0.5).feedback).toBe('A bit too far right.');
    expect(gradeActivity(all[9]!, [0, 1, 2, 3, 4, 5]).correct).toBe(true); // 6/8 = 3/4
    expect(gradeActivity(all[12]!, [4, 2, 4]).feedback).toBe('Balanced, but use the smallest whole numbers.');
    expect(gradeActivity(all[12]!, [1, 1, 1]).feedback).toContain('Not balanced');
  });

  it('parses cloze and select texts, shuffles deterministically', () => {
    expect(clozeBlanks('a [[b|c]] d [[e]]')).toEqual([['b', 'c'], ['e']]);
    expect(selectTokens('a [b c] d').map((t) => t.correct)).toEqual([false, true, true, false]);
    const items = ['a', 'b', 'c', 'd'];
    expect(shuffled(items, 'x')).toEqual(shuffled(items, 'x'));
    expect(shuffled(items, 'x')).not.toEqual(items);
  });

  it('reports bad specs', () => {
    expect(validateActivity({ kind: 'cloze', text: 'no blanks' })[0]).toContain('[[answer]]');
    expect(validateActivity({ kind: 'fraction_shade', parts: 5, shape: 'bar', numerator: 1, denominator: 2 })[0]).toContain('whole number');
    expect(validateActivity({ kind: 'chem_balance', reactants: ['H2'], products: ['O2'] })[0]).toContain("can't be balanced");
  });
});
