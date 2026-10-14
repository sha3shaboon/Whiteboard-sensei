// Interactive whiteboard: canvas for ink + DOM layer for text/math/code, a pan/zoom camera,
// and the student tools. Framework-independent; the React app just mounts it.

import type { Board, BoardChange } from '../board';
import { COLORS, type BoardElement, type Bounds, type ElementId, type Point, type StrokeElement, type StrokePoint } from '../elements';
import { boundsOfPoints, elementAt, hitTest, union } from '../geometry';
import { translated } from '../transform';
import { DOM_TYPES, drawArrowLine, drawElement, drawStrokePoints } from './draw';
import { isDomElement, Measurer, renderDomContent, type DomContent } from './overlay';
import { drawStructure } from './structure';
import { animateSketch, sketchKeys } from './sketch';
import type { StructureContent } from '../structure';

export type Tool = 'pen' | 'highlighter' | 'eraser' | 'text' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'select' | 'pan';

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

type Gesture =
  | { kind: 'draw'; pointerId: number; points: StrokePoint[] }
  | { kind: 'shape'; pointerId: number; start: Point; end: Point }
  | { kind: 'erase'; pointerId: number; ids: Set<ElementId> }
  | { kind: 'move'; pointerId: number; id: ElementId; start: Point; dx: number; dy: number }
  | { kind: 'pan'; pointerId: number; last: Point }
  | { kind: 'pinch'; startDist: number; startZoom: number; startMid: Point; startCam: Camera };

const PEN_WIDTH = 2.6;
const HIGHLIGHTER_WIDTH = 18;
const STUDENT_FONT = 20;

export interface BoardViewOptions {
  onToolChange?: (tool: Tool) => void;
  onHistoryChange?: () => void;
}

export class BoardView {
  readonly root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private world: HTMLDivElement;
  /** Above the canvas: clickable items (choice cards, answer-box Done buttons). */
  private topWorld: HTMLDivElement;
  private measurer: Measurer;
  private domNodes = new Map<ElementId, HTMLDivElement>();
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private _tool: Tool = 'pen';
  private gesture: Gesture | null = null;
  private touches = new Map<number, Point>();
  private selected: ElementId | null = null;
  private editor: HTMLTextAreaElement | null = null;
  private lastPenAt = -Infinity;
  private dirty = true;
  /** Draw-in animations for AI items: start time and duration (ms, performance.now clock). */
  private reveals = new Map<ElementId, { start: number; dur: number }>();
  /** Items added in a burst are revealed one after another, starting from here. */
  private revealCursor = 0;
  /** Structure changes animating from their previous state. */
  private transitions = new Map<ElementId, { from: StructureContent; fromBounds: Bounds; start: number; dur: number }>();
  private raf = 0;
  private cleanup: (() => void)[] = [];

