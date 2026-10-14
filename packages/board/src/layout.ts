import type { Board } from './board';
import type { Bounds } from './elements';
import { intersects, union } from './geometry';

export const GAP = 24;
const SECTION_GAP = 56;
/** Side-by-side items leave room for an arrow and its label between them. */
const SIDE_GAP = 64;

export interface Size {
  width: number;
  height: number;
}

/**
 * Turns a relative placement ("below #12", "right of #7", "new section", "") into an exact position
 * for a new AI block, then slides it down until it overlaps nothing. See spec § AI actions.
 * `viewport` (world coords) is used when the board is empty.
 */
export function resolvePlacement(board: Board, size: Size, placement: string | undefined, viewport?: Bounds): { x: number; y: number } {
  const blockers = board.all().filter((e) => e.type !== 'annotation').map((e) => e.bounds);
  const content = union(blockers);
  const origin = viewport ? { x: viewport.x + 48, y: viewport.y + 48 } : { x: 48, y: 48 };

  let x = origin.x;
  let y = origin.y;
  let direction: 'down' | 'right' = 'down';

  const p = (placement ?? '').toLowerCase().trim();
  const ref = /(below|under|beneath|above|right of|left of|next to|beside)\s*(?:element\s*)?#?(\d+)/.exec(p);
  const target = ref ? board.get(ref[2]!) : undefined;

  if (target) {
    const t = target.bounds;
    switch (ref![1]) {
      case 'above':
        x = t.x;
        y = t.y - GAP - size.height;
        break;
      case 'right of':
      case 'next to':
      case 'beside':
        x = t.x + t.width + SIDE_GAP;
        y = t.y;
        direction = 'right';
        break;
      case 'left of':
        x = t.x - SIDE_GAP - size.width;
        y = t.y;
        break;
      default:
        x = t.x;
        y = t.y + t.height + GAP;
    }
  } else if (content && p.includes('new section')) {
    x = content.x;
    y = content.y + content.height + SECTION_GAP;
  } else if (content) {
    // Default: continue under the AI's most recent block, else under everything.
    const lastAi = [...board.all()].reverse().find((e) => e.author === 'ai' && e.type !== 'annotation' && e.type !== 'arrow');
    // Use the whole row the last item sits in (e.g. a step's equation and its note), so we continue
    // under the row's left edge rather than under whatever happened to be added last.
    const anchor = lastAi ? rowOf(board, lastAi.bounds) : content;
    x = anchor.x;
    y = anchor.y + anchor.height + GAP;
  }

  return avoidOverlap({ x, y, ...size }, blockers, direction);
}

/** Union of AI items vertically overlapping `b` (its row), within 900 units horizontally. */
function rowOf(board: Board, b: Bounds): Bounds {
  const row = board
    .all()
    .filter((e) => e.author === 'ai' && e.type !== 'annotation' && e.type !== 'arrow')
    .map((e) => e.bounds)
    .filter((o) => o.y < b.y + b.height && b.y < o.y + o.height && Math.abs(o.x - b.x) < 900);
  return union(row) ?? b;
}

/** Slides the box (down, or right then down) until it overlaps none of the blockers. */
export function avoidOverlap(box: Bounds, blockers: Bounds[], direction: 'down' | 'right' = 'down'): { x: number; y: number } {
  const b = { ...box };
  for (let i = 0; i < 200; i++) {
    const hit = blockers.find((o) => intersects(b, o, GAP / 2));
    if (!hit) return { x: b.x, y: b.y };
    if (direction === 'right' && i < 20) b.x = hit.x + hit.width + GAP;
    else b.y = hit.y + hit.height + GAP;
  }
  return { x: b.x, y: b.y };
}
