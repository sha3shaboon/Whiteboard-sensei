// Board themes. Content is stored in light-theme colors (that's also what exports and the AI see);
// the dark theme converts every color as it is drawn: white paper becomes deep navy, dark ink
// becomes near-white, pastel fills become dark tints, and accent colors are brightened to glow.

export type Theme = 'light' | 'dark';

const cache = new Map<string, string>();

interface RGBA { r: number; g: number; b: number; a: number }

function parse(c: string): RGBA | null {
  const s = c.trim().toLowerCase();
  if (s === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1]!;
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number.parseFloat(m[4]) / 100 : Number(m[4]);
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
  }
  return null;
}

function toHsl({ r, g, b }: RGBA): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number, a: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const q = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - q * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return a < 1 ? `rgba(${f(0)}, ${f(8)}, ${f(4)}, ${+a.toFixed(3)})` : `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** The dark board surface (what white paper becomes). */
export const DARK_SURFACE = '#0b0d16';
const NAVY_HUE = 232;

/** A light-theme color as it should appear in `theme`. Unknown values (gradients, names) pass through. */
export function themeColor(color: string, theme: Theme): string {
  if (theme === 'light' || !color || color === 'none' || color === 'transparent' || color.startsWith('url(')) return color;
  const hit = cache.get(color);
  if (hit) return hit;
  const c = parse(color);
  let out = color;
  if (c) {
    const [h, s, l] = toHsl(c);
    if (l >= 0.985 && s < 0.5) out = c.a < 1 ? `rgba(11, 13, 22, ${c.a})` : DARK_SURFACE;
    else if (s < 0.18) {
      // Grays flip: paper -> surface, ink -> near-white, with a cool navy tint like the rest of the UI.
      const L = 0.075 + (1 - l) * 0.86;
      out = fromHsl(NAVY_HUE, L > 0.5 ? 0.25 : 0.3, L, c.a);
    } else if (l > 0.8) {
      // Pastel fills (highlighted countries, magnet poles, table headers) become deep tints.
      out = fromHsl(h, Math.min(0.75, s * 0.7), 0.13 + (1 - l) * 0.55, c.a);
    } else {
      // Accents and colored ink: lift to a bright, slightly more saturated tone that reads on dark.
      out = fromHsl(h, Math.min(1, s * 1.08), Math.max(0.62, Math.min(0.78, l + 0.14)), c.a);
    }
  }
  cache.set(color, out);
  return out;
}

const COLOR_IN_TEXT = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b(?=\s*[;"'),]|\s*$)/g;

/** Every color inside a style string, SVG attribute or markup snippet, converted for `theme`. */
export function themeText(text: string, theme: Theme): string {
  return theme === 'light' ? text : text.replace(COLOR_IN_TEXT, (m) => themeColor(m, theme));
}

const SVG_COLOR_ATTRS = ['fill', 'stroke', 'stop-color', 'color'];

/** Converts inline colors in a rendered DOM subtree (styles and SVG paint attributes) in place. */
export function themeDom(root: Element, theme: Theme): void {
  if (theme === 'light') return;
  const all = [root, ...root.querySelectorAll('[style], [fill], [stroke], [stop-color]')];
  for (const el of all) {
    if (el.tagName === 'IMG') continue;
    const style = el.getAttribute('style');
    if (style && /#|rgb|white|black/.test(style)) el.setAttribute('style', themeText(style, theme));
    for (const a of SVG_COLOR_ATTRS) {
      const v = el.getAttribute(a);
      if (v) el.setAttribute(a, themeColor(v, theme));
    }
  }
}

/**
 * Makes a 2D context convert every color it is given for the current theme, so all the drawing
 * code can keep using light-theme colors. Gradients and patterns pass through unchanged.
 */
export function themeContext(ctx: CanvasRenderingContext2D, theme: () => Theme): void {
  const proto = CanvasRenderingContext2D.prototype;
  for (const prop of ['fillStyle', 'strokeStyle', 'shadowColor'] as const) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc?.set || !desc.get) continue;
    Object.defineProperty(ctx, prop, {
      configurable: true,
      get: () => desc.get!.call(ctx),
      set: (v: unknown) => desc.set!.call(ctx, typeof v === 'string' ? themeColor(v, theme()) : v),
    });
  }
}
