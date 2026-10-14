// Draws data structures and animates changes between two states: items that stay glide to their
// new cell, new items fly in from the entry side, removed items fly out and fade, pointers slide.

import type { Bounds, StructureElement } from '../elements';
import { enterFrom, exitTo, layoutStructure, type StructureContent, type StructureLayout } from '../structure';
import { drawLabelPill } from './draw';

const HIGHLIGHT = '#fef3c7';
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpRect = (a: Bounds, b: Bounds, t: number): Bounds => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), width: lerp(a.width, b.width, t), height: lerp(a.height, b.height, t) });

export interface StructureTransition {
  from: StructureContent;
  fromBounds: Bounds;
  progress: number; // 0..1
}

/**
 * Draws a structure. With a transition, items animate from the `from` state to the current one.
 * `reveal` (0..1) fades the whole structure in when it first appears.
 */
export function drawStructure(ctx: CanvasRenderingContext2D, el: StructureElement, transition?: StructureTransition, reveal = 1): void {
  const c = el.content;
  const now = layoutStructure(c, el.bounds);
  const t = transition ? ease(Math.max(0, Math.min(1, transition.progress))) : 1;
  const before = transition ? layoutStructure(transition.from, transition.fromBounds) : null;
  const beforeItems = new Map((transition?.from.items ?? []).map((it) => [it.key, it]));
  const nowKeys = new Set(c.items.map((it) => it.key));

  ctx.save();
  ctx.globalAlpha *= reveal;

  if (c.title) {
    ctx.fillStyle = c.color;
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(c.title, el.bounds.x + 8, el.bounds.y + 20);
  }

  // Empty placeholder (fades out as the first item arrives, in as the last leaves).
  const emptyAlpha = (c.items.length ? 0 : 1) * t + ((transition?.from.items.length ?? c.items.length) ? 0 : 1) * (1 - t);
  if (emptyAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha *= emptyAlpha;
    dashedSlot(ctx, now.empty, c.color);
    ctx.restore();
  }

  // Linked-list links first, so nodes sit on top of them.
  if (c.kind === 'linkedlist') drawLinks(ctx, c, now, before, t);

  // Items leaving
  for (const [key, it] of beforeItems) {
    if (nowKeys.has(key) || !before) continue;
    const from = before.cells.get(key)!;
    cell(ctx, lerpRect(from, exitTo(c.kind, from), t), it.value, c, it.highlight, 1 - t);
  }
  // Items staying or arriving
  c.items.forEach((it, i) => {
    const target = now.cells.get(it.key)!;
    const old = before?.cells.get(it.key);
    const prev = beforeItems.get(it.key);
    if (transition && !old) {
      cell(ctx, lerpRect(enterFrom(c.kind, target), target, t), it.value, c, it.highlight, t);
    } else if (old && prev && prev.value !== it.value) {
      // Value changed: cross-fade the old value out and the new one in.
      const r = lerpRect(old, target, t);
      cell(ctx, r, '', c, it.highlight || prev.highlight, 1);
      cellText(ctx, r, prev.value, 1 - t, -10 * t);
      cellText(ctx, r, it.value, t, 10 * (1 - t));
    } else {
      cell(ctx, old ? lerpRect(old, target, t) : target, it.value, c, it.highlight, 1);
    }
    if (c.kind === 'array') indexLabel(ctx, target, i);
  });

  drawPointers(ctx, now, before, t, c.color);
  ctx.restore();
}

function cell(ctx: CanvasRenderingContext2D, r: Bounds, value: string, c: StructureContent, highlight: boolean | undefined, alpha: number) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = highlight ? HIGHLIGHT : '#ffffff';
  ctx.strokeStyle = c.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.width, r.height, c.kind === 'array' || c.kind === 'queue' ? 2 : 6);
  ctx.fill();
  ctx.stroke();
  if (c.kind === 'linkedlist') {
    // "next" compartment on the right
    const nx = r.x + r.width - 22;
    ctx.beginPath();
    ctx.moveTo(nx, r.y);
    ctx.lineTo(nx, r.y + r.height);
    ctx.stroke();
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(nx + 11, r.y + r.height / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (value) cellText(ctx, c.kind === 'linkedlist' ? { ...r, width: r.width - 22 } : r, value, alpha, 0);
}

function cellText(ctx: CanvasRenderingContext2D, r: Bounds, text: string, alpha: number, dy: number) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = '#1c1c1a';
  ctx.font = '600 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, r.x + r.width / 2, r.y + r.height / 2 + dy + 1);
  ctx.restore();
}

