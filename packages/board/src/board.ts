import type { BoardElement, ElementId } from './elements';

/**
 * Who caused a change. Student changes are reported to the AI and undoable;
 * AI changes come from tool calls; system changes (measurements, recognition results) are neither.
 */
export type Origin = 'student' | 'ai' | 'system';

export type BoardChange =
  | { kind: 'added'; element: BoardElement; origin: Origin }
  | { kind: 'updated'; before: BoardElement; after: BoardElement; origin: Origin }
  | { kind: 'removed'; element: BoardElement; origin: Origin };

type Listener = (change: BoardChange) => void;

export type ElementPatch = Partial<Pick<BoardElement, 'bounds' | 'content'>>;

/** Element store with change events and student undo/redo. Framework-independent. */
export class Board {
  private elements = new Map<ElementId, BoardElement>();
  private listeners = new Set<Listener>();
  private historyListeners = new Set<() => void>();
  private undoStack: BoardChange[][] = [];
  private redoStack: BoardChange[][] = [];
  private tx: BoardChange[] | null = null;
  private counter = 0;

  constructor(private now: () => number = Date.now) {}

  /** Next short element id ("1", "2", …). */
  nextId(): ElementId {
    return String(++this.counter);
  }

  get(id: ElementId): BoardElement | undefined {
    return this.elements.get(id);
  }

  /** All elements in z-order (oldest first). */
  all(): BoardElement[] {
    return [...this.elements.values()];
  }

  get size(): number {
    return this.elements.size;
  }

  add(element: BoardElement, origin: Origin = 'student'): void {
    if (this.elements.has(element.id)) throw new Error(`Element ${element.id} already exists`);
    const n = Number(element.id);
    if (Number.isInteger(n) && n > this.counter) this.counter = n;
    this.elements.set(element.id, element);
    this.record({ kind: 'added', element, origin });
  }

  update(id: ElementId, patch: ElementPatch, origin: Origin = 'student'): void {
    const before = this.elements.get(id);
    if (!before) throw new Error(`Element ${id} not found`);
    const after = {
      ...before,
      ...patch,
      content: patch.content ? { ...before.content, ...patch.content } : before.content,
      updatedAt: this.now(),
    } as BoardElement;
    this.elements.set(id, after);
    this.record({ kind: 'updated', before, after, origin });
  }

  remove(id: ElementId, origin: Origin = 'student'): void {
    const element = this.elements.get(id);
    if (!element) return;
    this.elements.delete(id);
    this.record({ kind: 'removed', element, origin });
  }

  /** Groups the student changes made inside `fn` into one undo step. */
  transact(fn: () => void): void {
    if (this.tx) return fn();
    this.tx = [];
    try {
      fn();
    } finally {
      const changes = this.tx;
      this.tx = null;
      if (changes.length) this.pushUndo(changes);
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const changes = this.undoStack.pop();
    if (!changes) return;
    for (const c of [...changes].reverse()) this.applyInverse(c);
    this.redoStack.push(changes);
    this.emitHistory();
  }

  redo(): void {
    const changes = this.redoStack.pop();
    if (!changes) return;
    for (const c of changes) this.apply(c);
    this.undoStack.push(changes);
    this.emitHistory();
  }

  /** Called whenever canUndo/canRedo may have changed. */
  subscribeHistory(listener: () => void): () => void {
    this.historyListeners.add(listener);
    return () => this.historyListeners.delete(listener);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private record(change: BoardChange): void {
    if (change.origin === 'student') {
      if (this.tx) this.tx.push(change);
      else this.pushUndo([change]);
    }
    this.emit(change);
  }

  private pushUndo(changes: BoardChange[]): void {
    this.undoStack.push(changes);
    this.redoStack = [];
    this.emitHistory();
  }

  private emitHistory(): void {
    for (const listener of this.historyListeners) listener();
  }

  // Undo/redo write directly (bypassing record) so they don't touch the stacks, but still emit
  // as student changes: the AI should hear that the student undid something.
  private apply(c: BoardChange): void {
    if (c.kind === 'added') this.setRaw(c.element, { kind: 'added', element: c.element, origin: 'student' });
    else if (c.kind === 'removed') this.deleteRaw(c.element);
    else this.setRaw(c.after, { kind: 'updated', before: c.before, after: c.after, origin: 'student' });
  }

  private applyInverse(c: BoardChange): void {
    if (c.kind === 'added') this.deleteRaw(c.element);
    else if (c.kind === 'removed') this.setRaw(c.element, { kind: 'added', element: c.element, origin: 'student' });
    else this.setRaw(c.before, { kind: 'updated', before: c.after, after: c.before, origin: 'student' });
  }

  private setRaw(element: BoardElement, change: BoardChange): void {
    this.elements.set(element.id, element);
    this.emit(change);
  }

  private deleteRaw(element: BoardElement): void {
    if (!this.elements.delete(element.id)) return;
    this.emit({ kind: 'removed', element, origin: 'student' });
  }

  private emit(change: BoardChange): void {
    for (const listener of this.listeners) listener(change);
  }
}
