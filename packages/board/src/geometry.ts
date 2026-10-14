import type { ArrowElement, BoardElement, Bounds, Point, Region, StrokePoint } from './elements';

export function boundsOfPoints(points: Point[], pad = 0): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
}

export function union(list: Bounds[]): Bounds | null {
  if (!list.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of list) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function intersects(a: Bounds, b: Bounds, margin = 0): boolean {
  return (
    a.x < b.x + b.width + margin &&
    b.x < a.x + a.width + margin &&
    a.y < b.y + b.height + margin &&
    b.y < a.y + a.height + margin
  );
}

export function containsPoint(b: Bounds, p: Point, tolerance = 0): boolean {
  return p.x >= b.x - tolerance && p.x <= b.x + b.width + tolerance && p.y >= b.y - tolerance && p.y <= b.y + b.height + tolerance;
}

export function center(b: Bounds): Point {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Distance between two boxes (0 when they overlap). */
export function boundsDistance(a: Bounds, b: Bounds): number {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
  return Math.hypot(dx, dy);
}

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function nearPolyline(points: StrokePoint[] | Point[], p: Point, tolerance: number): boolean {
  if (points.length === 1) return distance(points[0]!, p) <= tolerance;
  for (let i = 1; i < points.length; i++) if (distToSegment(p, points[i - 1]!, points[i]!) <= tolerance) return true;
  return false;
}

/** Absolute box of a region given as fractions of a target's bounds. */
export function regionBounds(target: Bounds, r: Region): Bounds {
  const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1);
  const y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
  return {
    x: target.x + target.width * x0,
    y: target.y + target.height * y0,
    width: target.width * (x1 - x0),
    height: target.height * (y1 - y0),
  };
}

/** The arrow as a polyline (curves sampled), for hit-testing, bounds and partial drawing. */
export function arrowPolyline(p: Pick<ArrowElement['content'], 'from' | 'to' | 'via' | 'control'>): Point[] {
  if (p.control) {
    const c = p.control;
    return Array.from({ length: 21 }, (_, i) => {
      const t = i / 20, u = 1 - t;
      return { x: u * u * p.from.x + 2 * u * t * c.x + t * t * p.to.x, y: u * u * p.from.y + 2 * u * t * c.y + t * t * p.to.y };
    });
  }
  return [p.from, ...(p.via ?? []), p.to];
}

/** End points of a line stored as positive bounds plus a direction flag. */
export function lineEnds(b: Bounds, flip?: boolean): [Point, Point] {
  return flip
    ? [{ x: b.x, y: b.y + b.height }, { x: b.x + b.width, y: b.y }]
    : [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y + b.height }];
}

/** Whether point p (world coords) hits the element, within tolerance. */
export function hitTest(el: BoardElement, p: Point, tolerance = 6): boolean {
  if (!containsPoint(el.bounds, p, tolerance + 4)) return false;
  switch (el.type) {
    case 'stroke':
      return nearPolyline(el.content.points, p, tolerance + el.content.width / 2);
    case 'arrow':
      return nearPolyline(arrowPolyline(el.content), p, tolerance + 2);
    case 'shape': {
      const b = el.bounds;
      if (el.content.shape === 'line') {
        const [a, c] = lineEnds(b, el.content.flip);
        return distToSegment(p, a, c) <= tolerance + 2;
      }
      // Outline-only shapes: hit near the edge, not the empty middle.
      const inner = { x: b.x + tolerance + 4, y: b.y + tolerance + 4, width: b.width - 2 * (tolerance + 4), height: b.height - 2 * (tolerance + 4) };
      return inner.width <= 0 || inner.height <= 0 || !containsPoint(inner, p);
    }
    default:
      return true;
  }
}

/** Topmost element at p, ignoring annotations. */
export function elementAt(elements: BoardElement[], p: Point, tolerance = 6): BoardElement | undefined {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]!;
    if (el.type !== 'annotation' && hitTest(el, p, tolerance)) return el;
  }
  return undefined;
}
