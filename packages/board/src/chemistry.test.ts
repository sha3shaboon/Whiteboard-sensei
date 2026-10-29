import { describe, expect, it } from 'vitest';
import { ELEMENTS, balanceEquation, buildPeriodicTable, checkBalance, electronConfiguration, findElement, parseFormula, prettyFormula } from './index';

describe('chemistry', () => {
  it('parses formulas with groups and hydrates', () => {
    expect(parseFormula('H2O')).toEqual({ H: 2, O: 1 });
    expect(parseFormula('Ca(OH)2')).toEqual({ Ca: 1, O: 2, H: 2 });
    expect(parseFormula('Al2(SO4)3')).toEqual({ Al: 2, S: 3, O: 12 });
    expect(parseFormula('CuSO4·5H2O')).toEqual({ Cu: 1, S: 1, O: 9, H: 10 });
    expect(() => parseFormula('Xq2')).toThrow();
    expect(prettyFormula('C6H12O6')).toBe('C₆H₁₂O₆');
  });

  it('balances equations exactly', () => {
    expect(balanceEquation(['H2', 'O2'], ['H2O'])).toEqual([2, 1, 2]);
    expect(balanceEquation(['CH4', 'O2'], ['CO2', 'H2O'])).toEqual([1, 2, 1, 2]);
    expect(balanceEquation(['C3H8', 'O2'], ['CO2', 'H2O'])).toEqual([1, 5, 3, 4]);
    expect(balanceEquation(['Fe', 'O2'], ['Fe2O3'])).toEqual([4, 3, 2]);
    expect(balanceEquation(['KMnO4', 'HCl'], ['KCl', 'MnCl2', 'H2O', 'Cl2'])).toEqual([2, 16, 2, 2, 8, 5]);
    expect(checkBalance(['H2', 'O2'], ['H2O'], [2, 1, 2]).balanced).toBe(true);
    expect(checkBalance(['H2', 'O2'], ['H2O'], [1, 1, 1]).balanced).toBe(false);
  });

  it('has the real periodic table', () => {
    expect(ELEMENTS).toHaveLength(118);
    expect(findElement('Fe')).toMatchObject({ z: 26, group: 8, period: 4, category: 'transition' });
    expect(findElement('gold')).toMatchObject({ symbol: 'Au', z: 79, group: 11, period: 6 });
    expect(findElement('Hf')).toMatchObject({ z: 72, group: 4, period: 6 });
    expect(findElement('La')).toMatchObject({ group: null, category: 'lanthanide' });
    expect(findElement('Og')).toMatchObject({ z: 118, group: 18, period: 7 });
    expect(findElement('Cl')).toMatchObject({ group: 17, period: 3, category: 'halogen' });
    expect(findElement('aluminum')?.symbol).toBe('Al');
  });

  it('gives electron configurations, including the exceptions', () => {
    expect(electronConfiguration(26)).toBe('[Ar] 3d⁶ 4s²');
    expect(electronConfiguration(8)).toBe('[He] 2s² 2p⁴');
    expect(electronConfiguration(24)).toBe('[Ar] 3d⁵ 4s¹');
    expect(electronConfiguration(29)).toBe('[Ar] 3d¹⁰ 4s¹');
    expect(electronConfiguration(1)).toBe('1s¹');
    expect(electronConfiguration(53)).toBe('[Kr] 4d¹⁰ 5s² 5p⁵');
    expect(electronConfiguration(82)).toBe('[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p²');
  });

  it('draws the table with highlights and a focus card', () => {
    const t = buildPeriodicTable({ group: 17, focus: 'Cl' });
    expect(t.svg).toContain('id="el-F"');
    expect(t.svg).toContain('id="focus-Cl"');
    expect(t.svg).toContain('Chlorine');
    expect(buildPeriodicTable({ highlight: ['Zz'] }).warnings[0]).toContain('Zz');
  });
});
