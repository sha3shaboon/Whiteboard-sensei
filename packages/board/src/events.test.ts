import { describe, expect, it } from 'vitest';
import { Board, StudentEventGrouper, boardSummary, type StrokeElement, type StudentEvent } from './index';
import { text } from './board.test';

const stroke = (id: string, x: number): StrokeElement => ({
  id,
  type: 'stroke',
  author: 'student',
  bounds: { x, y: 0, width: 10, height: 10 },
  content: { points: [{ x, y: 0, pressure: 0.5 }, { x: x + 10, y: 10, pressure: 0.5 }], color: '#000', width: 2 },
  createdAt: 1,
  updatedAt: 1,
});

function setup() {
  const board = new Board();
  const events: StudentEvent[] = [];
  let fire: (() => void) | null = null;
  const grouper = new StudentEventGrouper(board, (e) => events.push(e), {
    setTimer: (fn) => (fire = fn),
    clearTimer: () => (fire = null),
  });
  return { board, events, grouper, idle: () => fire?.() };
}

describe('StudentEventGrouper', () => {
  it('groups strokes until the pen is idle', () => {
    const { board, events, idle } = setup();
    board.add(text('1', 'Solve 2x+4=10', 0, -40, 'ai'), 'ai');
    board.add(stroke('2', 0), 'student');
    board.add(stroke('3', 12), 'student');
    expect(events).toEqual([]);
    idle();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'student_wrote', bounds: { x: 0, width: 22 }, near: '#1 (ai text "Solve 2x+4=10")' });
  });

  it('ignores AI and system changes', () => {
    const { board, events, idle } = setup();
    board.add(text('1', 'x', 0, 0, 'ai'), 'ai');
    board.add(stroke('2', 0), 'system');
    idle();
    expect(events).toEqual([]);
  });

  it('flushes handwriting before other actions, and classifies edits, moves and erases', () => {
    const { board, events } = setup();
    board.add(text('1', 'ai step', 0, 0, 'ai'), 'ai');
    board.add(stroke('2', 300));
    board.update('1', { bounds: { x: 50, y: 50, width: 100, height: 20 } });
    board.update('1', { content: { text: 'changed', fontSize: 18, color: '#000' } });
    board.remove('1');
    expect(events.map((e) => e.type)).toEqual(['student_wrote', 'student_moved', 'student_edited', 'student_erased']);
  });

  it('drops strokes erased before the group ends', () => {
    const { board, events, idle } = setup();
    board.add(stroke('1', 0));
    board.add(stroke('2', 20));
    board.remove('2');
    idle();
    expect((events[0] as Extract<StudentEvent, { type: 'student_wrote' }>).strokes.map((s) => s.id)).toEqual(['1']);
  });
});

describe('boardSummary', () => {
  it('lists elements and merges recognized handwriting groups', () => {
    const board = new Board();
    board.add(text('1', 'Solve', 0, 0, 'ai'), 'ai');
    const a = stroke('2', 0), b = stroke('3', 10);
    a.content.recognized = b.content.recognized = '2x=6';
    board.add(a);
    board.add(b);
    expect(boardSummary(board)).toBe(
      'Board (2 items):\n#1 ai text "Solve" at (0,0) 100x20\n#2-#3 student handwriting "2x=6" at (0,0) 20x10',
    );
  });
});

describe('boardSummary grouping', () => {
  it('merges consecutive unread strokes and keeps separate readings apart', () => {
    const board = new Board();
    board.add(stroke('1', 0));
    board.add(stroke('2', 20));
    const c = stroke('3', 100), d = stroke('4', 200);
    c.content.recognized = 'x=1';
    d.content.recognized = 'x=1';
    board.add(c);
    board.add(text('5', 'between', 150, 0));
    board.add(d);
    const lines = boardSummary(board).split('\n');
    expect(lines[0]).toBe('Board (4 items):');
    expect(lines[1]).toMatch(/^#1-#2 student handwriting \(sent to you as an image\)/);
    expect(lines[2]).toMatch(/^#3 student handwriting "x=1"/);
    expect(lines[4]).toMatch(/^#4 student handwriting "x=1"/);
  });
});
