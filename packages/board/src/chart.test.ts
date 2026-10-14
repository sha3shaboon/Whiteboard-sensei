import { describe, expect, it } from 'vitest';
import { buildChart, formatNumber, niceTicks } from './index';

const num = (s: string, attr: string) => Number(new RegExp(`${attr}="([-\\d.]+)"`).exec(s)![1]);

describe('charts', () => {
  it('picks round ticks', () => {
    expect(niceTicks(0, 87).ticks).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(0, 1).step).toBe(0.2);
    expect(niceTicks(-30, 40).ticks[0]).toBe(-40);
    expect(formatNumber(1200)).toBe('1,200');
    expect(formatNumber(2_500_000)).toBe('2.5M');
  });

  it('draws bars to scale', () => {
    const c = buildChart({ type: 'bar', labels: ['A', 'B', 'C'], series: [{ values: [10, 20, 40] }] });
    expect(c.warnings).toEqual([]);
    const h = (k: number) => num(new RegExp(`id="bar-0-${k}"><rect[^>]*>`).exec(c.svg)![0], 'height');
    expect(h(1) / h(0)).toBeCloseTo(2, 1);
    expect(h(2) / h(0)).toBeCloseTo(4, 1);
  });

  it('draws grouped bars with a legend and line charts per segment', () => {
    const c = buildChart({ type: 'bar', labels: ['2020', '2021'], series: [{ name: 'Wheat', values: [5, 6] }, { name: 'Rice', values: [4, 7] }] });
    expect(c.svg).toContain('id="bar-1-1"');
    expect(c.svg).toContain('Wheat');
    const l = buildChart({ type: 'line', labels: ['Jan', 'Feb', 'Mar'], series: [{ values: [1, 3, 2] }] });
    expect(l.svg).toContain('id="line-0-1"');
    expect(l.svg).toContain('id="line-0-2"');
    expect(l.svg).toContain('id="point-0-2"');
  });

  it('draws pie slices with percentages that add up', () => {
    const c = buildChart({ type: 'pie', labels: ['N₂', 'O₂', 'Ar'], series: [{ values: [78, 21, 1] }] });
    expect(c.svg).toContain('78%');
    expect(c.svg).toContain('21%');
    expect(c.svg).toContain('1%');
    expect((c.svg.match(/id="slice-/g) ?? []).length).toBe(3);
  });

  it('reports mismatched data', () => {
    expect(buildChart({ type: 'bar', labels: ['A', 'B'], series: [{ values: [1] }] }).warnings.length).toBe(1);
    expect(buildChart({ type: 'bar', labels: [], series: [] }).svg).toBe('');
  });
});