  constructor(container: HTMLElement, private board: Board, private opts: BoardViewOptions = {}) {
    this.root = document.createElement('div');
    this.root.className = 'board-root';
    Object.assign(this.root.style, { position: 'relative', width: '100%', height: '100%', overflow: 'hidden', touchAction: 'none', userSelect: 'none', background: '#fff' });

    const overlay = document.createElement('div');
    Object.assign(overlay.style, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none' });
    this.world = document.createElement('div');
    Object.assign(this.world.style, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0' });
    overlay.appendChild(this.world);

    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    this.ctx = this.canvas.getContext('2d')!;

    const top = document.createElement('div');
    Object.assign(top.style, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none' });
    this.topWorld = document.createElement('div');
    Object.assign(this.topWorld.style, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0' });
    top.appendChild(this.topWorld);
    this.topWorld.addEventListener('click', (e) => this.onInteract(e));

    this.root.append(overlay, this.canvas, top);
    container.appendChild(this.root);
    this.measurer = new Measurer(this.root);

    for (const el of board.all()) this.syncDom(el);
    this.cleanup.push(board.subscribe((c) => this.onChange(c)));
    this.cleanup.push(board.subscribeHistory(() => this.opts.onHistoryChange?.()));
    this.bindInput();

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.root);
    this.cleanup.push(() => ro.disconnect());
    this.resize();
    const loop = () => {
      if (this.dirty) this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ---------- public API ----------

  get tool(): Tool {
    return this._tool;
  }

  set tool(tool: Tool) {
    this.commitEditor();
    this._tool = tool;
    if (tool !== 'select') this.select(null);
    this.root.style.cursor = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair';
    this.opts.onToolChange?.(tool);
  }

  /** Size of text/math/code content in world units. */
  measure(content: DomContent, maxWidth?: number) {
    return this.measurer.measure(content, maxWidth);
  }

  /** Visible area in world coordinates. */
  getViewport(): Bounds {
    const r = this.root.getBoundingClientRect();
    return { x: this.camera.x, y: this.camera.y, width: r.width / this.camera.zoom, height: r.height / this.camera.zoom };
  }

  /** Pans (no zoom change) so the box is fully visible, if it isn't already. */
  ensureVisible(b: Bounds, margin = 40): void {
    const v = this.getViewport();
    let { x, y } = this.camera;
    if (b.x < v.x + margin || b.x + b.width > v.x + v.width - margin) x = b.x - margin;
    if (b.y < v.y + margin || b.y + b.height > v.y + v.height - margin) y = Math.min(b.y - margin, b.y + b.height + margin - v.height);
    if (x !== this.camera.x || y !== this.camera.y) {
      this.camera = { ...this.camera, x, y };
      this.invalidate();
    }
  }

  /** Renders strokes on white to a PNG (base64, no data: prefix) for handwriting recognition. */
  strokesToPng(strokes: StrokeElement[], maxSide = 768): string {
    const b = union(strokes.map((s) => s.bounds))!;
    const pad = 16;
    const scale = Math.min(2, maxSide / Math.max(b.width + pad * 2, b.height + pad * 2));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil((b.width + pad * 2) * scale));
    c.height = Math.max(1, Math.ceil((b.height + pad * 2) * scale));
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.scale(scale, scale);
    g.translate(pad - b.x, pad - b.y);
    for (const s of strokes) drawStrokePoints(g, s.content.points, s.content.highlighter ? s.content.color : '#000', s.content.width, s.content.highlighter);
    return c.toDataURL('image/png').slice('data:image/png;base64,'.length);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    for (const fn of this.cleanup) fn();
    this.measurer.destroy();
    this.root.remove();
  }

  // ---------- board sync ----------

  private onChange(c: BoardChange): void {
    if (c.kind === 'removed') {
      this.domNodes.get(c.element.id)?.remove();
      this.domNodes.delete(c.element.id);
      if (this.selected === c.element.id) this.selected = null;
    } else {
      if (c.kind === 'added' && c.origin === 'ai') this.scheduleReveal(c.element);
      if (c.kind === 'updated' && c.origin === 'ai') this.animateUpdate(c.before, c.after);
      this.syncDom(c.kind === 'added' ? c.element : c.after);
    }
    this.invalidate();
  }

  private scheduleReveal(el: BoardElement): void {
    const dur = REVEAL_MS[el.type] ?? 400;
    const start = Math.max(performance.now(), this.revealCursor);
    this.reveals.set(el.id, { start, dur });
    // The next item in the same burst starts when this one is mostly drawn.
    this.revealCursor = start + Math.min(dur * 0.8, 420);
  }

  /** AI changes to existing items are shown as change, not as a jump. */
  private animateUpdate(before: BoardElement, after: BoardElement): void {
    if (before.type === 'structure' && after.type === 'structure') {
      this.transitions.set(after.id, { from: before.content, fromBounds: before.bounds, start: performance.now(), dur: 900 });
    } else if (isDomElement(after) && after.type !== 'sketch') {
      this.reveals.delete(after.id);
      this.scheduleReveal(after); // re-written in place
    }
  }

  /** 0..1 draw-in progress of an element (1 when not animating). */
  private progress(id: ElementId, now: number): number {
    const r = this.reveals.get(id);
    if (!r) return 1;
    const p = (now - r.start) / r.dur;
    if (p >= 1) {
      this.reveals.delete(id);
      return 1;
    }
    this.dirty = true; // keep animating
    return Math.max(0, p);
  }

  private syncDom(el: BoardElement): void {
    if (!isDomElement(el) && el.type !== 'answer') return;
    const interactive = el.type === 'choice' || el.type === 'answer';
    let node = this.domNodes.get(el.id);
    if (!node) {
      node = document.createElement('div');
      node.dataset.id = el.id;
      if (interactive) node.dataset.interactive = '';
      (interactive ? this.topWorld : this.world).appendChild(node);
      this.domNodes.set(el.id, node);
    }
    if (el.type === 'answer') {
      // Only the Done button lives in the DOM; the dashed box is drawn on the canvas under the student's ink.
      const done = !!el.content.submissions;
      // Zero-size anchor at the box's bottom-right corner; the button hangs inside the box from it.
      node.innerHTML = `<button type="button" data-done style="position:absolute;right:8px;bottom:8px;white-space:nowrap;font:600 13px system-ui,sans-serif;padding:6px 12px;border-radius:999px;cursor:pointer;border:0;background:${done ? '#16a34a' : '#2563eb'};color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.15)">${done ? 'Submit again' : 'Done ✓'}</button>`;
      Object.assign(node.style, { position: 'absolute', left: `${el.bounds.x + el.bounds.width}px`, top: `${el.bounds.y + el.bounds.height}px`, width: '0', height: '0', pointerEvents: 'auto' });
      return;
    }
    // Sketches draw in stroke by stroke; on an update only their new parts are drawn.
    const previous = el.type === 'sketch' && node.dataset.svg ? sketchKeys(node) : null;
    const sketchChanged = el.type === 'sketch' && node.dataset.svg !== el.content.svg;
    renderDomContent(node, el);
    node.dataset.kind = el.type;
    Object.assign(node.style, { left: `${el.bounds.x}px`, top: `${el.bounds.y}px`, width: `${el.bounds.width}px`, minHeight: `${el.bounds.height}px`, transform: '' });
    if (interactive) node.style.pointerEvents = 'auto';
    if (el.type === 'sketch' && sketchChanged) {
      node.dataset.svg = el.content.svg;
      if (el.author === 'ai') animateSketch(node, previous ?? undefined);
    }
  }

  /** Student clicks on interactive items become ordinary student changes (so the AI hears about them). */
  private onInteract(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const id = target.closest<HTMLElement>('[data-id]')?.dataset.id;
    const el = id ? this.board.get(id) : undefined;
    if (!el) return;
    const choiceBtn = target.closest<HTMLElement>('[data-choice]');
    if (el.type === 'choice' && choiceBtn) {
      this.board.update(el.id, { content: { ...el.content, selected: Number(choiceBtn.dataset.choice) } });
    } else if (el.type === 'answer' && target.closest('[data-done]')) {
      this.board.update(el.id, { content: { ...el.content, submissions: (el.content.submissions ?? 0) + 1 } });
    }
  }

  // ---------- rendering ----------

  private invalidate(): void {
    this.dirty = true;
  }

  private resize(): void {
    const r = this.root.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, r.width * dpr);
    this.canvas.height = Math.max(1, r.height * dpr);
    this.invalidate();
  }

  private render(): void {
    this.dirty = false;
    const { ctx, camera } = this;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom, -camera.x * camera.zoom * dpr, -camera.y * camera.zoom * dpr);
    this.world.style.transform = `translate(${-camera.x * camera.zoom}px, ${-camera.y * camera.zoom}px) scale(${camera.zoom})`;
    this.topWorld.style.transform = this.world.style.transform;
    this.updateGrid();

    const g = this.gesture;
    const lookup = (id: string) => this.board.get(id);
    const now = performance.now();
    for (const el of this.board.all()) {
      if (DOM_TYPES.has(el.type)) continue;
      ctx.save();
      if (g?.kind === 'erase' && g.ids.has(el.id)) ctx.globalAlpha = 0.25;
      if (g?.kind === 'move' && g.id === el.id) ctx.translate(g.dx, g.dy);
      if (el.type === 'structure') {
        const tr = this.transitions.get(el.id);
        let transition: { from: StructureContent; fromBounds: Bounds; progress: number } | undefined;
        if (tr) {
          const p = (now - tr.start) / tr.dur;
          if (p >= 1) this.transitions.delete(el.id);
          else {
            transition = { from: tr.from, fromBounds: tr.fromBounds, progress: p };
            this.dirty = true;
          }
        }
        drawStructure(ctx, el, transition, this.progress(el.id, now));
      } else drawElement(ctx, el, lookup, this.progress(el.id, now));
      ctx.restore();
    }
    for (const [id, node] of this.domNodes) {
      const fade = g?.kind === 'erase' && g.ids.has(id);
      const p = this.progress(id, now);
      // Text, math and tables are "written" left to right; interactive cards fade in.
      const interactive = node.dataset.interactive !== undefined;
      const selfAnimated = node.dataset.kind === 'sketch'; // draws its own strokes in
      node.style.opacity = fade ? '0.25' : interactive ? String(p) : p <= 0 && !selfAnimated ? '0' : '1';
      node.style.clipPath = !interactive && !selfAnimated && p < 1 ? `inset(-4px ${(1 - easeOut(p)) * 100}% -4px -4px)` : '';
      node.style.transform = g?.kind === 'move' && g.id === id ? `translate(${g.dx}px, ${g.dy}px)` : '';
    }

    // In-progress gestures
    if (g?.kind === 'draw') {
      const hl = this._tool === 'highlighter';
      drawStrokePoints(ctx, g.points, hl ? COLORS.highlighter : COLORS.studentInk, hl ? HIGHLIGHTER_WIDTH : PEN_WIDTH, hl);
    } else if (g?.kind === 'shape') {
      this.drawShapePreview(g.start, g.end);
    }

    // Selection
    const sel = this.selected ? this.board.get(this.selected) : undefined;
    if (sel) {
      const b = sel.bounds;
      const dx = g?.kind === 'move' ? g.dx : 0, dy = g?.kind === 'move' ? g.dy : 0;
      ctx.save();
      ctx.strokeStyle = '#2563eb';
      ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
      ctx.lineWidth = 1.5 / camera.zoom;
      ctx.strokeRect(b.x + dx - 6, b.y + dy - 6, b.width + 12, b.height + 12);
      ctx.restore();
    }
  }

  /** Dot grid as a CSS background, behind both the DOM layer and the canvas. */
  private updateGrid(): void {
    const step = 32 * this.camera.zoom;
    const s = this.root.style;
    s.backgroundImage = this.camera.zoom < 0.35 ? 'none' : 'radial-gradient(circle, #dcdcd6 1.2px, transparent 1.4px)';
    s.backgroundSize = `${step}px ${step}px`;
    s.backgroundPosition = `${-this.camera.x * this.camera.zoom - step / 2}px ${-this.camera.y * this.camera.zoom - step / 2}px`;
  }

  private drawShapePreview(a: Point, b: Point): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = COLORS.studentInk;
    ctx.lineWidth = 2;
    if (this._tool === 'arrow') drawArrowLine(ctx, a, b, COLORS.studentInk);
    else {
      ctx.beginPath();
      if (this._tool === 'rectangle') ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      else if (this._tool === 'ellipse') ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      else { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- input ----------

  private toWorld(e: { clientX: number; clientY: number }): Point {
    const r = this.root.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.camera.zoom + this.camera.x, y: (e.clientY - r.top) / this.camera.zoom + this.camera.y };
  }

  private bindInput(): void {
    const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    on(this.root, 'pointerdown', (e) => this.onDown(e));
    on(this.root, 'pointermove', (e) => this.onMove(e));
    on(this.root, 'pointerup', (e) => this.onUp(e));
    on(this.root, 'pointercancel', (e) => this.onUp(e, true));
    on(this.root, 'dblclick', (e) => this.onDoubleClick(e));
    on(this.root, 'wheel', (e) => this.onWheel(e), { passive: false });
    on(window, 'keydown', (e) => this.onKey(e));
  }

  private onDown(e: PointerEvent): void {
    if (e.target instanceof HTMLTextAreaElement) return;
    if ((e.target as HTMLElement).closest?.('[data-interactive]')) return; // clicks on choice cards / Done buttons
    if (e.pointerType === 'pen') this.lastPenAt = performance.now();
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Palm rejection: while a pen is in use, touches only pan/zoom.
      const penActive = performance.now() - this.lastPenAt < 3000;
      if (this.touches.size === 2) return this.startPinch();
      if (penActive) return;
    }
    if (this.gesture) return;
    if (e.button === 1 || (e.button === 0 && e.altKey)) return this.startPan(e);
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    this.root.setPointerCapture(e.pointerId);
    const p = this.toWorld(e);
    const tool = this._tool;
    if (tool === 'pen' || tool === 'highlighter') {
      this.gesture = { kind: 'draw', pointerId: e.pointerId, points: [{ ...p, pressure: e.pressure || 0.5 }] };
    } else if (tool === 'eraser') {
      this.gesture = { kind: 'erase', pointerId: e.pointerId, ids: new Set() };
      this.eraseAt(p);
    } else if (tool === 'rectangle' || tool === 'ellipse' || tool === 'line' || tool === 'arrow') {
      this.gesture = { kind: 'shape', pointerId: e.pointerId, start: p, end: p };
    } else if (tool === 'text') {
      this.openEditor(p);
    } else if (tool === 'select') {
      const hit = elementAt(this.board.all(), p, 6 / this.camera.zoom);
      this.select(hit?.id ?? null);
      if (hit) this.gesture = { kind: 'move', pointerId: e.pointerId, id: hit.id, start: p, dx: 0, dy: 0 };
    } else if (tool === 'pan') {
      this.startPan(e);
    }
    this.invalidate();
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.gesture?.kind === 'pinch') return this.updatePinch();
    }
    const g = this.gesture;
    if (!g || g.kind === 'pinch' || g.pointerId !== e.pointerId) return;
    if (e.pointerType === 'pen') this.lastPenAt = performance.now();

    if (g.kind === 'draw') {
      const coalesced = e.getCoalescedEvents?.() ?? [];
      for (const s of coalesced.length ? coalesced : [e]) g.points.push({ ...this.toWorld(s), pressure: s.pressure || 0.5 });
    } else if (g.kind === 'shape') {
      g.end = this.toWorld(e);
    } else if (g.kind === 'erase') {
      this.eraseAt(this.toWorld(e));
    } else if (g.kind === 'move') {
      const p = this.toWorld(e);
      g.dx = p.x - g.start.x;
      g.dy = p.y - g.start.y;
    } else if (g.kind === 'pan') {
      this.camera.x -= (e.clientX - g.last.x) / this.camera.zoom;
      this.camera.y -= (e.clientY - g.last.y) / this.camera.zoom;
      g.last = { x: e.clientX, y: e.clientY };
    }
    this.invalidate();
  }

