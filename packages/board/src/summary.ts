import type { Board } from './board';
import type { BoardElement, StrokeElement } from './elements';
import { union } from './geometry';
import { describeStructure } from './structure';
import { describeActivity } from './activity';
import { simFacts } from './simulation';

const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const r = (n: number) => Math.round(n);
export const letter = (i: number) => String.fromCharCode(65 + i);

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
      return `graph of ${el.content.functions.map((f) => `y = ${f.expression}`).join(', ')}${el.content.points?.length ? ` with points ${el.content.points.map((p) => p.label ?? `(${p.x},${p.y})`).join(', ')}` : ''}`;
    case 'structure':
      return `${el.content.title ? `"${clip(el.content.title, 40)}" ` : ''}${describeStructure(el.content)}`;
    case 'image':
      return `picture "${clip(el.content.title ?? el.content.caption ?? 'image', 60)}" (${el.content.provider})`;
    case 'sketch':
      return `sketch${el.content.title ? ` "${clip(el.content.title, 50)}"` : ''}${el.content.parts.length ? ` with parts ${el.content.parts.slice(0, 20).join(', ')}` : ''}`;
    case 'table':
      return `table${el.content.title ? ` "${clip(el.content.title, 40)}"` : ''} [${el.content.headers.join(' | ')}] with ${el.content.rows.length} rows`;
    case 'choice': {
      const picked = el.content.selected;
      return `multiple choice "${clip(el.content.question, 60)}" options [${el.content.choices.map((c, i) => `${letter(i)}) ${clip(c, 30)}`).join('; ')}]${picked === undefined ? ', not answered yet' : `, student picked ${letter(picked)}`}`;
    }
    case 'answer':
      return `answer box${el.content.question ? ` for #${el.content.question}` : ''}${el.content.submissions ? ' (submitted)' : ' (open)'}`;
    case 'code':
      return `${el.content.language} code "${clip(el.content.code.replace(/\s+/g, ' '))}"`;
    case 'annotation':
      return `${el.content.mode} on #${el.content.target}`;
    case 'activity':
      return describeActivity(el.content);
    case 'simulation': {
      const facts = Object.entries(simFacts(el.content.kind, el.content.params)).map(([k, v]) => `${k} ${+v.toFixed(2)}`).join(', ');
      return `${el.content.kind} simulation (${Object.entries(el.content.params).map(([k, v]) => `${k}=${v}`).join(', ')}; ${facts})`;
    }
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
