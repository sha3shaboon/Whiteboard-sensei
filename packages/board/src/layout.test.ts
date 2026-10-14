import { describe, expect, it } from 'vitest';
import { Board, intersects, resolvePlacement } from './index';
import { text } from './board.test';

const size = { width: 120, height: 40 };

describe('resolvePlacement', () => {
  it('places below and right of a referenced element', () => {
    const board = new Board();
    board.add(text('1', 'a', 100, 100));
    expect(resolvePlacement(board, size, 'below #1')).toEqual({ x: 100, y: 144 });
    expect(resolvePlacement(board, size, 'right of #1')).toEqual({ x: 264, y: 100 });
  });

  it('never overlaps existing content', () => {
    const board = new Board();
    board.add(text('1', 'a', 100, 100, 'ai'));
    board.add(text('2', 'student work', 100, 150)); // right where "below #1" would go
    const pos = resolvePlacement(board, size, 'below #1');
    for (const el of board.all()) expect(intersects({ ...pos, ...size }, el.bounds)).toBe(false);
  });

  it('continues under the last AI block by default and starts new sections below everything', () => {
    const board = new Board();
    board.add(text('1', 'ai', 50, 50, 'ai'));
    board.add(text('2', 'student', 400, 300));
    expect(resolvePlacement(board, size, undefined)).toEqual({ x: 50, y: 94 });
    expect(resolvePlacement(board, size, 'new section').y).toBeGreaterThan(320);
  });

  it('uses the viewport when the board is empty', () => {
    const pos = resolvePlacement(new Board(), size, undefined, { x: 1000, y: 500, width: 800, height: 600 });
    expect(pos).toEqual({ x: 1048, y: 548 });
  });
});
