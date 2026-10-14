import { describe, expect, it } from 'vitest';
import { Board, type BoardChange, type TextElement } from './index';

const text = (id: string, value: string): TextElement => ({
  id,
  type: 'text',
  author: 'student',
  bounds: { x: 0, y: 0, width: 100, height: 20 },
  content: { text: value },
  createdAt: 1,
  updatedAt: 1,
});

describe('Board', () => {
  it('adds, updates and removes elements, emitting a change for each', () => {
    const board = new Board();
    const changes: BoardChange['kind'][] = [];
    board.subscribe((c) => changes.push(c.kind));

    board.add(text('a', '2x + 4 = 10'));
    board.update('a', { content: { text: '2x = 6' } }, 5);
    expect(board.get('a')).toMatchObject({ content: { text: '2x = 6' }, updatedAt: 5 });

    board.remove('a');
    expect(board.all()).toEqual([]);
    expect(changes).toEqual(['added', 'updated', 'removed']);
  });

  it('rejects duplicate ids', () => {
    const board = new Board();
    board.add(text('a', 'x'));
    expect(() => board.add(text('a', 'y'))).toThrow(/already exists/);
  });

  it('stops notifying after unsubscribe', () => {
    const board = new Board();
    let count = 0;
    const off = board.subscribe(() => count++);
    board.add(text('a', 'x'));
    off();
    board.remove('a');
    expect(count).toBe(1);
  });
});
