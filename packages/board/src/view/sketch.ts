// Sketches: free-form illustrations the AI writes as SVG (a coil of wire, a magnet over a plate,
// forces on a block, a cell...). The markup is sanitized to a small drawing-only subset, ids are
// namespaced per sketch, and parts are drawn in stroke by stroke like a hand-drawn figure.

const SVG_NS = 'http://www.w3.org/2000/svg';

const TAGS = new Set([
  'svg', 'g', 'path', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'rect', 'text', 'tspan',
  'defs', 'marker', 'lineargradient', 'radialgradient', 'stop', 'title', 'desc',
]);

const ATTRS = new Set([
  'id', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'dx', 'dy', 'width', 'height', 'points',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity',
  'opacity', 'transform', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing',
  'marker-end', 'marker-start', 'marker-mid', 'viewbox', 'refx', 'refy', 'markerwidth', 'markerheight', 'orient', 'markerunits',
  'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform',
]);

const DRAWABLE = new Set(['path', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'rect']);

/** Arrowheads every sketch can use: marker-end="url(#arrow)" (also arrow-red, arrow-blue, arrow-green, arrow-orange). */
const MARKERS: Record<string, string> = { arrow: '#1c1c1a', 'arrow-red': '#dc2626', 'arrow-blue': '#2563eb', 'arrow-green': '#16a34a', 'arrow-orange': '#ea580c' };

const MAX_MARKUP = 40_000;
const MAX_NODES = 600;

export interface SanitizedSketch {
  svg: string;
  /** viewBox size */
  vw: number;
  vh: number;
  /** The author's ids for the parts, so the AI can refer to them and updates can keep them. */
  parts: string[];
}

