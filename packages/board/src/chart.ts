// Charts computed from data: bar, line and pie. Axes use "nice" ticks, bars and points are placed
// to scale, pie slices are true proportions with percentages. Ids are stable per series and index
// (bar-0-3, point-1-2, slice-4), so updating a chart with one more value draws in only that part.

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie';
  labels: string[];
  series: { name?: string; values: number[]; color?: string }[];
  x_label?: string;
  y_label?: string;
  unit?: string;
}

export interface BuiltChart {
  svg: string;
  vw: number;
  vh: number;
  warnings: string[];
}

export const SERIES_COLORS = ['#2563eb', '#ea580c', '#16a34a', '#dc2626', '#7c3aed', '#0891b2', '#ca8a04', '#db2777'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f = (n: number) => Math.round(n * 10) / 10;
const safeColor = (c: string | undefined, i: number) => (c && /^#[0-9a-f]{3,8}$|^[a-z]+$/i.test(c) ? c : SERIES_COLORS[i % SERIES_COLORS.length]!);

/** Round tick step: 1, 2, 2.5 or 5 times a power of ten, giving about `count` intervals. */
export function niceTicks(min: number, max: number, count = 5): { ticks: number[]; lo: number; hi: number; step: number } {
  if (!(max > min)) {
    const d = Math.abs(max) || 1;
    min -= d / 2;
    max += d / 2;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { ticks, lo, hi, step };
}

/** 1200 -> "1,200", 0.25 -> "0.25", 2500000 -> "2.5M" */
export function formatNumber(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return Math.round(v).toLocaleString('en-US');
  return String(+v.toFixed(a < 1 ? 3 : 2)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function buildChart(spec: ChartSpec): BuiltChart {
  const warnings: string[] = [];
  const labels = spec.labels.slice(0, 40).map(String);
  const series = spec.series.slice(0, 8).map((s, i) => ({
    name: s.name ? String(s.name) : '',
    color: safeColor(s.color, i),
    values: labels.map((_, k) => {
      const v = Number(s.values[k]);
      return Number.isFinite(v) ? v : NaN;
    }),
  }));
  if (!labels.length || !series.length) return { svg: '', vw: 0, vh: 0, warnings: ['A chart needs labels and at least one series of values'] };
  for (const s of spec.series) if (s.values.length !== labels.length) warnings.push(`Series ${s.name ?? ''} has ${s.values.length} values for ${labels.length} labels`.replace('  ', ' '));
  const unit = spec.unit ? String(spec.unit) : '';
  return spec.type === 'pie' ? pie(labels, series, unit, warnings) : axes(spec.type === 'line' ? 'line' : 'bar', labels, series, spec, unit, warnings);
}

type Series = { name: string; color: string; values: number[] }[];

function legend(series: Series, x: number, y: number): string {
  if (series.length < 2) return '';
  return series
    .map((s, i) => `<g id="legend-${i}"><rect x="${x}" y="${y + i * 20 - 9}" width="12" height="12" rx="2" fill="${s.color}" stroke="none"/><text x="${x + 18}" y="${y + i * 20 + 1}" font-size="13">${esc(s.name || `Series ${i + 1}`)}</text></g>`)
    .join('');
}

function axes(type: 'bar' | 'line', labels: string[], series: Series, spec: ChartSpec, unit: string, warnings: string[]): BuiltChart {
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  if (!all.length) return { svg: '', vw: 0, vh: 0, warnings: [...warnings, 'No numeric values'] };
  const lo0 = type === 'bar' ? Math.min(0, ...all) : Math.min(...all);
  const hi0 = type === 'bar' ? Math.max(0, ...all) : Math.max(...all);
  // Line charts don't have to start at zero, but stay there when the data is close to it.
  const { ticks, lo, hi } = niceTicks(type === 'line' && lo0 > 0 && lo0 < (hi0 - lo0) * 0.5 ? 0 : lo0, hi0);

  const longest = Math.max(...labels.map((l) => l.length));
  const labelW = longest * 7 + 10;
  const tickW = Math.max(...ticks.map((t) => formatNumber(t).length)) * 7.5;
  const left = 22 + tickW + (spec.y_label ? 22 : 0);
  const legendW = series.length > 1 ? Math.min(160, 30 + Math.max(...series.map((s) => (s.name || 'Series 0').length)) * 7.5) : 0;
  const plotW = Math.max(260, Math.min(620, labels.length * Math.max(labelW, type === 'bar' ? 26 + series.length * 22 : 56)));
  // Labels that don't fit side by side are slanted.
  const slanted = labels.length * labelW > plotW;
  const plotH = 240;
  const top = 18;
  const bottom = (slanted ? Math.min(90, longest * 5.5 + 16) : 30) + (spec.x_label ? 24 : 0);
  const vw = Math.round(left + plotW + 20 + legendW);
  const vh = Math.round(top + plotH + bottom);
  const Y = (v: number) => top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const band = plotW / labels.length;
  const X = (k: number) => left + band * (k + 0.5);

  const out: string[] = [];
  // Grid and tick labels appear at once; the data is what draws in.
  out.push(
    `<g id="grid" data-static="">${ticks
      .map((t) => `<line x1="${left}" y1="${f(Y(t))}" x2="${left + plotW}" y2="${f(Y(t))}" stroke="#e7e5e4" stroke-width="1"/><text x="${left - 8}" y="${f(Y(t) + 4)}" text-anchor="end" font-size="12" fill="#6b6b66">${formatNumber(t)}</text>`)
      .join('')}${labels
      .map((l, k) =>
        slanted
          ? `<text x="${f(X(k))}" y="${top + plotH + 14}" text-anchor="end" font-size="12" fill="#44403c" transform="rotate(-40 ${f(X(k))} ${top + plotH + 14})">${esc(l)}</text>`
          : `<text x="${f(X(k))}" y="${top + plotH + 20}" text-anchor="middle" font-size="12" fill="#44403c">${esc(l)}</text>`,
      )
      .join('')}</g>`,
  );
  out.push(`<line id="x-axis" x1="${left}" y1="${f(Y(Math.max(lo, Math.min(0, hi))))}" x2="${left + plotW}" y2="${f(Y(Math.max(lo, Math.min(0, hi))))}" stroke-width="1.5"/>`);
  out.push(`<line id="y-axis" x1="${left}" y1="${top}" x2="${left}" y2="${top + plotH}" stroke-width="1.5"/>`);
  if (spec.y_label) out.push(`<text id="y-label" x="16" y="${top + plotH / 2}" text-anchor="middle" font-size="13" fill="#44403c" transform="rotate(-90 16 ${top + plotH / 2})">${esc(spec.y_label + (unit ? ` (${unit})` : ''))}</text>`);
  if (spec.x_label) out.push(`<text id="x-label" x="${left + plotW / 2}" y="${vh - 6}" text-anchor="middle" font-size="13" fill="#44403c">${esc(spec.x_label)}</text>`);

  if (type === 'bar') {
    const groupW = band * 0.74;
    const barW = groupW / series.length;
    const base = Y(Math.max(lo, Math.min(0, hi)));
    // Label by label (all series of a label together), so a comparison reads left to right.
    labels.forEach((_, k) => {
      series.forEach((s, i) => {
        const v = s.values[k]!;
        if (!Number.isFinite(v)) return;
        const x = X(k) - groupW / 2 + i * barW;
        const y = Math.min(base, Y(v));
        const h = Math.max(1, Math.abs(Y(v) - base));
        const showValue = labels.length * series.length <= 16;
        out.push(
          `<g id="bar-${i}-${k}"><rect x="${f(x + 1)}" y="${f(y)}" width="${f(barW - 2)}" height="${f(h)}" fill="${s.color}" fill-opacity="0.85" stroke="${s.color}" stroke-width="1"/>` +
            (showValue ? `<text x="${f(x + barW / 2)}" y="${f(v >= 0 ? y - 5 : y + h + 14)}" text-anchor="middle" font-size="11" fill="#44403c">${formatNumber(v)}</text>` : '') +
            `</g>`,
        );
      });
    });
  } else {
    series.forEach((s, i) => {
      // One segment per step (line-i-k), so extending the series draws in only the new piece.
      let prev: number | null = null;
      s.values.forEach((v, k) => {
        if (!Number.isFinite(v)) {
          prev = null;
          return;
        }
        if (prev !== null) out.push(`<line id="line-${i}-${k}" x1="${f(X(prev))}" y1="${f(Y(s.values[prev]!))}" x2="${f(X(k))}" y2="${f(Y(v))}" stroke="${s.color}" stroke-width="2.5"/>`);
        out.push(
          `<g id="point-${i}-${k}"><circle cx="${f(X(k))}" cy="${f(Y(v))}" r="4" fill="${s.color}" stroke="#ffffff" stroke-width="1.5"/>` +
            (labels.length <= 12 && series.length <= 2 ? `<text x="${f(X(k))}" y="${f(Y(v) - 9)}" text-anchor="middle" font-size="11" fill="#44403c">${formatNumber(v)}</text>` : '') +
            `</g>`,
        );
        prev = k;
      });
    });
  }
  out.push(legend(series, left + plotW + 24, top + 10));
  return { svg: `<svg viewBox="0 0 ${vw} ${vh}">${out.join('')}</svg>`, vw, vh, warnings };
}

function pie(labels: string[], series: Series, unit: string, warnings: string[]): BuiltChart {
  if (series.length > 1) warnings.push('A pie chart shows one series; only the first was used');
  const s = series[0]!;
  const vals = s.values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  if (s.values.some((v) => v < 0)) warnings.push('Negative values cannot be shown in a pie chart');
  const total = vals.reduce((a, b) => a + b, 0);
  if (!total) return { svg: '', vw: 0, vh: 0, warnings: [...warnings, 'No positive values'] };
  const R = 110, cx = 200, cy = 150;
  const vw = 400 + 180, vh = 300;
  const out: string[] = [];
  let a0 = -Math.PI / 2;
  vals.forEach((v, k) => {
    if (!v) return;
    const frac = v / total;
    const a1 = a0 + frac * 2 * Math.PI;
    const color = SERIES_COLORS[k % SERIES_COLORS.length]!;
    const p = (a: number, r = R) => `${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
    const d = frac >= 0.9999 ? `M${cx - R} ${cy}A${R} ${R} 0 1 1 ${cx + R} ${cy}A${R} ${R} 0 1 1 ${cx - R} ${cy}Z` : `M${cx} ${cy}L${p(a0)}A${R} ${R} 0 ${frac > 0.5 ? 1 : 0} 1 ${p(a1)}Z`;
    const mid = (a0 + a1) / 2;
    const pct = `${+(frac * 100).toFixed(frac < 0.1 ? 1 : 0)}%`;
    // Percent inside big slices; small slices get it outside with a short leader line.
    const inside = frac >= 0.07;
    const [lx, ly] = p(mid, inside ? R * 0.62 : R + 18).split(' ').map(Number) as [number, number];
    out.push(
      `<g id="slice-${k}"><path d="${d}" fill="${color}" fill-opacity="0.85" stroke="#ffffff" stroke-width="2"/>` +
        (inside ? '' : `<line x1="${p(mid, R + 2).split(' ')[0]}" y1="${p(mid, R + 2).split(' ')[1]}" x2="${p(mid, R + 10).split(' ')[0]}" y2="${p(mid, R + 10).split(' ')[1]}" stroke="#78716c" stroke-width="1"/>`) +
        `<text x="${lx}" y="${f(ly + 4)}" text-anchor="middle" font-size="12" font-weight="600" fill="${inside ? '#ffffff' : '#44403c'}">${pct}</text></g>`,
      `<g id="key-${k}"><rect x="${cx + R + 50}" y="${30 + k * 22 - 10}" width="12" height="12" rx="2" fill="${color}" stroke="none"/><text x="${cx + R + 68}" y="${30 + k * 22}" font-size="13">${esc(labels[k]!)} (${formatNumber(v)}${unit ? ` ${esc(unit)}` : ''})</text></g>`,
    );
    a0 = a1;
  });
  const keyH = 30 + vals.length * 22;
  return { svg: `<svg viewBox="0 0 ${vw} ${Math.max(vh, keyH)}">${out.join('')}</svg>`, vw, vh: Math.max(vh, keyH), warnings };
}
