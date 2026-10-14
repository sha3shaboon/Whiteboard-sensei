// Canvas drawing for ink-like elements. Text, math and code are DOM nodes (see overlay.ts).

import type { AnnotationElement, AnswerElement, ArrowElement, BoardElement, Bounds, GraphElement, Point, ShapeElement, StrokeElement, StrokePoint } from '../elements';
import { compileExpression } from '../expression';
import { lineEnds, regionBounds } from '../geometry';

export const DOM_TYPES = new Set(['text', 'math', 'code', 'table', 'choice']);
export const SHAPE_FONT = 16;

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
    ctx.font = `${SHAPE_FONT}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const inset = el.content.shape === 'ellipse' ? b.width * 0.18 : 12;
    const lines = wrapLines(ctx, el.content.label, Math.max(20, b.width - inset * 2));
    const lh = SHAPE_FONT * 1.25;
    lines.forEach((line, i) => ctx.fillText(line, b.x + b.width / 2, b.y + b.height / 2 + (i - (lines.length - 1) / 2) * lh));
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

  const N = 240;
  const xs = Array.from({ length: N + 1 }, (_, i) => x0 + ((x1 - x0) * i) / N);
  const series: { ys: number[]; color: string; expression: string }[] = [];
  const bad: string[] = [];
  for (const fn of el.content.functions) {
    try {
      const f = compileExpression(fn.expression);
      series.push({ ys: xs.map(f), color: fn.color, expression: fn.expression });
    } catch {
      bad.push(fn.expression);
    }
  }
  const points = el.content.points ?? [];
  const finite = [...series.flatMap((s) => s.ys), ...points.map((p) => p.y)].filter(Number.isFinite).sort((a, b) => a - b);
  // Clip extreme values (asymptotes) using the 3rd-97th percentile.
  let y0 = finite[Math.floor(finite.length * 0.03)] ?? -1;
  let y1 = finite[Math.ceil(finite.length * 0.97) - 1] ?? 1;
  for (const p of points) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.1;
  y0 -= pad; y1 += pad;
  if (y0 > 0 && y0 < (y1 - y0) * 0.5) y0 = 0; // include the x-axis when it's close
  if (y1 < 0 && -y1 < (y1 - y0) * 0.5) y1 = 0;

  const legendH = 20 * Math.max(1, series.length + (el.content.title ? 1 : 0));
  const inner = { x: b.x + 40, y: b.y + legendH + 12, width: b.width - 56, height: b.height - legendH - 36 };
  const X = (x: number) => inner.x + ((x - x0) / (x1 - x0)) * inner.width;
  const Y = (y: number) => inner.y + inner.height - ((y - y0) / (y1 - y0)) * inner.height;

  // Light grid at "nice" steps, then axes
  ctx.strokeStyle = '#efefeb';
  ctx.beginPath();
  for (const gx of niceTicks(x0, x1)) { ctx.moveTo(X(gx), inner.y); ctx.lineTo(X(gx), inner.y + inner.height); }
  for (const gy of niceTicks(y0, y1)) { ctx.moveTo(inner.x, Y(gy)); ctx.lineTo(inner.x + inner.width, Y(gy)); }
  ctx.stroke();
  ctx.strokeStyle = '#9a9a94';
  ctx.beginPath();
  if (y0 <= 0 && y1 >= 0) { ctx.moveTo(inner.x, Y(0)); ctx.lineTo(inner.x + inner.width, Y(0)); }
  if (x0 <= 0 && x1 >= 0) { ctx.moveTo(X(0), inner.y); ctx.lineTo(X(0), inner.y + inner.height); }
  ctx.stroke();
  ctx.fillStyle = '#6b6b66';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const gx of niceTicks(x0, x1)) ctx.fillText(fmt(gx), X(gx), inner.y + inner.height + 14);
  ctx.textAlign = 'right';
  for (const gy of niceTicks(y0, y1)) ctx.fillText(fmt(gy), inner.x - 4, Y(gy) + 4);

  // Curves, broken at gaps and off-scale jumps
  ctx.save();
  ctx.beginPath();
  ctx.rect(inner.x, inner.y, inner.width, inner.height);
  ctx.clip();
  ctx.lineWidth = 2.2;
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= N; i++) {
      const y = s.ys[i]!;
      if (!Number.isFinite(y) || (i > 0 && Math.abs(y - s.ys[i - 1]!) > (y1 - y0) * 2)) { pen = false; continue; }
      if (pen) ctx.lineTo(X(xs[i]!), Y(y));
      else ctx.moveTo(X(xs[i]!), Y(y));
      pen = true;
    }
    ctx.stroke();
  }
  ctx.restore();

  // Marked points
  for (const p of points) {
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(X(p.x), Y(p.y), 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(p.label ?? `(${fmt(p.x)}, ${fmt(p.y)})`, X(p.x) + 7, Y(p.y) - 7);
  }

  // Title and legend
  ctx.textAlign = 'left';
  let ly = b.y + 18;
  if (el.content.title) {
    ctx.fillStyle = '#1c1c1a';
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(el.content.title, b.x + 10, ly);
    ly += 20;
  }
  ctx.font = 'italic 14px system-ui, sans-serif';
  for (const s of series) {
    ctx.fillStyle = s.color;
    ctx.fillRect(b.x + 10, ly - 5, 14, 3);
    ctx.fillText(`y = ${s.expression}`, b.x + 30, ly);
    ly += 20;
  }
  if (bad.length) {
    ctx.fillStyle = '#dc2626';
    ctx.font = '13px system-ui';
    ctx.fillText(`Can't plot: ${bad.join(', ')}`, b.x + 10, b.y + b.height - 8);
  }
  ctx.restore();
}

/** About 5 round-numbered ticks between lo and hi. */
function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [];
  const raw = span / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

/** Splits text into lines that fit maxWidth (explicit \n respected). */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

function drawAnswerBox(ctx: CanvasRenderingContext2D, el: AnswerElement) {
  const b = el.bounds;
  ctx.save();
  ctx.strokeStyle = el.content.submissions ? '#16a34a' : '#2563eb';
  ctx.fillStyle = el.content.submissions ? 'rgba(22, 163, 74, 0.04)' : 'rgba(37, 99, 235, 0.03)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.width, b.height, 8);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = el.content.submissions ? '#16a34a' : '#6b8fd6';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(el.content.submissions ? 'Submitted' : el.content.prompt || 'Write your answer here', b.x + 10, b.y + 18);
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
    case 'answer': return drawAnswerBox(ctx, el);
    case 'annotation': return drawAnnotation(ctx, el, lookup(el.content.target)?.bounds);
  }
}
