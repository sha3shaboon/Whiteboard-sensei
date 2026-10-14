import type { ElementPatch } from './board';
import type { BoardElement } from './elements';

/** Patch that moves an element by (dx, dy), including point data inside its content. */
export function translated(el: BoardElement, dx: number, dy: number): ElementPatch {
  const bounds = { ...el.bounds, x: el.bounds.x + dx, y: el.bounds.y + dy };
  switch (el.type) {
    case 'stroke':
      return { bounds, content: { ...el.content, points: el.content.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) } };
    case 'arrow':
      return {
        bounds,
        content: { ...el.content, from: { x: el.content.from.x + dx, y: el.content.from.y + dy }, to: { x: el.content.to.x + dx, y: el.content.to.y + dy } },
      };
    default:
      return { bounds };
  }
}