function indexLabel(ctx: CanvasRenderingContext2D, r: Bounds, i: number) {
  ctx.save();
  ctx.fillStyle = '#9a9a94';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(i), r.x + r.width / 2, r.y + r.height + 16);
  ctx.restore();
}

function dashedSlot(ctx: CanvasRenderingContext2D, r: Bounds, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha *= 0.5;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x, r.y, r.width, r.height);
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = 'italic 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('empty', r.x + r.width / 2, r.y + r.height / 2);
  ctx.restore();
}

function drawPointers(ctx: CanvasRenderingContext2D, now: StructureLayout, before: StructureLayout | null, t: number, color: string) {
  // Match pointers by name ("front, rear" splits into its parts) so they slide rather than jump.
  const find = (layout: StructureLayout | null, name: string) => layout?.pointers.find((p) => p.name.split(', ').includes(name));
  const drawn = new Set<string>();
  for (const p of now.pointers) {
    const first = p.name.split(', ')[0]!;
    const prev = find(before, first);
    const x = prev ? lerp(prev.x, p.x, t) : p.x;
    const y = prev ? lerp(prev.y, p.y, t) : p.y;
    pointer(ctx, p.name, x, y, p.side, color, prev || !before ? 1 : t);
    p.name.split(', ').forEach((n) => drawn.add(n));
  }
  // Pointers that disappear (e.g. the queue becomes empty) fade out where they were.
  for (const p of before?.pointers ?? []) if (!p.name.split(', ').some((n) => drawn.has(n))) pointer(ctx, p.name, p.x, p.y, p.side, color, 1 - t);
}

function pointer(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, side: 'above' | 'right', color: string, alpha: number) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.8;
  if (side === 'above') {
    ctx.beginPath();
    ctx.moveTo(x, y - 24);
    ctx.lineTo(x, y - 6);
    ctx.stroke();
    head(ctx, x, y - 4, Math.PI / 2);
    drawLabelPill(ctx, name, { x, y: y - 32 }, color);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + 34, y);
    ctx.lineTo(x + 8, y);
    ctx.stroke();
    head(ctx, x + 6, y, Math.PI);
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x + 40, y);
  }
  ctx.restore();
}

function head(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 9 * Math.cos(angle - 0.45), y - 9 * Math.sin(angle - 0.45));
  ctx.lineTo(x - 9 * Math.cos(angle + 0.45), y - 9 * Math.sin(angle + 0.45));
  ctx.closePath();
  ctx.fill();
}

function drawLinks(ctx: CanvasRenderingContext2D, c: StructureContent, now: StructureLayout, before: StructureLayout | null, t: number) {
  const pos = (key: string) => {
    const target = now.cells.get(key);
    const old = before?.cells.get(key);
    if (target && old) return lerpRect(old, target, t);
    if (target) return before ? lerpRect(enterFrom(c.kind, target), target, t) : target;
    return null;
  };
  ctx.save();
  ctx.strokeStyle = c.color;
  ctx.fillStyle = c.color;
  ctx.lineWidth = 1.8;
  const items = c.items;
  for (let i = 0; i < items.length; i++) {
    const a = pos(items[i]!.key);
    if (!a) continue;
    const sx = a.x + a.width - 11, sy = a.y + a.height / 2;
    const next = items[i + 1] ? pos(items[i + 1]!.key) : null;
    if (next) {
      const ex = next.x - 4, ey = next.y + next.height / 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex - 6, ey);
      ctx.stroke();
      head(ctx, ex, ey, Math.atan2(ey - sy, ex - sx));
    } else {
      // Last node points to null.
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(a.x + a.width + 26, sy);
      ctx.stroke();
      head(ctx, a.x + a.width + 30, sy, 0);
      ctx.font = 'italic 14px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('null', a.x + a.width + 36, sy);
    }
  }
  ctx.restore();
}
