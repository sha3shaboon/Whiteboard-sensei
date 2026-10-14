import { describe, expect, it } from 'vitest';
import { buildFigure, resolvePoints } from './index';

const attr = (svg: string, id: string, name: string) => Number(new RegExp(`id="${id}"[^>]*?\\s${name}="([-\\d.]+)"`).exec(svg)?.[1]);
const pt = (svg: string, n: string) => ({ x: attr(svg, `point-${n}`, 'cx'), y: attr(svg, `point-${n}`, 'cy') });
const label = (svg: string, id: string) => ({ x: attr(svg, id, 'x'), y: attr(svg, id, 'y') - 5 });

/** Point-in-triangle by barycentric signs. */
function inside(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  const s = (p1: typeof p, p2: typeof p, p3: typeof p) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

const tri = {
  points: [{ name: 'A', x: 0, y: 0 }, { name: 'B', x: 6, y: 0 }, { name: 'C', x: 1.5, y: 4 }],
  polygons: ['ABC'],
  angles: [
    { at: 'A', from: 'B', to: 'C', label: 'α' },
    { at: 'B', from: 'A', to: 'C', label: 'β' },
    { at: 'C', from: 'A', to: 'B', label: 'γ' },
  ],
  sides: [{ from: 'A', to: 'B', label: 'c' }, { from: 'B', to: 'C', label: 'a' }, { from: 'C', to: 'A', label: 'b' }],
};

describe('buildFigure', () => {
  it('puts every angle label inside the triangle, near its own vertex', () => {
    const { svg, warnings } = buildFigure(tri);
    expect(warnings).toEqual([]);
    const A = pt(svg, 'A'), B = pt(svg, 'B'), C = pt(svg, 'C');
    for (const [v, P] of [['A', A], ['B', B], ['C', C]] as const) {
      const l = label(svg, `angle-label-${v}`);
      expect(inside(l, A, B, C)).toBe(true);
      // closer to its own vertex than to the others
      const d = (q: { x: number; y: number }) => Math.hypot(q.x - l.x, q.y - l.y);
      expect(d(P)).toBeLessThan(Math.min(...[A, B, C].filter((q) => q !== P).map(d)));
    }
  });

  it('puts side labels outside the triangle', () => {
    const { svg } = buildFigure(tri);
    const A = pt(svg, 'A'), B = pt(svg, 'B'), C = pt(svg, 'C');
    for (const id of ['side-AB', 'side-BC', 'side-CA']) expect(inside(label(svg, id), A, B, C)).toBe(false);
  });

  it('draws a right-angle square instead of an arc', () => {
    const { svg } = buildFigure({ points: [{ name: 'A', x: 0, y: 0 }, { name: 'B', x: 4, y: 0 }, { name: 'C', x: 0, y: 3 }], segments: ['AB', 'BC', 'CA'], angles: [{ at: 'A', from: 'B', to: 'C', right: true }] });
    expect(svg).toMatch(/id="angle-A" d="M[^"]*L[^"]*L/);
    expect(svg).not.toMatch(/id="angle-A" d="[^"]*A/);
  });

  it('builds a triangle from side lengths, and altitude feet / midpoints', () => {
    const pts = resolvePoints({ triangle_sss: { names: ['A', 'B', 'C'], sides: [5, 4, 3] }, feet: [{ name: 'H', from: 'C', to: ['A', 'B'] }], midpoints: [{ name: 'M', of: ['A', 'B'] }] });
    const A = pts.get('A')!, B = pts.get('B')!, C = pts.get('C')!;
    expect(Math.hypot(B.x - C.x, B.y - C.y)).toBeCloseTo(5);
    expect(Math.hypot(C.x - A.x, C.y - A.y)).toBeCloseTo(4);
    expect(Math.hypot(A.x - B.x, A.y - B.y)).toBeCloseTo(3);
    expect(pts.get('H')!.y).toBeCloseTo(0);
    expect(pts.get('H')!.x).toBeCloseTo(C.x);
    expect(pts.get('M')).toEqual({ x: 1.5, y: 0 });
  });

  it('reports impossible triangles and unknown points instead of drawing nonsense', () => {
    expect(buildFigure({ triangle_sss: { names: ['A', 'B', 'C'], sides: [1, 2, 10] } }).warnings[0]).toMatch(/do not form a triangle/);
    expect(buildFigure({ points: [{ name: 'A', x: 0, y: 0 }], segments: ['AZ'] }).warnings).toContain('unknown point Z');
  });
});
