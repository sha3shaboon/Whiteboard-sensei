// DOM layer for rich content: text, math (KaTeX) and code. Positioned in world units inside a
// transformed container so it pans and zooms with the canvas.

import katex from 'katex';
import type { BoardElement, CodeElement, MathElement, TextElement } from '../elements';

export type DomElement = TextElement | MathElement | CodeElement;
export type DomContent =
  | { type: 'text'; content: TextElement['content'] }
  | { type: 'math'; content: MathElement['content'] }
  | { type: 'code'; content: CodeElement['content'] };

/** Max width before AI text and code wrap. */
export const MAX_BLOCK_WIDTH = 560;

export function isDomElement(el: BoardElement): el is DomElement {
  return el.type === 'text' || el.type === 'math' || el.type === 'code';
}

/** Fills `node` with the rendered content; returns nothing, styles are inline so measuring works off-board. */
export function renderDomContent(node: HTMLElement, el: DomContent): void {
  node.className = `board-dom board-${el.type}`;
  node.style.position = 'absolute';
  node.style.boxSizing = 'border-box';
  node.style.margin = '0';
  switch (el.type) {
    case 'text':
      node.textContent = el.content.text;
      Object.assign(node.style, {
        font: `${el.content.fontSize}px/1.35 system-ui, -apple-system, sans-serif`,
        color: el.content.color,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        padding: '2px 4px',
      });
      break;
    case 'math':
      node.innerHTML = katex.renderToString(`\\displaystyle ${el.content.latex}`, { throwOnError: false, output: 'html' });
      Object.assign(node.style, { fontSize: `${el.content.fontSize}px`, color: el.content.color, whiteSpace: 'nowrap', padding: '4px 6px' });
      break;
    case 'code': {
      const pre = document.createElement('pre');
      pre.textContent = el.content.code;
      Object.assign(pre.style, { margin: '0', font: '14px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap' });
      node.replaceChildren(pre);
      Object.assign(node.style, { background: '#f4f4f1', border: '1px solid #e2e2de', borderRadius: '6px', padding: '8px 12px', color: '#1c1c1a' });
      break;
    }
  }
}

/** Measures content in world units using a hidden node. */
export class Measurer {
  private host: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.host = document.createElement('div');
    Object.assign(this.host.style, { position: 'absolute', left: '-10000px', top: '0', visibility: 'hidden', pointerEvents: 'none' });
    parent.appendChild(this.host);
  }

  measure(el: DomContent, maxWidth = MAX_BLOCK_WIDTH): { width: number; height: number } {
    const node = document.createElement('div');
    renderDomContent(node, el);
    node.style.position = 'static';
    node.style.display = 'inline-block';
    node.style.maxWidth = `${maxWidth}px`;
    this.host.replaceChildren(node);
    const r = node.getBoundingClientRect();
    this.host.replaceChildren();
    return { width: Math.ceil(r.width) + 1, height: Math.ceil(r.height) + 1 };
  }

  destroy(): void {
    this.host.remove();
  }
}
