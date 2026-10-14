// Auto-layout for AI diagrams: nodes + edges -> positions, so the AI never deals with coordinates.

import type { Size } from './layout';

export type DiagramLayout = 'flow-right' | 'flow-down' | 'tree' | 'cycle' | 'hub';

export interface DiagramNodeIn {
  key: string;
  size: Size;
}

export interface DiagramEdgeIn {
  from: string;
  to: string;
}

/** Top-left position of each node, relative to the diagram's top-left corner (0,0). */
export function layoutDiagram(
  nodes: DiagramNodeIn[],
  edges: DiagramEdgeIn[],
  layout: DiagramLayout,
  /** Extra room between boxes, e.g. for arrow labels. */
  opts: { hGap?: number; vGap?: number } = {},
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (!nodes.length) return out;
  const H_GAP = Math.max(72, opts.hGap ?? 0), V_GAP = Math.max(56, opts.vGap ?? 0);
  const maxW = Math.max(...nodes.map((n) => n.size.width));
  const maxH = Math.max(...nodes.map((n) => n.size.height));

  if (layout === 'flow-right') {
    // Even gaps between boxes; long flows wrap into rows of 4 so they stay readable.
    let x = 0;
    nodes.forEach((n, i) => {
      if (i % 4 === 0) x = 0;
      const row = Math.floor(i / 4);
      out.set(n.key, { x, y: row * (maxH + V_GAP) + (maxH - n.size.height) / 2 });
      x += n.size.width + H_GAP;
    });
  } else if (layout === 'flow-down') {
    let y = 0;
    for (const n of nodes) {
      out.set(n.key, { x: (maxW - n.size.width) / 2, y });
      y += n.size.height + V_GAP * 0.75;
    }
  } else if (layout === 'tree') {
    const level = treeLevels(nodes, edges);
    const rows = new Map<number, DiagramNodeIn[]>();
    for (const n of nodes) {
      const l = level.get(n.key) ?? 0;
      rows.set(l, [...(rows.get(l) ?? []), n]);
    }
    const widest = Math.max(...[...rows.values()].map((r) => r.length));
    const totalW = widest * maxW + (widest - 1) * H_GAP * 0.6;
    for (const [l, row] of rows) {
      const rowW = row.length * maxW + (row.length - 1) * H_GAP * 0.6;
      row.forEach((n, i) => {
        out.set(n.key, { x: (totalW - rowW) / 2 + i * (maxW + H_GAP * 0.6) + (maxW - n.size.width) / 2, y: l * (maxH + V_GAP) });
      });
    }
  } else {
    // cycle: all on an ellipse; hub: first node in the middle, the rest around it.
    const ring = layout === 'hub' ? nodes.slice(1) : nodes;
    const count = Math.max(ring.length, 1);
    const rx = Math.max(maxW * 1.1, (count * (maxW + 40)) / (2 * Math.PI));
    const ry = Math.max(maxH * 1.8, rx * 0.6);
    const cx = rx + maxW / 2, cy = ry + maxH / 2;
    ring.forEach((n, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / count;
      out.set(n.key, { x: cx + rx * Math.cos(a) - n.size.width / 2, y: cy + ry * Math.sin(a) - n.size.height / 2 });
    });
    if (layout === 'hub') {
      const hub = nodes[0]!;
      out.set(hub.key, { x: cx - hub.size.width / 2, y: cy - hub.size.height / 2 });
    }
  }

  // Normalize so the top-left of the whole diagram is (0,0).
  let minX = Infinity, minY = Infinity;
  for (const p of out.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
  }
  for (const [k, p] of out) out.set(k, { x: p.x - minX, y: p.y - minY });
  return out;
}

/** Depth of each node from the roots (nodes nothing points to); cycles are broken by visit order. */
function treeLevels(nodes: DiagramNodeIn[], edges: DiagramEdgeIn[]): Map<string, number> {
  const keys = new Set(nodes.map((n) => n.key));
  const hasParent = new Set(edges.filter((e) => keys.has(e.from)).map((e) => e.to));
  const roots = nodes.filter((n) => !hasParent.has(n.key)).map((n) => n.key);
  const level = new Map<string, number>();
  const q: [string, number][] = (roots.length ? roots : [nodes[0]!.key]).map((k) => [k, 0]);
  while (q.length) {
    const [k, l] = q.shift()!;
    if (level.has(k)) continue;
    level.set(k, l);
    for (const e of edges) if (e.from === k && keys.has(e.to) && !level.has(e.to)) q.push([e.to, l + 1]);
  }
  for (const n of nodes) if (!level.has(n.key)) level.set(n.key, 0);
  return level;
}