export function sanitizeSvg(markup: string, prefix: string): SanitizedSketch | { error: string } {
  if (markup.length > MAX_MARKUP) return { error: `SVG too large (max ${MAX_MARKUP} characters)` };
  const doc = new DOMParser().parseFromString(markup.trim(), 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) {
    return { error: 'Invalid SVG: send one <svg viewBox="0 0 W H">…</svg> element' };
  }

  const vb = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  let vw = vb.length === 4 && vb[2]! > 0 ? vb[2]! : Number.parseFloat(root.getAttribute('width') ?? '') || 400;
  let vh = vb.length === 4 && vb[3]! > 0 ? vb[3]! : Number.parseFloat(root.getAttribute('height') ?? '') || 300;
  const minX = vb.length === 4 && Number.isFinite(vb[0]) ? vb[0]! : 0;
  const minY = vb.length === 4 && Number.isFinite(vb[1]) ? vb[1]! : 0;
  vw = Math.min(Math.max(vw, 10), 5000);
  vh = Math.min(Math.max(vh, 10), 5000);

  let count = 0;
  const ids = new Set<string>(Object.keys(MARKERS));
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      if (!TAGS.has(child.nodeName.toLowerCase()) || ++count > MAX_NODES) {
        child.remove();
        continue;
      }
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase();
        const value = attr.value;
        const bad =
          !ATTRS.has(name) ||
          /javascript:|expression\(|@import/i.test(value) ||
          (/url\(/i.test(value) && !/^\s*url\(\s*#[\w-]+\s*\)\s*$/.test(value));
        if (bad) child.removeAttribute(attr.name);
      }
      const id = child.getAttribute('id');
      if (id) ids.add(id);
      walk(child);
    }
  };
  walk(root);
  for (const attr of [...root.attributes]) root.removeAttribute(attr.name);

  // Namespace ids so several sketches on the board never collide; remember the author's ids.
  const parts: string[] = [];
  const all = [root, ...root.querySelectorAll('*')];
  for (const el of all) {
    const id = el.getAttribute('id');
    if (id) {
      if (!MARKERS[id]) parts.push(id);
      el.setAttribute('id', `${prefix}${id}`);
      el.setAttribute('data-k', id);
    }
    for (const attr of [...el.attributes]) {
      if (/url\(/.test(attr.value)) {
        attr.value = attr.value.replace(/url\(\s*#([\w-]+)\s*\)/g, (m, ref: string) => (ids.has(ref) ? `url(#${prefix}${ref})` : 'none'));
      }
    }
  }

  // Built-in arrowheads (only those not defined by the author).
  const defs = doc.createElementNS(SVG_NS, 'defs');
  for (const [name, color] of Object.entries(MARKERS)) {
    if (root.querySelector(`[data-k="${name}"]`)) continue;
    const m = doc.createElementNS(SVG_NS, 'marker');
    m.setAttribute('id', `${prefix}${name}`);
    for (const [k, v] of Object.entries({ viewBox: '0 0 10 10', refX: '8.5', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' })) m.setAttribute(k, v);
    const p = doc.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', 'M0 0L10 5L0 10z');
    p.setAttribute('fill', color);
    p.setAttribute('stroke', 'none'); // don't inherit the sketch's outline stroke
    m.appendChild(p);
    defs.appendChild(m);
  }
  root.insertBefore(defs, root.firstChild);

  root.setAttribute('xmlns', SVG_NS);
  root.setAttribute('viewBox', `${minX} ${minY} ${vw} ${vh}`);
  root.setAttribute('width', '100%');
  root.setAttribute('height', '100%');
  root.setAttribute('fill', 'none');
  root.setAttribute('stroke', '#1c1c1a');
  root.setAttribute('stroke-width', '2');
  root.setAttribute('stroke-linecap', 'round');
  root.setAttribute('stroke-linejoin', 'round');
  root.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
  root.setAttribute('font-size', '14');
  // Text defaults to filled, not outlined.
  for (const t of root.querySelectorAll('text')) {
    if (!t.getAttribute('fill')) t.setAttribute('fill', '#1c1c1a');
    if (!t.getAttribute('stroke')) t.setAttribute('stroke', 'none');
  }
  return { svg: new XMLSerializer().serializeToString(root), vw, vh, parts };
}

/** Identity of a part for update diffs: the author's id, else its markup. */
function partKey(el: Element): string {
  return el.getAttribute('data-k') ?? el.outerHTML;
}

/** Keys of the parts currently drawn in a sketch node (before it re-renders). */
export function sketchKeys(node: HTMLElement): Set<string> {
  return new Set([...node.querySelectorAll('svg *')].map(partKey));
}

/**
 * Draws a sketch in: each new stroke traces along its length, fills fade in after their outline,
 * text fades in, one part after another. Parts listed in `existing` (unchanged on an update) stay.
 */
export function animateSketch(node: HTMLElement, existing: Set<string> = new Set()): void {
  const svg = node.querySelector('svg');
  if (!svg || typeof (svg as SVGSVGElement).animate !== 'function') return;
  const parts = [...svg.querySelectorAll('path, line, polyline, polygon, circle, ellipse, rect, text')].filter(
    (el) => {
      const parent = el.parentNode as Element | null;
      return !el.closest('defs') && !existing.has(partKey(el)) && !(parent && parent !== svg && existing.has(partKey(parent)));
    },
  );
  const stagger = Math.min(180, 3000 / Math.max(parts.length, 1));
  parts.forEach((el, i) => {
    const delay = i * stagger;
    const e = el as SVGGeometryElement;
    if (DRAWABLE.has(el.nodeName.toLowerCase()) && !el.getAttribute('stroke-dasharray') && typeof e.getTotalLength === 'function') {
      let len = 0;
      try {
        len = e.getTotalLength();
      } catch {
        len = 0;
      }
      if (len > 0) {
        const duration = Math.min(900, Math.max(250, len * 1.6));
        e.style.strokeDasharray = `${len}`;
        const a = e.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration, delay, easing: 'ease-in-out', fill: 'backwards' });
        a.onfinish = () => e.style.removeProperty('stroke-dasharray');
        e.animate([{ fillOpacity: 0 }, { fillOpacity: getComputedStyle(e).fillOpacity || 1 }], { duration: 300, delay: delay + duration * 0.6, fill: 'backwards' });
        return;
      }
    }
    e.animate([{ opacity: 0 }, { opacity: getComputedStyle(e).opacity || 1 }], { duration: 400, delay, fill: 'backwards' });
  });
}
