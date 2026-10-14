import type { Board, BoardChange } from './board';
import type { BoardElement, Bounds, ElementId, StrokeElement } from './elements';
import { boundsDistance, union } from './geometry';
import { describeContent } from './summary';

/**
 * Meaningful student actions, grouped from raw board changes. See spec § AI perception.
 * Handwriting arrives as one `student_wrote` per pause, with the stroke ids to recognize.
 */
export type StudentEvent =
  | { type: 'student_wrote'; strokes: StrokeElement[]; bounds: Bounds; highlighter: boolean; near?: string }
  | { type: 'student_added'; element: BoardElement; near?: string }
  | { type: 'student_edited'; element: BoardElement; before: BoardElement }
  | { type: 'student_moved'; element: BoardElement }
  | { type: 'student_erased'; element: BoardElement };

export interface GrouperOptions {
  /** Pen-idle time that ends a handwriting group. */
  idleMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/** Listens to student changes on the board and emits grouped StudentEvents. */
export class StudentEventGrouper {
  private pending: StrokeElement[] = [];
  private timer: unknown = null;
  private readonly idleMs: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private unsubscribe: () => void;

  constructor(private board: Board, private onEvent: (e: StudentEvent) => void, opts: GrouperOptions = {}) {
    this.idleMs = opts.idleMs ?? 1500;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.unsubscribe = board.subscribe((c) => this.handle(c));
  }

  /** Ends the current handwriting group now (e.g. when the student presses "Check my work"). */
  flush(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    const strokes = this.pending.filter((s) => this.board.get(s.id));
    this.pending = [];
    if (!strokes.length) return;
    const bounds = union(strokes.map((s) => s.bounds))!;
    this.onEvent({
      type: 'student_wrote',
      strokes,
      bounds,
      highlighter: strokes.every((s) => s.content.highlighter),
      near: this.near(bounds, new Set(strokes.map((s) => s.id))),
    });
  }

  dispose(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.unsubscribe();
  }

  private handle(c: BoardChange): void {
    if (c.origin !== 'student') return;
    if (c.kind === 'added' && c.element.type === 'stroke') {
      this.pending.push(c.element);
      if (this.timer !== null) this.clearTimer(this.timer);
      this.timer = this.setTimer(() => this.flush(), this.idleMs);
      return;
    }
    // Any other action ends the current handwriting group first, so events stay in order.
    if (c.kind === 'removed' && this.pending.some((s) => s.id === c.element.id)) {
      this.pending = this.pending.filter((s) => s.id !== c.element.id);
      return; // erased while still writing: just drop it from the group
    }
    this.flush();
    if (c.kind === 'added') this.onEvent({ type: 'student_added', element: c.element, near: this.near(c.element.bounds, new Set([c.element.id])) });
    else if (c.kind === 'removed') this.onEvent({ type: 'student_erased', element: c.element });
    else if (JSON.stringify(c.before.content) !== JSON.stringify(c.after.content)) this.onEvent({ type: 'student_edited', element: c.after, before: c.before });
    else this.onEvent({ type: 'student_moved', element: c.after });
  }

  /** Nearest other element within 250 units, described briefly. */
  private near(bounds: Bounds, exclude: Set<ElementId>): string | undefined {
    let best: BoardElement | undefined;
    let bestD = 250;
    for (const el of this.board.all()) {
      if (exclude.has(el.id) || el.type === 'annotation' || (el.type === 'stroke' && !el.content.recognized)) continue;
      const d = boundsDistance(bounds, el.bounds);
      if (d < bestD) {
        bestD = d;
        best = el;
      }
    }
    return best ? `#${best.id} (${best.author} ${describeContent(best)})` : undefined;
  }
}
