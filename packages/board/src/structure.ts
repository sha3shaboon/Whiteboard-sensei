// Data-structure visualizations (queue, stack, array, linked list) that change over time.
// The AI draws a structure once and then applies operations to it; each item keeps a stable key so
// the view can animate it from its old position to its new one (see view/structure.ts).

import type { Bounds } from './elements';

export type StructureKind = 'queue' | 'stack' | 'array' | 'linkedlist';

export interface StructureItem {
  /** Stable identity across operations (drives the animation). */
  key: string;
  value: string;
  highlight?: boolean;
}

export interface StructureContent {
  kind: StructureKind;
  items: StructureItem[];
  nextKey: number;
  /** Slots reserved in the bounds so the structure can grow without overlapping neighbors. */
  capacity: number;
  title?: string;
  color: string;
}

export type StructureOp =
  | { op: 'enqueue' | 'push' | 'append'; value: string }
  | { op: 'dequeue' | 'pop' }
  | { op: 'insert'; index: number; value: string }
  | { op: 'remove'; index: number }
  | { op: 'set'; index: number; value: string }
  | { op: 'highlight'; index: number }
  | { op: 'clear_highlight' };

export type OpResult = { ok: true; content: StructureContent; removed?: string } | { ok: false; error: string };

export function createStructure(kind: StructureKind, values: string[], color: string, title?: string, capacity?: number): StructureContent {
  return {
    kind,
    items: values.map((value, i) => ({ key: `k${i}`, value })),
    nextKey: values.length,
    capacity: Math.max(capacity ?? 0, values.length + 3, kind === 'stack' ? 5 : 6),
    title,
    color,
  };
}

/** Applies one operation, returning new content (the input is not mutated). */
export function applyStructureOp(c: StructureContent, o: StructureOp): OpResult {
  const items = c.items.map((it) => ({ ...it }));
  const make = (value: string): StructureItem => ({ key: `k${c.nextKey}`, value });
  const done = (next: StructureItem[], removed?: string, used = 0): OpResult => ({
    ok: true,
    removed,
    content: { ...c, items: next, nextKey: c.nextKey + used, capacity: Math.max(c.capacity, next.length + 1) },
  });
  const inRange = (i: number, max = items.length - 1) => Number.isInteger(i) && i >= 0 && i <= max;

  switch (o.op) {
    case 'enqueue':
    case 'push':
    case 'append':
      return done([...items, make(o.value)], undefined, 1);
    case 'dequeue': {
      if (!items.length) return { ok: false, error: 'The queue is empty' };
      const [first, ...rest] = items;
      return done(rest, first!.value);
    }
    case 'pop': {
      if (!items.length) return { ok: false, error: 'The stack is empty' };
      const last = items.pop()!;
      return done(items, last.value);
    }
    case 'insert':
      if (!inRange(o.index, items.length)) return { ok: false, error: `index must be between 0 and ${items.length}` };
      items.splice(o.index, 0, make(o.value));
      return done(items, undefined, 1);
    case 'remove': {
      if (!inRange(o.index)) return { ok: false, error: `index must be between 0 and ${items.length - 1}` };
      const [gone] = items.splice(o.index, 1);
      return done(items, gone!.value);
    }
    case 'set':
      if (!inRange(o.index)) return { ok: false, error: `index must be between 0 and ${items.length - 1}` };
      items[o.index]!.value = o.value;
      return done(items);
    case 'highlight':
      if (!inRange(o.index)) return { ok: false, error: `index must be between 0 and ${items.length - 1}` };
      items[o.index]!.highlight = true;
      return done(items);
    case 'clear_highlight':
      return done(items.map((it) => ({ ...it, highlight: false })));
  }
}

/** "[A, B, C]" plus where the pointers are, for the AI. */
export function describeStructure(c: StructureContent): string {
  const vals = c.items.map((it) => (it.highlight ? `*${it.value}*` : it.value));
  const list = `[${vals.join(', ')}]`;
  if (!c.items.length) return `${c.kind} (empty)`;
  switch (c.kind) {
    case 'queue':
      return `queue ${list} (front = ${c.items[0]!.value}, rear = ${c.items.at(-1)!.value})`;
    case 'stack':
      return `stack ${list} (bottom to top; top = ${c.items.at(-1)!.value})`;
    case 'linkedlist':
      return `linked list ${c.items.map((it) => it.value).join(' -> ')} -> null`;
    default:
      return `array ${list}`;
  }
}

