import { describe, expect, it } from 'vitest';
import { arrowPolyline, curveBetween, distToSegment, routeBetween, type Bounds } from './index';

const box = (x: number, y: number, width = 100, height = 50): Bounds => ({ x, y, width, height });

describe('routeBetween', () => {
  it('side by side: straight horizontal arrow with a gap at both ends', () => {
    const r = routeBetween(box(0, 0), box(200, 10));
    expect(r.via).toBeUndefined();
    expect(r.from.y).toBe(r.to.y);
    expect(r.from.x).toBeGreaterThan(100);
    expect(r.to.x).toBeLessThan(200);
  });

  it('stacked: straight vertical arrow', () => {
    const r = routeBetween(box(0, 0), box(20, 150));
    expect(r.from.x).toBe(r.to.x);
    expect(r.from.y).toBeGreaterThan(50);
    expect(r.to.y).toBeLessThan(150);
  });

  it('diagonal: right-angle path that never passes through either box', () => {
    const a = box(0, 0), b = box(300, 200);
    const r = routeBetween(a, b);
    const pts = arrowPolyline(r);
    expect(pts.length).toBe(4);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!, q = pts[i]!;
      expect(p.x === q.x || p.y === q.y).toBe(true); // axis-aligned segments only
      for (const bx of [a, b]) {
        const c = { x: bx.x + bx.width / 2, y: bx.y + bx.height / 2 };
        expect(distToSegment(c, p, q)).toBeGreaterThan(20);
      }
    }
  });
});

describe('curveBetween', () => {
  it('bows away from the cycle center', () => {
    const r = curveBetween(box(0, 0), box(200, 0), { x: 150, y: 300 });
    expect(r.control!.y).toBeLessThan(25); // center is below, so the curve bows upward
  });
});

describe('branchBetween', () => {
  it('leaves the parent from its bottom center and enters the child from the top', async () => {
    const { branchBetween } = await import('./index');
    const parent = box(100, 0), child = box(0, 150);
    const r = branchBetween(parent, child);
    expect(r.from).toMatchObject({ x: 150 });
    expect(r.to).toMatchObject({ x: 50 });
    expect(r.via).toHaveLength(2);
  });
});
