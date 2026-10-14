import { describe, expect, it } from 'vitest';
import { intersects, layoutDiagram, type DiagramLayout } from './index';

const nodes = ['a', 'b', 'c', 'd', 'e'].map((key) => ({ key, size: { width: 120, height: 50 } }));
const edges = [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' }, { from: 'c', to: 'e' }];

describe('layoutDiagram', () => {
  for (const layout of ['flow-right', 'flow-down', 'tree', 'cycle', 'hub'] as DiagramLayout[]) {
    it(`${layout}: places every node, without overlaps, starting at (0,0)`, () => {
      const pos = layoutDiagram(nodes, edges, layout);
      expect(pos.size).toBe(5);
      const boxes = nodes.map((n) => ({ ...pos.get(n.key)!, ...n.size }));
      expect(Math.min(...boxes.map((b) => b.x))).toBeCloseTo(0);
      expect(Math.min(...boxes.map((b) => b.y))).toBeCloseTo(0);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(intersects(boxes[i]!, boxes[j]!)).toBe(false);
    });
  }

  it('tree puts children on lower rows than parents', () => {
    const pos = layoutDiagram(nodes, edges, 'tree');
    expect(pos.get('b')!.y).toBeGreaterThan(pos.get('a')!.y);
    expect(pos.get('d')!.y).toBeGreaterThan(pos.get('b')!.y);
    expect(pos.get('b')!.y).toBe(pos.get('c')!.y);
  });

  it('hub puts the first node in the middle', () => {
    const pos = layoutDiagram(nodes, edges, 'hub');
    const xs = nodes.slice(1).map((n) => pos.get(n.key)!.x);
    expect(pos.get('a')!.x).toBeGreaterThan(Math.min(...xs));
    expect(pos.get('a')!.x).toBeLessThan(Math.max(...xs));
  });
});
