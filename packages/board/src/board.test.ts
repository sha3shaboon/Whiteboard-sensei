import { describe, expect, it } from 'vitest';
import { Board, type BoardChange, type TextElement } from './index';

export const text = (id: string, value: string, x = 0, y = 0, author: 'student' | 'ai' = 'student'): TextElement => ({
  id,
  type: 'text',
  author,
  bounds: { x, y, width: 100, height: 20 },
  content: { text: value, fontSize: 18, color: '#000' },
  createdAt: 1,
  updatedAt: 1,
});

describe('Board', () => {
  it('adds, updates and removes elements, emitting a change with its origin', () => {
    const board = new Board(() => 5);
    const changes: string[] = [];
    board.subscribe((c) => changes.push(`${c.kind}:${c.origin}`));

    board.add(text('1', '2x + 4 = 10'));
    board.update('1', { content: { text: '2x = 6' } as TextElement['content'] }, 'ai');
    expect(board.get('1')).toMatchObject({ content: { text: '2x = 6', fontSize: 18 }, updatedAt: 5 });
    board.remove('1', 'system');
    expect(board.all()).toEqual([]);
    expect(changes).toEqual(['added:student', 'updated:ai', 'removed:system']);
  });

  it('rejects duplicate ids and keeps nextId ahead of added ids', () => {
    const board = new Board();
    board.add(text('7', 'x'));
    expect(() => board.add(text('7', 'y'))).toThrow(/already exists/);
    expect(board.nextId()).toBe('8');
  });

  it('undoes and redoes student changes only, as one step per transaction', () => {
    const board = new Board();
    board.add(text('1', 'ai text'), 'ai');
    board.transact(() => {
      board.add(text('2', 'a'));
      board.add(text('3', 'b'));
    });
    board.remove('1');
    expect(board.all().map((e) => e.id)).toEqual(['2', '3']);

    board.undo(); // restores the AI element the student erased
    expect(board.all().map((e) => e.id).sort()).toEqual(['1', '2', '3']);
    board.undo(); // removes both elements added in the transaction
    expect(board.all().map((e) => e.id)).toEqual(['1']);
    expect(board.canUndo()).toBe(false);

    board.redo();
    expect(board.all().map((e) => e.id).sort()).toEqual(['1', '2', '3']);
  });

  it('reports undo/redo as student changes', () => {
    const board = new Board();
    board.add(text('1', 'a'));
    const seen: BoardChange[] = [];
    board.subscribe((c) => seen.push(c));
    board.undo();
    expect(seen).toMatchObject([{ kind: 'removed', origin: 'student' }]);
  });
});

describe('Board history notifications', () => {
  it('notifies after the stacks change, so canUndo/canRedo are current', () => {
    const board = new Board();
    const seen: string[] = [];
    board.subscribeHistory(() => seen.push(`${board.canUndo()}/${board.canRedo()}`));
    board.transact(() => board.add(text('1', 'a')));
    board.undo();
    board.redo();
    expect(seen).toEqual(['true/false', 'false/true', 'true/false']);
  });
});
