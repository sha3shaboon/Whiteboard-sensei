// DOM layer for rich content: text, math (KaTeX) and code. Positioned in world units inside a
// transformed container so it pans and zooms with the canvas.

import katex from 'katex';
import type { BoardElement, ChoiceElement, CodeElement, ImageElement, MathElement, SketchElement, TableElement, TextElement } from '../elements';

export type DomElement = TextElement | MathElement | CodeElement | TableElement | ChoiceElement | SketchElement | ImageElement;
export type DomContent =
  | { type: 'text'; content: TextElement['content'] }
  | { type: 'math'; content: MathElement['content'] }
  | { type: 'code'; content: CodeElement['content'] }
  | { type: 'table'; content: TableElement['content'] }
  | { type: 'choice'; content: ChoiceElement['content'] }
  | { type: 'sketch'; content: SketchElement['content'] }
  | { type: 'image'; content: ImageElement['content'] };

/** Inline math inside table cells / choices: text between $...$ is rendered with KaTeX. */
export function richText(text: string): string {
  return text
    .split(/(\$[^$]+\$)/g)
    .map((part) =>
      part.startsWith('$') && part.endsWith('$') && part.length > 2
        ? katex.renderToString(part.slice(1, -1), { throwOnError: false, output: 'html' })
        : escapeHtml(part),
    )
    .join('');
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const letter = (i: number) => String.fromCharCode(65 + i);

/** Max width before AI text and code wrap. */
export const MAX_BLOCK_WIDTH = 560;

export function isDomElement(el: BoardElement): el is DomElement {
  return el.type === 'text' || el.type === 'math' || el.type === 'code' || el.type === 'table' || el.type === 'choice' || el.type === 'sketch' || el.type === 'image';
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
    case 'sketch': {
      const c = el.content;
      // Markup was sanitized when the AI created it (sanitizeSvg); titles are escaped here.
      node.innerHTML =
        (c.title ? `<div style="font:600 15px system-ui,sans-serif;color:#2563eb;margin-bottom:4px">${escapeHtml(c.title)}</div>` : '') +
        c.svg +
        (c.credit ? `<div style="font:11px system-ui,sans-serif;color:#9a9a94;margin-top:4px">${escapeHtml(c.credit)}</div>` : '');
      const svg = node.querySelector('svg');
      if (svg) Object.assign(svg.style, { display: 'block', width: '100%', height: 'auto', overflow: 'visible' });
      Object.assign(node.style, { padding: '0' });
      break;
    }
    case 'image': {
      const c = el.content;
      const link = (href: string | undefined, text: string) =>
        href && /^https?:\/\//.test(href)
          ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:inherit;pointer-events:auto">${escapeHtml(text)}</a>`
          : escapeHtml(text);
      node.innerHTML =
        (c.title ? `<div style="font:600 15px system-ui,sans-serif;color:#2563eb;margin-bottom:4px">${escapeHtml(c.title)}</div>` : '') +
        `<div style="aspect-ratio:${c.width || 4} / ${c.height || 3};background:#f1f1ee;border-radius:6px;overflow:hidden">` +
        `<img src="${escapeHtml(c.url)}" alt="${escapeHtml(c.caption ?? c.title ?? '')}" referrerpolicy="no-referrer" draggable="false" style="display:block;width:100%;height:100%;object-fit:contain"></div>` +
        (c.caption ? `<div style="font:14px/1.35 system-ui,sans-serif;color:#1c1c1a;margin-top:6px">${escapeHtml(c.caption)}</div>` : '') +
        // Attribution as the licenses require: author, license (linked) and source (linked).
        `<div data-credit style="font:11px/1.4 system-ui,sans-serif;color:#8a8a84;margin-top:4px">${escapeHtml(c.author)} · ${link(c.licenseUrl, c.license)} · ${link(c.source, c.provider)}</div>`;
      const img = node.querySelector('img');
      // One retry (a busy image host can refuse a request), then a placeholder; the credit stays.
      let retried = false;
      if (img) img.onerror = () => {
        if (!retried) {
          retried = true;
          setTimeout(() => (img.src = `${c.url}${c.url.includes('?') ? '&' : '?'}retry=1`), 1500);
          return;
        }
        img.replaceWith(Object.assign(document.createElement('div'), { textContent: 'Image unavailable', style: 'padding:24px;color:#9a9a94;font:13px system-ui;text-align:center' }));
      };
      Object.assign(node.style, { padding: '0' });
      break;
    }
    case 'table': {
      const c = el.content;
      const cell = 'border:1px solid #d9dfee;padding:6px 12px;text-align:left;vertical-align:top;';
      node.innerHTML =
        (c.title ? `<div style="font-weight:600;margin:0 0 6px;color:${c.color}">${richText(c.title)}</div>` : '') +
        `<table style="border-collapse:collapse;font:15px/1.4 system-ui,sans-serif;color:#1c1c1a;background:#fff">` +
        `<thead><tr>${c.headers.map((h) => `<th style="${cell}background:#eef3fd;color:${c.color};font-weight:600">${richText(h)}</th>`).join('')}</tr></thead>` +
        `<tbody>${c.rows.map((r) => `<tr>${c.headers.map((_, i) => `<td style="${cell}">${richText(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      Object.assign(node.style, { padding: '2px' });
      break;
    }
    case 'choice': {
      const c = el.content;
      node.innerHTML =
        `<div style="font-weight:600;margin-bottom:10px;line-height:1.35">${richText(c.question)}</div>` +
        c.choices
          .map((choice, i) => {
            const on = c.selected === i;
            return `<button type="button" data-choice="${i}" style="display:flex;gap:10px;align-items:center;width:100%;text-align:left;margin:6px 0 0;padding:8px 12px;border-radius:8px;cursor:pointer;font:15px/1.35 system-ui,sans-serif;border:1.5px solid ${on ? '#2563eb' : '#d9dfee'};background:${on ? '#e8efff' : '#fff'};color:#1c1c1a"><b style="color:#2563eb">${letter(i)}</b><span>${richText(choice)}</span></button>`;
          })
          .join('');
      Object.assign(node.style, {
        font: '16px system-ui, sans-serif',
        color: '#1c1c1a',
        background: '#fbfcff',
        border: '1.5px solid #2563eb',
        borderRadius: '12px',
        padding: '14px 16px',
        boxShadow: '0 2px 10px rgba(37,99,235,0.08)',
      });
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
