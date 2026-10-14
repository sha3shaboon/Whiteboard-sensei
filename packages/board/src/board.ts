import type { BoardElement, ElementId } from './elements';

export type BoardChange =
  | { kind: 'added'; element: BoardElement }
  | { kind: 'updated'; before: BoardElement; after: BoardElement }
  | { kind: 'removed'; element: BoardElement };

type Listener = (change: BoardChange) => void;

/** In-memory element store. Framework-independent; renderers and the AI bridge subscribe to changes. */
export class Board {
  private elements = new Map<ElementId, BoardElement>();
  private listeners = new Set<Listener>();

  get(id: ElementId): BoardElement | undefined {
    return this.elements.get(id);
  }

  all(): BoardElement[] {
    return [...this.elements.values()];
  }

  add(element: BoardElement): void {
    if (this.elements.has(element.id)) throw new Error(`Element ${element.id} already exists`);
    this.elements.set(element.id, element);
    this.emit({ kind: 'added', element });
  }

  update(id: ElementId, patch: Partial<Omit<BoardElement, 'id' | 'type'>>, now = Date.now()): void {
    const before = this.elements.get(id);
    if (!before) throw new Error(`Element ${id} not found`);
    const after = { ...before, ...patch, updatedAt: now } as BoardElement;
    this.elements.set(id, after);
    this.emit({ kind: 'updated', before, after });
  }

  remove(id: ElementId): void {
    const element = this.elements.get(id);
    if (!element) return;
    this.elements.delete(id);
    this.emit({ kind: 'removed', element });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(change: BoardChange): void {
    for (const listener of this.listeners) listener(change);
  }
}
