import { describe, expect, it } from 'vitest';
import { applyStructureOp, createStructure, describeStructure, intersects, layoutStructure, structureSize, type StructureContent } from './index';

const ok = (r: ReturnType<typeof applyStructureOp>): StructureContent => {
  if (!r.ok) throw new Error(r.error);
  return r.content;
};

describe('structure operations', () => {
  it('enqueue adds at the rear and dequeue removes the front, keeping item identity', () => {
    let q = createStructure('queue', ['A'], '#00f');
    const aKey = q.items[0]!.key;
    q = ok(applyStructureOp(q, { op: 'enqueue', value: 'B' }));
    expect(describeStructure(q)).toBe('queue [A, B] (front = A, rear = B)');
    expect(q.items[0]!.key).toBe(aKey); // A is the same item, so it doesn't re-animate
    const r = applyStructureOp(q, { op: 'dequeue' });
    expect(r.ok && r.removed).toBe('A');
    expect(describeStructure(ok(r))).toBe('queue [B] (front = B, rear = B)');
  });

  it('stack push/pop works from the top and errors when empty', () => {
    let s = createStructure('stack', [], '#00f');
    s = ok(applyStructureOp(s, { op: 'push', value: '1' }));
    s = ok(applyStructureOp(s, { op: 'push', value: '2' }));
    expect(describeStructure(s)).toContain('top = 2');
    const popped = applyStructureOp(s, { op: 'pop' });
    expect(popped.ok && popped.removed).toBe('2');
    expect(applyStructureOp(createStructure('stack', [], '#00f'), { op: 'pop' })).toEqual({ ok: false, error: 'The stack is empty' });
  });

  it('array insert/remove/set/highlight validate indexes', () => {
    let a = createStructure('array', ['x', 'y'], '#00f');
    a = ok(applyStructureOp(a, { op: 'insert', index: 1, value: 'z' }));
    expect(a.items.map((i) => i.value)).toEqual(['x', 'z', 'y']);
    a = ok(applyStructureOp(a, { op: 'set', index: 0, value: 'w' }));
    a = ok(applyStructureOp(a, { op: 'highlight', index: 2 }));
    expect(describeStructure(a)).toBe('array [w, z, *y*]');
    expect(applyStructureOp(a, { op: 'remove', index: 5 }).ok).toBe(false);
  });

  it('grows capacity so the bounds keep up', () => {
    let q = createStructure('queue', [], '#00f');
    for (let i = 0; i < 10; i++) q = ok(applyStructureOp(q, { op: 'enqueue', value: String(i) }));
    expect(q.capacity).toBeGreaterThanOrEqual(11);
  });
});

describe('structure layout', () => {
  it('lays queue cells left to right inside the bounds, with front/rear pointers', () => {
    const q = createStructure('queue', ['A', 'B', 'C'], '#00f', 'Queue');
    const b = { x: 0, y: 0, ...structureSize(q) };
    const l = layoutStructure(q, b);
    const rects = q.items.map((it) => l.cells.get(it.key)!);
    expect(rects[1]!.x).toBeGreaterThan(rects[0]!.x);
    for (const r of rects) expect(r.x + r.width).toBeLessThanOrEqual(b.width);
    expect(l.pointers.map((p) => p.name)).toEqual(['front', 'rear']);
  });

  it('stacks bottom-up without overlaps', () => {
    const s = createStructure('stack', ['1', '2', '3'], '#00f');
    const l = layoutStructure(s, { x: 0, y: 0, ...structureSize(s) });
    const rects = s.items.map((it) => l.cells.get(it.key)!);
    expect(rects[1]!.y).toBeLessThan(rects[0]!.y);
    expect(intersects(rects[0]!, rects[1]!, -1)).toBe(false);
  });
});
