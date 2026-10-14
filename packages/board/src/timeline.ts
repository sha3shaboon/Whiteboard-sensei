// Timelines drawn to scale: events at their real dates (BC dates included), periods as bands
// along the axis, labels alternating above and below and stacked so they never overlap.

import { SERIES_COLORS, niceTicks } from './chart';

export interface TimelineSpec {
  events: { date: number | string; label: string; end?: number | string; color?: string }[];
  start?: number | string;
  end?: number | string;
}

export interface BuiltTimeline {
  svg: string;
  vw: number;
  vh: number;
  warnings: string[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f = (n: number) => Math.round(n * 10) / 10;

/**
 * Dates as fractional years, negative for BC (-500 = 500 BC). Accepts numbers, "1066", "500 BC", "44 BCE", "AD 79",
 * "1969-07-20", "1914-07", "c. 1200", "3rd century BC".
 */
export function parseDate(v: number | string): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/^(c\.|ca\.|circa|about|around)\s*/i, '');
  const iso = /^(-?\d{1,4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(s);
  if (iso) return Number(iso[1]) + (Number(iso[2]) - 1) / 12 + (iso[3] ? (Number(iso[3]) - 1) / 365 : 0);
  const century = /^(\d{1,2})(?:st|nd|rd|th)\s+century(\s*(BC|BCE))?$/i.exec(s);
  if (century) {
    const c = Number(century[1]);
    return century[2] ? -(c - 0.5) * 100 : (c - 0.5) * 100;
  }
  const m = /^(AD|CE)?\s*(-?[\d,.]+)\s*(k|thousand|million|m)?\s*(BC|BCE|B\.C\.|AD|CE|years ago|ya|mya)?$/i.exec(s);
  if (!m) return null;
  let n = Number(m[2]!.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const mult = m[3]?.toLowerCase();
  if (mult === 'k' || mult === 'thousand') n *= 1e3;
  if (mult === 'm' || mult === 'million') n *= 1e6;
  const era = m[4]?.toLowerCase();
  if (era === 'mya') return -n * 1e6;
  if (era && /^(bc|bce|b\.c\.|years ago|ya)$/.test(era)) return -n;
  return n;
}

/** -500 -> "500 BC", 79 -> "AD 79", 1066 -> "1066", 1969.5 -> "Jul 1969" (fine steps), -2.5e6 -> "2.5 million BC" */
export function formatYear(y: number, step = 1): string {
  const a = Math.abs(y);
  if (y < 0) return `${a >= 1e6 ? `${+(a / 1e6).toFixed(2)} million` : formatInt(a)} BC`;
  if (step < 1 && Math.abs(y - Math.round(y)) > 1e-6) {
    const month = Math.min(11, Math.round((y - Math.floor(y)) * 12));
    return `${MONTHS[month]} ${Math.floor(y)}`;
  }
  return y > 0 && y < 1000 ? `AD ${formatInt(y)}` : formatInt(y);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatInt = (n: number) => (n >= 10000 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n * 100) / 100));

const LEVEL_H = 30;
const CHAR_W = 7;

export function buildTimeline(spec: TimelineSpec): BuiltTimeline {
  const warnings: string[] = [];
  const events = spec.events.slice(0, 30).flatMap((e, i) => {
    const date = parseDate(e.date);
    if (date === null) {
      warnings.push(`Couldn't read the date "${e.date}" (${e.label})`);
      return [];
    }
    const end = e.end !== undefined ? parseDate(e.end) : null;
    if (e.end !== undefined && end === null) warnings.push(`Couldn't read the end date "${e.end}" (${e.label})`);
    return [{ i, date, end: end !== null && end > date ? end : null, label: String(e.label ?? ''), color: e.color && /^#[0-9a-f]{3,8}$/i.test(e.color) ? e.color : null }];
  });
  if (!events.length) return { svg: '', vw: 0, vh: 0, warnings: [...warnings, 'A timeline needs at least one event with a date'] };

  const dates = events.flatMap((e) => (e.end !== null ? [e.date, e.end] : [e.date]));
  const s0 = spec.start !== undefined ? parseDate(spec.start) : null;
  const e0 = spec.end !== undefined ? parseDate(spec.end) : null;
  const span = Math.max(...dates) - Math.min(...dates) || 10;
  const min = s0 ?? Math.min(...dates) - span * 0.06;
  const max = e0 ?? Math.max(...dates) + span * 0.06;
  const { ticks, step } = niceTicks(min, max, 6);
  const lo = Math.min(min, ticks[0]!), hi = Math.max(max, ticks.at(-1)!);

  const W = 680, left = 30, right = 30;
  const X = (y: number) => left + ((y - lo) / (hi - lo)) * (W - left - right);

  // Lay labels out: alternate sides by date order, then push each up a level until it is clear of
  // the labels already placed on that side.
  const sorted = [...events].sort((a, b) => a.date - b.date);
  const placed: { side: 1 | -1; level: number; x0: number; x1: number }[] = [];
  const layout = new Map<number, { side: 1 | -1; level: number }>();
  sorted.forEach((e, k) => {
    const text = e.label.length + 8;
    const cx = X(e.end !== null ? (e.date + e.end) / 2 : e.date);
    const w = text * CHAR_W;
    let best: { side: 1 | -1; level: number } | null = null;
    for (const side of k % 2 === 0 ? ([-1, 1] as const) : ([1, -1] as const)) {
      let level = 0;
      while (placed.some((p) => p.side === side && p.level === level && cx - w / 2 < p.x1 + 8 && cx + w / 2 > p.x0 - 8)) level++;
      if (!best || level < best.level) best = { side, level };
      if (level === 0) break;
    }
    placed.push({ ...best!, x0: cx - w / 2, x1: cx + w / 2 });
    layout.set(e.i, best!);
  });
  const up = Math.max(0, ...placed.filter((p) => p.side === -1).map((p) => p.level + 1));
  const down = Math.max(0, ...placed.filter((p) => p.side === 1).map((p) => p.level + 1));
  const axisY = 20 + up * LEVEL_H + 22;
  const vh = axisY + 24 + down * LEVEL_H + 16;

  const out: string[] = [];
  out.push(
    `<g id="ticks" data-static="">${ticks
      .filter((t) => t >= lo && t <= hi)
      .map((t) => `<line x1="${f(X(t))}" y1="${axisY - 4}" x2="${f(X(t))}" y2="${axisY + 4}" stroke="#a8a29e" stroke-width="1"/><text x="${f(X(t))}" y="${axisY + 18}" text-anchor="middle" font-size="11" fill="#78716c">${formatYear(t, step)}</text>`)
      .join('')}</g>`,
  );
  out.push(`<line id="axis" x1="${left - 10}" y1="${axisY}" x2="${W - right + 10}" y2="${axisY}" stroke-width="2" marker-end="url(#arrow)"/>`);

  // Events draw in the order given (the order the tutor tells them); ids follow that order.
  events.forEach((e, k) => {
    const { side, level } = layout.get(e.i)!;
    const color = e.color ?? SERIES_COLORS[k % SERIES_COLORS.length]!;
    const ly = side === -1 ? axisY - 22 - level * LEVEL_H : axisY + 34 + level * LEVEL_H;
    const when = e.end !== null ? `${formatYear(e.date)}–${formatYear(e.end)}` : formatYear(e.date, step);
    const cx = X(e.end !== null ? (e.date + e.end) / 2 : e.date);
    const parts: string[] = [];
    if (e.end !== null) parts.push(`<rect x="${f(X(e.date))}" y="${axisY - 5}" width="${f(Math.max(3, X(e.end) - X(e.date)))}" height="10" rx="3" fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="1.5"/>`);
    else parts.push(`<circle cx="${f(cx)}" cy="${axisY}" r="5" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>`);
    parts.push(`<line x1="${f(cx)}" y1="${axisY + side * 7}" x2="${f(cx)}" y2="${f(side === -1 ? ly + 6 : ly - 13)}" stroke="${color}" stroke-width="1" stroke-dasharray="2 3"/>`);
    parts.push(`<text x="${f(cx)}" y="${f(ly)}" text-anchor="middle" font-size="13" fill="#1c1c1a"><tspan font-weight="600" fill="${color}">${esc(when)}</tspan> ${esc(e.label)}</text>`);
    out.push(`<g id="event-${e.i}">${parts.join('')}</g>`);
  });

  // Labels may overhang the ends of the axis; widen the view to fit them.
  const x0 = Math.min(0, ...placed.map((p) => p.x0 - 4));
  const x1 = Math.max(W, ...placed.map((p) => p.x1 + 4));
  return { svg: `<svg viewBox="${f(x0)} 0 ${f(x1 - x0)} ${vh}">${out.join('')}</svg>`, vw: f(x1 - x0), vh, warnings };
}
