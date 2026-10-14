import type { Board } from './board';
import type { BoardElement, StrokeElement } from './elements';
import { union } from './geometry';

const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const r = (n: number) => Math.round(n);

/** What an element says, in a few words, for the AI. */
export function describeContent(el: BoardElement): string {
  switch (el.type) {
    case 'stroke':
      return el.content.recognized ? `handwriting "${clip(el.content.recognized)}"` : el.content.highlighter ? 'highlighter mark' : 'handwriting (sent to you as an image)';
    case 'text':
      return `text "${clip(el.content.text)}"`;
    case 'math':
      return `math "${clip(el.content.latex)}"`;
    case 'shape':
      return `${el.content.shape}${el.content.label ? ` "${clip(el.content.label)}"` : ''}`;
    case 'arrow':
      return `arrow${el.content.label ? ` "${clip(el.content.label)}"` : ''}`;
    case 'graph':
      return `graph of y = ${el.content.expression}`;
    case 'code':
      return `${el.content.language} code "${clip(el.content.code.replace(/\s+/g, ' '))}"`;
    case 'annotation':
      return `${el.content.mode} on #${el.content.target}`;
  }
}

/** One line: "#12 ai math "x^2" at (100,200) 140x40". */
export function describeElement(el: BoardElement): string {
  const b = el.bounds;
  return `#${el.id} ${el.author} ${describeContent(el)} at (${r(b.x)},${r(b.y)}) ${r(b.width)}x${r(b.height)}`;
}

/**
 * Compact board state for the AI's context. Consecutive handwriting strokes with the same reading
 * are merged into one line, so a written equation is one entry, not 30 strokes.
 */
export function boardSummary(board: Board, maxLines = 60): string {
  const lines: string[] = [];
  const all = board.all();
  for (let i = 0; i < all.length; i++) {
    const el = all[i]!;
    if (el.type !== 'stroke' || el.content.highlighter) {
      lines.push(describeElement(el));
      continue;
    }
    const group: StrokeElement[] = [el];
    while (i + 1 < all.length) {
      const next = all[i + 1]!;
      if (next.type !== 'stroke' || next.content.highlighter || next.author !== el.author || next.content.recognized !== el.content.recognized) break;
      group.push(next);
      i++;
    }
    const b = union(group.map((s) => s.bounds))!;
    const ids = group.length > 1 ? `#${group[0]!.id}-#${group.at(-1)!.id}` : `#${el.id}`;
    lines.push(`${ids} ${el.author} ${describeContent(el)} at (${r(b.x)},${r(b.y)}) ${r(b.width)}x${r(b.height)}`);
  }
  if (!lines.length) return 'The board is empty.';
  const hidden = Math.max(0, lines.length - maxLines);
  const shown = lines.slice(-maxLines);
  return [`Board (${lines.length} items${hidden ? `, oldest ${hidden} omitted` : ''}):`, ...shown].join('\n');
}