// ---------- geometry (shared by sizing and drawing) ----------

export const CELL_H = 48;
const LIST_GAP = 46;
const PAD = 8;

const hasPointersAbove = (k: StructureKind) => k === 'queue' || k === 'linkedlist';

export function cellWidth(c: StructureContent): number {
  const longest = Math.max(1, ...c.items.map((it) => it.value.length));
  return Math.min(150, Math.max(56, longest * 10 + 26)) + (c.kind === 'linkedlist' ? 22 : 0);
}

function titleH(c: StructureContent) {
  return c.title ? 30 : 0;
}

export function structureSize(c: StructureContent): { width: number; height: number } {
  const cw = cellWidth(c);
  if (c.kind === 'stack') return { width: PAD * 2 + cw + 90, height: titleH(c) + PAD * 2 + c.capacity * CELL_H + 8 };
  const gap = c.kind === 'linkedlist' ? LIST_GAP : 0;
  const n = c.capacity;
  const extra = c.kind === 'linkedlist' ? LIST_GAP + 40 : 0; // room for the trailing "null"
  return {
    width: PAD * 2 + n * cw + (n - 1) * gap + extra,
    height: titleH(c) + (hasPointersAbove(c.kind) ? 38 : 0) + CELL_H + (c.kind === 'array' ? 24 : 0) + PAD * 2,
  };
}

export interface StructureLayout {
  cells: Map<string, Bounds>;
  /** Pointer labels (front, rear, top, head) and the point they aim at. */
  pointers: { name: string; x: number; y: number; side: 'above' | 'right' }[];
  /** Where an empty structure shows its placeholder slot. */
  empty: Bounds;
  cw: number;
  gap: number;
}

export function layoutStructure(c: StructureContent, b: Bounds): StructureLayout {
  const cw = cellWidth(c);
  const cells = new Map<string, Bounds>();
  const pointers: StructureLayout['pointers'] = [];
  const top = b.y + titleH(c) + PAD;
  if (c.kind === 'stack') {
    const bottom = b.y + b.height - PAD - 8;
    c.items.forEach((it, i) => cells.set(it.key, { x: b.x + PAD, y: bottom - (i + 1) * CELL_H, width: cw, height: CELL_H }));
    const last = c.items.at(-1);
    if (last) {
      const r = cells.get(last.key)!;
      pointers.push({ name: 'top', x: r.x + r.width, y: r.y + CELL_H / 2, side: 'right' });
    }
    return { cells, pointers, empty: { x: b.x + PAD, y: bottom - CELL_H, width: cw, height: CELL_H }, cw, gap: 0 };
  }
  const gap = c.kind === 'linkedlist' ? LIST_GAP : 0;
  const y = top + (hasPointersAbove(c.kind) ? 38 : 0);
  c.items.forEach((it, i) => cells.set(it.key, { x: b.x + PAD + i * (cw + gap), y, width: cw, height: CELL_H }));
  const first = c.items[0], last = c.items.at(-1);
  const aim = (key: string) => {
    const r = cells.get(key)!;
    return { x: r.x + r.width / 2, y: r.y };
  };
  if (c.kind === 'queue' && first && last) {
    if (first.key === last.key) pointers.push({ name: 'front, rear', ...aim(first.key), side: 'above' });
    else pointers.push({ name: 'front', ...aim(first.key), side: 'above' }, { name: 'rear', ...aim(last.key), side: 'above' });
  }
  if (c.kind === 'linkedlist' && first) pointers.push({ name: 'head', ...aim(first.key), side: 'above' });
  return { cells, pointers, empty: { x: b.x + PAD, y, width: cw, height: CELL_H }, cw, gap };
}

/** Where a new item flies in from / an old one flies out to, given its resting cell. */
export function enterFrom(kind: StructureKind, r: Bounds): Bounds {
  if (kind === 'queue') return { ...r, x: r.x + r.width * 1.6 };
  if (kind === 'stack') return { ...r, y: r.y - CELL_H * 1.6 };
  return { ...r, y: r.y - CELL_H * 1.3 };
}

export function exitTo(kind: StructureKind, r: Bounds): Bounds {
  if (kind === 'queue') return { ...r, x: r.x - r.width * 1.6 };
  if (kind === 'stack') return { ...r, y: r.y - CELL_H * 1.6 };
  return { ...r, y: r.y + CELL_H * 1.3 };
}
