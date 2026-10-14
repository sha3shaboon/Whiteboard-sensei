// Canvas drawing for ink-like elements. Text, math and code are DOM nodes (see overlay.ts).

import type { AnnotationElement, ArrowElement, BoardElement, Bounds, GraphElement, Point, ShapeElement, StrokeElement, StrokePoint } from '../elements';
import { compileExpression } from '../expression';
import { lineEnds, regionBounds } from '../geometry';

export const DOM_TYPES = new Set(['text', 'math', 'code']);

export function strokeWidthAt(base: number, pressure: number): number {
  return base * (0.4 + pressure * 1.2);
}

/** Smooth variable-width stroke: quadratic curves through segment midpoints. */
export function drawStrokePoints(ctx: CanvasRenderingContext2D, points: StrokePoint[], color: string, width: number, highlighter = false): void {
  ctx.save();
  ctx.lineCap = highlighter ? 'square' : 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  if (points.length === 1) {
    const p = points[0]!;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, strokeWidthAt(width, p.pressure) / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (highlighter) {
    // Constant width, one path, so overlapping segments don't darken.
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  } else {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!;
      const prev = i > 1 ? points[i - 2]! : a;
      ctx.lineWidth = strokeWidthAt(width, (a.pressure + b.pressure) / 2);
      ctx.beginPath();
      ctx.moveTo((prev.x + a.x) / 2, (prev.y + a.y) / 2);
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
      if (i === points.length - 1) ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawStroke(ctx: CanvasRenderingContext2D, el: StrokeElement) {
  drawStrokePoints(ctx, el.content.points, el.content.color, el.content.width, el.content.highlighter);
}

function drawShape(ctx: CanvasRenderingContext2D, el: ShapeElement) {
  const b = el.bounds;
  ctx.save();
  ctx.strokeStyle = el.content.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (el.content.shape === 'rectangle') ctx.roundRect(b.x, b.y, b.width, b.height, 4);
  else if (el.content.shape === 'ellipse') ctx.ellipse(b.x + b.width / 2, b.y + b.height / 2, Math.abs(b.width / 2), Math.abs(b.height / 2), 0, 0, Math.PI * 2);
  else {
    const [a, c] = lineEnds(b, el.content.flip);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(c.x, c.y);
  }
  ctx.stroke();
  if (el.content.label) {
    ctx.fillStyle = el.content.color;
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(el.content.label, b.x + b.width / 2, b.y + b.height / 2);
  }
  ctx.restore();
}

export function drawArrowLine(ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string, width = 2) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = 10 + width * 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x - Math.cos(angle) * head * 0.6, to.y - Math.sin(angle) * head * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - head * Math.cos(angle - 0.4), to.y - head * Math.sin(angle - 0.4));
  ctx.lineTo(to.x - head * Math.cos(angle + 0.4), to.y - head * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, el: ArrowElement) {
  drawArrowLine(ctx, el.content.from, el.content.to, el.content.color);
  if (el.content.label) {
    const mx = (el.content.from.x + el.content.to.x) / 2, my = (el.content.from.y + el.content.to.y) / 2;
    ctx.save();
    ctx.fillStyle = el.content.color;
    ctx.font = '15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(el.content.label, mx, my - 8);
    ctx.restore();
  }
}

const fmt = (n: number) => (Math.abs(n) >= 100 || Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(1));

function drawGraph(ctx: CanvasRenderingContext2D, el: GraphElement) {
  const b = el.bounds;
  const [x0, x1] = el.content.xRange;
  ctx.save();
  ctx.strokeStyle = '#d4d4d0';
  ctx.lineWidth = 1;
  ctx.strokeRect(b.x, b.y, b.width, b.height);

  let f: (x: number) => number;
  try {
    f = compileExpression(el.content.expression);
  } catch {
    ctx.fillStyle = '#dc2626';
    ctx.font = '14px system-ui';
    ctx.fillText(`Can't plot "${el.content.expression}"`, b.x + 8, b.y + 20);
    ctx.restore();
    return;
  }
  const N = 240;
  const xs = Array.from({ length: N + 1 }, (_, i) => x0 + ((x1 - x0) * i) / N);
  const ys = xs.map(f);
  const finite = ys.filter(Number.isFinite).sort((a, b) => a - b);
  // Clip extreme values (asymptotes) using the 3rd-97th percentile.
  let y0 = finite[Math.floor(finite.length * 0.03)] ?? -1;
  let y1 = finite[Math.ceil(finite.length * 0.97) - 1] ?? 1;
  if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.1;
  y0 -= pad; y1 += pad;
  if (y0 > 0 && y0 < (y1 - y0) * 0.5) y0 = 0; // include the x-axis when it's close
  if (y1 < 0 && -y1 < (y1 - y0) * 0.5) y1 = 0;

  const inner = { x: b.x + 36, y: b.y + 28, width: b.width - 48, height: b.height - 52 };
  const X = (x: number) => inner.x + ((x - x0) / (x1 - x0)) * inner.width;
  const Y = (y: number) => inner.y + inner.height - ((y - y0) / (y1 - y0)) * inner.height;

  // Axes
  ctx.strokeStyle = '#9a9a94';
  ctx.beginPath();
  if (y0 <= 0 && y1 >= 0) { ctx.moveTo(inner.x, Y(0)); ctx.lineTo(inner.x + inner.width, Y(0)); }
  if (x0 <= 0 && x1 >= 0) { ctx.moveTo(X(0), inner.y); ctx.lineTo(X(0), inner.y + inner.height); }
  ctx.stroke();
  ctx.fillStyle = '#6b6b66';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(fmt(x0), X(x0), inner.y + inner.height + 14);
  ctx.fillText(fmt(x1), X(x1), inner.y + inner.height + 14);
  ctx.textAlign = 'right';
  ctx.fillText(fmt(y1), inner.x - 4, inner.y + 4);
  ctx.fillText(fmt(y0), inner.x - 4, inner.y + inner.height);

  // Curve, broken at gaps and off-scale jumps
  ctx.save();
  ctx.beginPath();
  ctx.rect(inner.x, inner.y, inner.width, inner.height);
  ctx.clip();
  ctx.strokeStyle = el.content.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i <= N; i++) {
    const y = ys[i]!;
    if (!Number.isFinite(y) || (i > 0 && Math.abs(y - ys[i - 1]!) > (y1 - y0) * 2)) { pen = false; continue; }
    if (pen) ctx.lineTo(X(xs[i]!), Y(y));
    else ctx.moveTo(X(xs[i]!), Y(y));
    pen = true;
  }
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = el.content.color;
  ctx.font = 'italic 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`y = ${el.content.expression}`, b.x + 8, b.y + 18);
  ctx.restore();
}

function drawAnnotation(ctx: CanvasRenderingContext2D, el: AnnotationElement, target: Bounds | undefined) {
  if (!target) return;
  const r = regionBounds(target, el.content.region);
  ctx.save();
  if (el.content.mode === 'highlight') {
    ctx.fillStyle = 'rgba(250, 204, 21, 0.35)';
    ctx.fillRect(r.x - 4, r.y - 4, r.width + 8, r.height + 8);
  } else if (el.content.mode === 'circle') {
    ctx.strokeStyle = el.content.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(r.x + r.width / 2, r.y + r.height / 2, r.width / 2 + 10, r.height / 2 + 8, -0.03, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const tip = { x: r.x - 4, y: r.y + r.height / 2 };
    drawArrowLine(ctx, { x: tip.x - 56, y: tip.y - 40 }, tip, el.content.color, 2.5);
  }
  if (el.content.note) {
    ctx.fillStyle = el.content.color;
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(el.content.note, el.content.mode === 'point' ? r.x - 120 : r.x, el.content.mode === 'point' ? r.y + r.height / 2 - 48 : r.y + r.height + 26);
  }
  ctx.restore();
}

export function drawElement(ctx: CanvasRenderingContext2D, el: BoardElement, lookup: (id: string) => BoardElement | undefined): void {
  switch (el.type) {
    case 'stroke': return drawStroke(ctx, el);
    case 'shape': return drawShape(ctx, el);
    case 'arrow': return drawArrow(ctx, el);
    case 'graph': return drawGraph(ctx, el);
    case 'annotation': return drawAnnotation(ctx, el, lookup(el.content.target)?.bounds);
  }
}