  private onUp(e: PointerEvent, cancelled = false): void {
    this.touches.delete(e.pointerId);
    const g = this.gesture;
    if (g?.kind === 'pinch') {
      if (this.touches.size < 2) this.gesture = null;
      return;
    }
    if (!g || g.pointerId !== e.pointerId) return;
    this.gesture = null;
    if (!cancelled) this.finishGesture(g);
    this.invalidate();
  }

  private finishGesture(g: Gesture): void {
    const now = Date.now();
    if (g.kind === 'draw') {
      const hl = this._tool === 'highlighter';
      const width = hl ? HIGHLIGHTER_WIDTH : PEN_WIDTH;
      this.board.add({
        id: this.board.nextId(), type: 'stroke', author: 'student', createdAt: now, updatedAt: now,
        bounds: boundsOfPoints(g.points, width),
        content: { points: g.points, color: hl ? COLORS.highlighter : COLORS.studentInk, width, highlighter: hl || undefined },
      });
    } else if (g.kind === 'shape') {
      const { start: a, end: b } = g;
      if (Math.hypot(b.x - a.x, b.y - a.y) < 4) return;
      const base = { id: this.board.nextId(), author: 'student' as const, createdAt: now, updatedAt: now };
      if (this._tool === 'arrow') {
        this.board.add({ ...base, type: 'arrow', bounds: boundsOfPoints([a, b], 8), content: { from: a, to: b, color: COLORS.studentInk } });
      } else {
        const shape = this._tool === 'rectangle' ? 'rectangle' : this._tool === 'ellipse' ? 'ellipse' : 'line';
        const bounds = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
        const flip = shape === 'line' && (b.x - a.x) * (b.y - a.y) < 0;
        this.board.add({ ...base, type: 'shape', bounds, content: { shape, color: COLORS.studentInk, flip: flip || undefined } });
      }
    } else if (g.kind === 'erase') {
      if (g.ids.size) this.board.transact(() => g.ids.forEach((id) => this.board.remove(id)));
    } else if (g.kind === 'move') {
      const el = this.board.get(g.id);
      if (el && (Math.abs(g.dx) > 1 || Math.abs(g.dy) > 1)) this.board.update(g.id, translated(el, g.dx, g.dy));
    }
  }

