// The AI's whiteboard commands (function calls) and how they're executed on the board.
// Placement is relative ("below #12"); the board computes exact positions and avoids overlap.

import { COLORS, center, compileExpression, resolvePlacement, type Board, type BoardElement, type Bounds, type Point, type Region } from '@ai-tutor/board';
import type { BoardView } from '@ai-tutor/board/view';
import type { ToolDefinition } from './realtime';

const placement = {
  type: 'string',
  description: 'Where to put it, relative to existing items: "below #12", "right of #7", "above #3", "new section", or omit to continue under your last item.',
};

export const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    name: 'write_text',
    description: 'Write a short text block on the whiteboard (a heading, a step label, a key idea). Keep it short; say details aloud.',
    parameters: { type: 'object', properties: { text: { type: 'string' }, placement }, required: ['text'] },
  },
  {
    type: 'function',
    name: 'write_math',
    description: 'Write a math expression or equation on the whiteboard. Use one call per line/step.',
    parameters: { type: 'object', properties: { latex: { type: 'string', description: 'LaTeX without $ delimiters' }, placement }, required: ['latex'] },
  },
  {
    type: 'function',
    name: 'write_code',
    description: 'Write a code snippet on the whiteboard.',
    parameters: { type: 'object', properties: { code: { type: 'string' }, language: { type: 'string' }, placement }, required: ['code'] },
  },
  {
    type: 'function',
    name: 'plot_function',
    description: 'Draw a graph of y = f(x). Expression uses x, + - * / ^, sin cos tan sqrt abs ln log exp, pi, e. Example: "x^2 - 4x + 3".',
    parameters: {
      type: 'object',
      properties: { expression: { type: 'string' }, x_min: { type: 'number' }, x_max: { type: 'number' }, placement },
      required: ['expression'],
    },
  },
  {
    type: 'function',
    name: 'draw_shape',
    description: 'Draw a labeled box or circle, e.g. for diagrams (a cell, a node in a flow, a planet).',
    parameters: {
      type: 'object',
      properties: {
        shape: { type: 'string', enum: ['rectangle', 'ellipse'] },
        label: { type: 'string' },
        width: { type: 'number', description: 'Default 160' },
        height: { type: 'number', description: 'Default 80' },
        placement,
      },
      required: ['shape'],
    },
  },
  {
    type: 'function',
    name: 'draw_arrow',
    description: 'Draw an arrow from one item to another (by id), optionally labeled.',
    parameters: { type: 'object', properties: { from_id: { type: 'string' }, to_id: { type: 'string' }, label: { type: 'string' } }, required: ['from_id', 'to_id'] },
  },
  {
    type: 'function',
    name: 'annotate',
    description:
      "Point at, circle or highlight an existing item, including the student's handwriting. Use region to target part of it, as fractions of its bounding box: {x0:0.6,x1:0.8,y0:0,y1:1} is the right part. Add a short note if useful.",
    parameters: {
      type: 'object',
      properties: {
        target_id: { type: 'string' },
        mode: { type: 'string', enum: ['circle', 'highlight', 'point'] },
        region: { type: 'object', properties: { x0: { type: 'number' }, x1: { type: 'number' }, y0: { type: 'number' }, y1: { type: 'number' } } },
        note: { type: 'string' },
      },
      required: ['target_id', 'mode'],
    },
  },
  {
    type: 'function',
    name: 'erase',
    description: 'Erase one of your own items (by id). Do not erase the student\'s work unless they ask.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
];

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const id = (v: unknown) => str(v).replace(/^#/, '');

export interface ToolResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** Executes one AI tool call against the board. */
export function executeTool(board: Board, view: BoardView, name: string, args: Args): ToolResult {
  const now = Date.now();
  const base = { author: 'ai' as const, createdAt: now, updatedAt: now };

  const place = (el: Omit<BoardElement, 'bounds' | 'id'> & { size: { width: number; height: number } }): ToolResult => {
    const pos = resolvePlacement(board, el.size, str(args.placement) || undefined, view.getViewport());
    const { size, ...rest } = el;
    const element = { ...rest, id: board.nextId(), bounds: { ...pos, ...size } } as BoardElement;
    board.add(element, 'ai');
    view.ensureVisible(element.bounds);
    return { ok: true, id: `#${element.id}` };
  };

  switch (name) {
    case 'write_text': {
      const content = { text: str(args.text), fontSize: 22, color: COLORS.aiInk };
      return place({ ...base, type: 'text', content, size: view.measure({ type: 'text', content }) });
    }
    case 'write_math': {
      const content = { latex: str(args.latex), fontSize: 26, color: COLORS.aiInk };
      return place({ ...base, type: 'math', content, size: view.measure({ type: 'math', content }) });
    }
    case 'write_code': {
      const content = { code: str(args.code), language: str(args.language) || 'text' };
      return place({ ...base, type: 'code', content, size: view.measure({ type: 'code', content }) });
    }
    case 'plot_function': {
      const expression = str(args.expression);
      try {
        compileExpression(expression);
      } catch (err) {
        return { ok: false, error: `Can't plot: ${(err as Error).message}. Use x, + - * / ^ and sin cos tan sqrt abs ln log exp.` };
      }
      const x0 = num(args.x_min, -10), x1 = num(args.x_max, 10);
      if (!(x1 > x0)) return { ok: false, error: 'x_max must be greater than x_min' };
      return place({ ...base, type: 'graph', content: { expression, xRange: [x0, x1], color: COLORS.aiInk }, size: { width: 420, height: 280 } });
    }
    case 'draw_shape': {
      const shape = args.shape === 'ellipse' ? 'ellipse' : 'rectangle';
      const size = { width: Math.min(800, Math.max(40, num(args.width, 160))), height: Math.min(600, Math.max(30, num(args.height, 80))) };
      return place({ ...base, type: 'shape', content: { shape, color: COLORS.aiInk, label: str(args.label) || undefined }, size });
    }
    case 'draw_arrow': {
      const a = board.get(id(args.from_id)), b = board.get(id(args.to_id));
      if (!a || !b) return { ok: false, error: `Unknown item ${!a ? args.from_id : args.to_id}` };
      const from = edgePoint(a.bounds, center(b.bounds));
      const to = edgePoint(b.bounds, center(a.bounds));
      const bounds = { x: Math.min(from.x, to.x) - 8, y: Math.min(from.y, to.y) - 8, width: Math.abs(to.x - from.x) + 16, height: Math.abs(to.y - from.y) + 16 };
      const el = { ...base, id: board.nextId(), type: 'arrow' as const, bounds, content: { from, to, color: COLORS.aiInk, label: str(args.label) || undefined } };
      board.add(el, 'ai');
      return { ok: true, id: `#${el.id}` };
    }
    case 'annotate': {
      const target = board.get(id(args.target_id));
      if (!target) return { ok: false, error: `Unknown item ${args.target_id}` };
      const r = (args.region ?? {}) as Partial<Region>;
      const region = { x0: clamp01(num(r.x0, 0)), x1: clamp01(num(r.x1, 1)), y0: clamp01(num(r.y0, 0)), y1: clamp01(num(r.y1, 1)) };
      const mode = args.mode === 'highlight' || args.mode === 'point' ? args.mode : 'circle';
      const el = {
        ...base, id: board.nextId(), type: 'annotation' as const, bounds: target.bounds,
        content: { target: target.id, mode, region, color: COLORS.annotation, note: str(args.note) || undefined },
      } satisfies BoardElement;
      board.add(el, 'ai');
      view.ensureVisible(target.bounds);
      return { ok: true, id: `#${el.id}` };
    }
    case 'erase': {
      const el = board.get(id(args.id));
      if (!el) return { ok: false, error: `Unknown item ${args.id}` };
      board.remove(el.id, 'ai');
      for (const a of board.all()) if (a.type === 'annotation' && a.content.target === el.id) board.remove(a.id, 'ai');
      return { ok: true };
    }
    default:
      return { ok: false, error: `Unknown tool ${name}` };
  }
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Where the line from the box's center toward `toward` leaves the box. */
function edgePoint(b: Bounds, toward: Point): Point {
  const c = center(b);
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx !== 0 ? b.width / 2 / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? b.height / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}
