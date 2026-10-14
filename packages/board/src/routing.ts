// Arrow routing: clean, readable connectors between boxes.
// Side-by-side boxes get a straight horizontal arrow, stacked boxes a straight vertical one,
// diagonal pairs a right-angle (elbow) path through the gap between them, and cycles a curved arc.
// Arrows stop a small gap short of each box so heads never touch borders.

import type { ArrowElement, Bounds, Point } from './elements';
import { arrowPolyline, boundsOfPoints, center } from './geometry';

export type ArrowPath = Pick<ArrowElement['content'], 'from' | 'to' | 'via' | 'control'>;

const GAP = 6;

export function routeBetween(a: Bounds, b: Bounds, gap = GAP): ArrowPath {
  const aR = a.x + a.width, aB = a.y + a.height, bR = b.x + b.width, bB = b.y + b.height;
  const yOverlap = Math.min(aB, bB) - Math.max(a.y, b.y);
  const xOverlap = Math.min(aR, bR) - Math.max(a.x, b.x);
  const ac = center(a), bc = center(b);

  if (yOverlap > 0 && xOverlap <= 0) {
    // Side by side: straight across, at the middle of the shared height.
    const y = (Math.max(a.y, b.y) + Math.min(aB, bB)) / 2;
    const right = bc.x > ac.x;
    return { from: { x: right ? aR + gap : a.x - gap, y }, to: { x: right ? b.x - gap : bR + gap, y } };
  }
  if (xOverlap > 0 && yOverlap <= 0) {
    // Stacked: straight up/down, at the middle of the shared width.
    const x = (Math.max(a.x, b.x) + Math.min(aR, bR)) / 2;
    const down = bc.y > ac.y;
    return { from: { x, y: down ? aB + gap : a.y - gap }, to: { x, y: down ? b.y - gap : bB + gap } };
  }
  if (xOverlap > 0 && yOverlap > 0) {
    // Overlapping boxes (rare): short straight arrow between the centers' edge points.
    return { from: edgePoint(a, bc, gap), to: edgePoint(b, ac, gap) };
  }
  // Diagonal: elbow through whichever gap between the boxes is wider.
  const hGap = Math.max(b.x - aR, a.x - bR);
  const vGap = Math.max(b.y - aB, a.y - bB);
  if (vGap >= hGap * 0.6) {
    const down = bc.y > ac.y;
    const from = { x: ac.x, y: down ? aB + gap : a.y - gap };
    const to = { x: bc.x, y: down ? b.y - gap : bB + gap };
    const midY = (from.y + to.y) / 2;
    return { from, to, via: [{ x: from.x, y: midY }, { x: to.x, y: midY }] };
  }
  const right = bc.x > ac.x;
  const from = { x: right ? aR + gap : a.x - gap, y: ac.y };
  const to = { x: right ? b.x - gap : bR + gap, y: bc.y };
  const midX = (from.x + to.x) / 2;
  return { from, to, via: [{ x: midX, y: from.y }, { x: midX, y: to.y }] };
}

/** Tree branch: from the parent's bottom center down to the child's top center, with one elbow. */
export function branchBetween(parent: Bounds, child: Bounds, gap = GAP): ArrowPath {
  const pc = center(parent), cc = center(child);
  const pB = parent.y + parent.height;
  if (child.y <= pB) return routeBetween(parent, child, gap); // not below: fall back
  const from = { x: pc.x, y: pB + gap };
  const to = { x: cc.x, y: child.y - gap };
  if (Math.abs(from.x - to.x) < 2) return { from, to: { x: from.x, y: to.y } };
  const midY = (pB + child.y) / 2;
  return { from, to, via: [{ x: from.x, y: midY }, { x: to.x, y: midY }] };
}

/** Curved arc from a to b, bowing away from `pivot` (the center of a cycle diagram). */
export function curveBetween(a: Bounds, b: Bounds, pivot: Point, gap = GAP): ArrowPath {
  const from = edgePoint(a, center(b), gap);
  const to = edgePoint(b, center(a), gap);
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  let nx = mid.x - pivot.x, ny = mid.y - pivot.y;
  const n = Math.hypot(nx, ny) || 1;
  nx /= n;
  ny /= n;
  return { from, to, control: { x: mid.x + nx * len * 0.22, y: mid.y + ny * len * 0.22 } };
}

/** Straight arrow between box edges along the line joining their centers (hub spokes). */
export function straightBetween(a: Bounds, b: Bounds, gap = GAP): ArrowPath {
  return { from: edgePoint(a, center(b), gap), to: edgePoint(b, center(a), gap) };
}

export function arrowBounds(p: ArrowPath, pad = 10): Bounds {
  return boundsOfPoints(arrowPolyline(p), pad);
}

/** Where the line from the box's center toward `toward` leaves the box, pushed out by `gap`. */
export function edgePoint(b: Bounds, toward: Point, gap = 0): Point {
  const c = center(b);
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx !== 0 ? b.width / 2 / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? b.height / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  const len = Math.hypot(dx, dy);
  return { x: c.x + dx * s + (dx / len) * gap, y: c.y + dy * s + (dy / len) * gap };
}