  private eraseAt(p: Point): void {
    const g = this.gesture;
    if (g?.kind !== 'erase') return;
    const tol = 8 / this.camera.zoom;
    for (const el of this.board.all()) {
      if (g.ids.has(el.id)) continue;
      // Annotations erase with their target region; others by shape.
      if (el.type === 'annotation' ? false : hitTest(el, p, tol)) g.ids.add(el.id);
    }
    // Erasing an element also erases the AI's annotations on it.
    for (const el of this.board.all()) if (el.type === 'annotation' && g.ids.has(el.content.target)) g.ids.add(el.id);
  }

  private startPan(e: PointerEvent): void {
    this.root.setPointerCapture(e.pointerId);
    this.gesture = { kind: 'pan', pointerId: e.pointerId, last: { x: e.clientX, y: e.clientY } };
  }

  private startPinch(): void {
    const [a, b] = [...this.touches.values()] as [Point, Point];
    this.gesture = { kind: 'pinch', startDist: Math.hypot(a.x - b.x, a.y - b.y), startZoom: this.camera.zoom, startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, startCam: { ...this.camera } };
  }

  private updatePinch(): void {
    const g = this.gesture;
    if (g?.kind !== 'pinch' || this.touches.size < 2) return;
    const [a, b] = [...this.touches.values()] as [Point, Point];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const zoom = clampZoom(g.startZoom * (Math.hypot(a.x - b.x, a.y - b.y) / g.startDist));
    const r = this.root.getBoundingClientRect();
    // Keep the world point under the starting midpoint under the current midpoint.
    const wx = (g.startMid.x - r.left) / g.startCam.zoom + g.startCam.x;
    const wy = (g.startMid.y - r.top) / g.startCam.zoom + g.startCam.y;
    this.camera = { zoom, x: wx - (mid.x - r.left) / zoom, y: wy - (mid.y - r.top) / zoom };
    this.invalidate();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const before = this.toWorld(e);
      this.camera.zoom = clampZoom(this.camera.zoom * Math.exp(-e.deltaY * 0.01));
      const after = this.toWorld(e);
      this.camera.x += before.x - after.x;
      this.camera.y += before.y - after.y;
    } else {
      this.camera.x += e.deltaX / this.camera.zoom;
      this.camera.y += e.deltaY / this.camera.zoom;
    }
    this.invalidate();
  }

  private onDoubleClick(e: MouseEvent): void {
    if (this._tool !== 'select') return;
    const hit = elementAt(this.board.all(), this.toWorld(e));
    if (hit?.type === 'text') this.openEditor({ x: hit.bounds.x, y: hit.bounds.y }, hit.id);
  }

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.board.redo();
      else this.board.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.board.redo();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected) {
      e.preventDefault();
      const id = this.selected;
      this.board.transact(() => {
        for (const el of this.board.all()) if (el.type === 'annotation' && el.content.target === id) this.board.remove(el.id);
        this.board.remove(id);
      });
      this.select(null);
    } else if (e.key === 'Escape') {
      this.select(null);
    }
  }

  private select(id: ElementId | null): void {
    this.selected = id;
    this.invalidate();
  }

  // ---------- text editing ----------

  private openEditor(p: Point, editId?: ElementId): void {
    this.commitEditor();
    const existing = editId ? this.board.get(editId) : undefined;
    const ta = document.createElement('textarea');
    const z = this.camera.zoom;
    Object.assign(ta.style, {
      position: 'absolute',
      left: `${(p.x - this.camera.x) * z}px`,
      top: `${(p.y - this.camera.y) * z}px`,
      font: `${STUDENT_FONT * z}px/1.35 system-ui, -apple-system, sans-serif`,
      minWidth: `${160 * z}px`,
      minHeight: `${STUDENT_FONT * 1.6 * z}px`,
      padding: `${2 * z}px ${4 * z}px`,
      border: '1px dashed #2563eb',
      outline: 'none',
      background: 'rgba(255,255,255,0.9)',
      resize: 'both',
      zIndex: '2',
    });
    ta.value = existing?.type === 'text' ? existing.content.text : '';
    ta.dataset.x = String(p.x);
    ta.dataset.y = String(p.y);
    if (editId) ta.dataset.edit = editId;
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        this.commitEditor();
      }
    });
    ta.addEventListener('blur', () => this.commitEditor());
    if (existing) this.domNodes.get(existing.id)?.style.setProperty('visibility', 'hidden');
    this.root.appendChild(ta);
    this.editor = ta;
    // Focus after the current pointer event so the textarea keeps focus.
    setTimeout(() => ta.focus(), 0);
  }

  private commitEditor(): void {
    const ta = this.editor;
    if (!ta) return;
    this.editor = null;
    ta.remove();
    const text = ta.value.replace(/\s+$/, '');
    const editId = ta.dataset.edit;
    if (editId) this.domNodes.get(editId)?.style.removeProperty('visibility');
    const existing = editId ? this.board.get(editId) : undefined;
    const content = { text, fontSize: existing?.type === 'text' ? existing.content.fontSize : STUDENT_FONT, color: existing?.type === 'text' ? existing.content.color : COLORS.studentInk };
    if (existing) {
      if (!text) return this.board.remove(existing.id);
      if (existing.type === 'text' && text === existing.content.text) return;
      const size = this.measure({ type: 'text', content });
      this.board.update(existing.id, { content, bounds: { ...existing.bounds, ...size } });
    } else if (text) {
      const size = this.measure({ type: 'text', content });
      const now = Date.now();
      this.board.add({ id: this.board.nextId(), type: 'text', author: 'student', createdAt: now, updatedAt: now, bounds: { x: Number(ta.dataset.x), y: Number(ta.dataset.y), ...size }, content });
    }
  }
}

/** How long each kind of AI item takes to draw in. */
const REVEAL_MS: Partial<Record<BoardElement['type'], number>> = {
  text: 450,
  math: 750,
  code: 700,
  table: 900,
  choice: 400,
  answer: 350,
  shape: 320,
  arrow: 450,
  graph: 1500,
  structure: 500,
  annotation: 550,
};

const easeOut = (p: number) => 1 - Math.pow(1 - p, 2);

function clampZoom(z: number): number {
  return Math.min(4, Math.max(0.25, z));
}
