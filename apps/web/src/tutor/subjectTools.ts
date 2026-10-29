// Subject tools: interactive activities (Synthesis-style, checked by the app) and computed visuals
// for math, science, languages and music. Definitions for the model plus the executors.

import {
  SIM_PARAMS, buildColumnArithmetic, buildFractionModel, buildGloss, buildManipulatives, buildMap, buildNotation, buildNumberLine, buildPeriodicTable, buildPunnett,
  electronConfiguration, fetchTopology, findElement, mapSlug, resolvePlaces, simFacts, simParams, validateActivity,
  type ActivityContent, type ActivitySpec, type Board, type BoardElement, type ManipulativeSpec, type SimulationKind,
} from '@ai-tutor/board';
import { playNotes, sanitizeSvg, type BoardView } from '@ai-tutor/board/view';
import type { ToolDefinition } from './realtime';

type Args = Record<string, unknown>;
type Result = { ok: true; [k: string]: unknown } | { ok: false; error: string };
type NewElement = Pick<BoardElement, 'type' | 'content'> & { author?: 'ai' };
export type Placer = (el: NewElement, size: { width: number; height: number }) => BoardElement;

const placement = {
  type: 'string',
  description: 'Where to put it: "below #12", "right of #7", "new section", or omit to continue under your last item.',
};
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required });
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : d);
const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const ref = (el: { id: string }) => `#${el.id}`;

export const SUBJECT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    name: 'ask_activity',
    description:
      'Give the student a hands-on question they answer by tapping, dragging, placing or typing; the APP checks it instantly (chime + confetti when right, a hint when not, "Show me" after two tries), then you get an [Activity] message with the result. This is the main way to practice: short explanation, then an activity, then react to the result. One activity at a time. ' +
      'Kinds and their fields: ' +
      'choice {options, answer: index or [indices] (0-based), multiple}; ' +
      'answer {answers: accepted answers, numeric (accepts 3/4 = 0.75 = 75%), tolerance, unit}; ' +
      'order {items: in the CORRECT order; shown shuffled}; ' +
      'sort {categories: [{name, items}]}; ' +
      'match {pairs: [{left, right}]}; ' +
      'cloze {text with blanks as [[answer]] or [[answer|alternative]], bank: extra distractor words, typed: true to type instead of word chips}; ' +
      'select {text with the words to tap in [brackets], e.g. "The [quick] fox [jumps]"}; ' +
      'number_line {min, max, step, answer, denominator (label ticks as fractions)}; ' +
      'fraction_shade {parts, shape: bar|circle|grid, numerator, denominator} (any equivalent amount counts); ' +
      'plot_point {points: [{x, y}], x_range, y_range}; ' +
      'map_click {answers: country (or US state) names, region, focus: countries to frame}; ' +
      'chem_balance {reactants, products: formulas like "H2", "O2", "H2O"}; ' +
      'label {sketch_id: a sketch you drew, targets: [{part: its part id, label}], extra: distractor labels}. ' +
      'Always give 1-2 hints (shown after a wrong try, never the answer itself) and a one-line explanation (shown once solved).',
    parameters: obj(
      {
        kind: { type: 'string', enum: ['choice', 'answer', 'order', 'sort', 'match', 'cloze', 'select', 'number_line', 'fraction_shade', 'plot_point', 'map_click', 'chem_balance', 'label'] },
        prompt: { type: 'string', description: 'The question, short. Inline math between $...$.' },
        hints: { type: 'array', items: { type: 'string' } },
        explanation: { type: 'string' },
        step: { type: 'string', description: 'Progress in a short set, e.g. "2/3"' },
        options: { type: 'array', items: { type: 'string' } },
        answer: { description: 'choice: correct index or indices; number_line: the value' },
        multiple: { type: 'boolean' },
        answers: { type: 'array', items: { type: 'string' } },
        numeric: { type: 'boolean' },
        tolerance: { type: 'number' },
        unit: { type: 'string' },
        items: { type: 'array', items: { type: 'string' } },
        categories: { type: 'array', items: obj({ name: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } }, ['name', 'items']) },
        pairs: { type: 'array', items: obj({ left: { type: 'string' }, right: { type: 'string' } }, ['left', 'right']) },
        text: { type: 'string' },
        bank: { type: 'array', items: { type: 'string' } },
        typed: { type: 'boolean' },
        min: { type: 'number' }, max: { type: 'number' }, step_size: { type: 'number', description: 'number_line tick step' }, denominator: { type: 'number' },
        parts: { type: 'number' }, shape: { type: 'string', enum: ['bar', 'circle', 'grid'] }, numerator: { type: 'number' },
        points: { type: 'array', items: obj({ x: { type: 'number' }, y: { type: 'number' } }, ['x', 'y']) },
        x_range: { type: 'array', items: { type: 'number' } }, y_range: { type: 'array', items: { type: 'number' } },
        region: { type: 'string', enum: ['world', 'usa'] }, focus: { type: 'array', items: { type: 'string' } },
        reactants: { type: 'array', items: { type: 'string' } }, products: { type: 'array', items: { type: 'string' } },
        sketch_id: { type: 'string' },
        targets: { type: 'array', items: obj({ part: { type: 'string' }, label: { type: 'string' } }, ['part', 'label']) },
        extra: { type: 'array', items: { type: 'string' } },
        placement,
      },
      ['kind', 'prompt'],
    ),
  },
  {
    type: 'function',
    name: 'draw_number_line',
    description:
      'Number line drawn to scale: points, hops (arcs for counting on/back, adding, skip counting), and intervals (inequalities, open/closed ends). Label ticks as fractions with denominator. Build it up with update_item(id, spec: {...all fields plus the next hop}).',
    parameters: obj(
      {
        min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number' }, denominator: { type: 'number' }, label_every: { type: 'number' },
        points: { type: 'array', items: obj({ value: { type: 'number' }, label: { type: 'string' }, open: { type: 'boolean' } }, ['value']) },
        jumps: { type: 'array', items: obj({ from: { type: 'number' }, to: { type: 'number' }, label: { type: 'string' } }, ['from', 'to']) },
        intervals: { type: 'array', items: obj({ from: { type: 'number' }, to: { type: 'number' }, open_from: { type: 'boolean' }, open_to: { type: 'boolean' } }, ['from', 'to']) },
        title: { type: 'string' }, placement,
      },
      ['min', 'max', 'step'],
    ),
  },
  {
    type: 'function',
    name: 'show_fractions',
    description: 'Fraction models: bars (equal widths, so equivalent fractions line up) or circles, with the right number of parts shaded; improper fractions show extra wholes. Use for comparing, equivalence, adding fractions.',
    parameters: obj({ fractions: { type: 'array', items: obj({ numerator: { type: 'number' }, denominator: { type: 'number' }, label: { type: 'string' } }, ['numerator', 'denominator']) }, shape: { type: 'string', enum: ['bar', 'circle'] }, title: { type: 'string' }, placement }, ['fractions']),
  },
  {
    type: 'function',
    name: 'show_manipulatives',
    description: 'Virtual manipulatives: base_ten (number -> hundreds flats, tens rods, ones cubes; place value), ten_frame (number up to 40), array (rows x columns dots; multiplication, grouping), counters (groups of counters, e.g. [3, 4] for 3 + 4).',
    parameters: obj({ kind: { type: 'string', enum: ['base_ten', 'ten_frame', 'array', 'counters'] }, number: { type: 'number' }, rows: { type: 'number' }, columns: { type: 'number' }, group_by: { type: 'string', enum: ['rows', 'columns'] }, groups: { type: 'array', items: { type: 'number' } }, labels: { type: 'array', items: { type: 'string' } }, title: { type: 'string' }, placement }, ['kind']),
  },
  {
    type: 'function',
    name: 'column_arithmetic',
    description: 'Written column method, computed exactly: addition with carries, subtraction with borrows, long multiplication with partial products, long division with remainder. Steps draw in right to left, in the order they are done; narrate each column.',
    parameters: obj({ a: { type: 'number' }, b: { type: 'number' }, op: { type: 'string', enum: ['+', '-', '×', '÷'] }, title: { type: 'string' }, placement }, ['a', 'b', 'op']),
  },
  {
    type: 'function',
    name: 'show_periodic_table',
    description: 'The real periodic table (118 elements, category colors). Highlight elements, a group, a period or a category; focus one element to show its card (number, mass, category, electron configuration). The result includes the focused element\'s data.',
    parameters: obj({ highlight: { type: 'array', items: { type: 'string' } }, group: { type: 'number' }, period: { type: 'number' }, category: { type: 'string', enum: ['alkali', 'alkaline-earth', 'transition', 'post-transition', 'metalloid', 'nonmetal', 'halogen', 'noble-gas', 'lanthanide', 'actinide'] }, focus: { type: 'string' }, masses: { type: 'boolean' }, title: { type: 'string' }, placement }, []),
  },
  {
    type: 'function',
    name: 'punnett_square',
    description: 'Punnett square computed from parent genotypes (one or two genes, e.g. "Aa" x "Aa" or "AaBb" x "AaBb"): gametes, offspring grid colored by phenotype, genotype counts and phenotype ratio. traits maps allele letters to names.',
    parameters: obj({ parent1: { type: 'string' }, parent2: { type: 'string' }, traits: { type: 'object', description: 'e.g. {"P": "purple flowers", "p": "white flowers"}' }, title: { type: 'string' }, placement }, ['parent1', 'parent2']),
  },
  {
    type: 'function',
    name: 'gloss_text',
    description: 'For language learning: a sentence word by word, each with its reading above (furigana, pinyin, romanization) and meaning below, colored by part of speech (noun, verb, adjective, particle, ...), plus the full translation. Reveal word by word with update_item(id, spec) if useful.',
    parameters: obj({ words: { type: 'array', items: obj({ text: { type: 'string' }, reading: { type: 'string' }, gloss: { type: 'string' }, pos: { type: 'string' } }, ['text']) }, translation: { type: 'string' }, rtl: { type: 'boolean' }, title: { type: 'string' }, placement }, ['words']),
  },
  {
    type: 'function',
    name: 'show_notation',
    description: 'Music: notes on a staff (treble or bass) with a piano keyboard highlighting them, and the app PLAYS them. notes: space-separated, chords joined with +, optional duration /w /h /q /e, e.g. "C4 E4 G4 C5" or "C4+E4+G4 F4+A4+C5". Replay with update_item(id, play: true).',
    parameters: obj({ notes: { type: 'string' }, clef: { type: 'string', enum: ['treble', 'bass'] }, names: { type: 'boolean' }, keyboard: { type: 'boolean' }, play: { type: 'boolean' }, title: { type: 'string' }, placement }, ['notes']),
  },
  {
    type: 'function',
    name: 'run_simulation',
    description:
      'A live physics simulation the student can explore with sliders: projectile (speed, angle, height, gravity), pendulum (length, angle, gravity, damping), spring (mass, stiffness, amplitude, damping), wave (amplitude, wavelength, frequency, amplitude2 for superposition). It plays immediately; you get the computed facts (range, period, ...). When the student moves a slider you are told the new values. Change it yourself with update_item(id, params: {...}).',
    parameters: obj({ kind: { type: 'string', enum: ['projectile', 'pendulum', 'spring', 'wave'] }, params: { type: 'object' }, controls: { type: 'array', items: { type: 'string' }, description: 'Which parameters get sliders (default: the first two)' }, title: { type: 'string' }, placement }, ['kind']),
  },
];

export const SUBJECT_TOOL_NAMES = new Set(SUBJECT_TOOLS.map((t) => t.name));

// ---- Visual builders shared by creation and update_item(spec).

type Built = { svg: string; vw: number; vh: number; warnings?: string[]; info?: Record<string, unknown> };
const BUILDERS: Record<string, { tool: string; width: number; build: (a: Args) => Built }> = {
  numberline: {
    tool: 'draw_number_line', width: 640,
    build: (a) => buildNumberLine({
      min: num(a.min, 0), max: num(a.max, 10), step: num(a.step, 1), denominator: a.denominator ? num(a.denominator, 0) : undefined, labelEvery: a.label_every ? num(a.label_every, 1) : undefined,
      points: arr<Args>(a.points).map((p) => ({ value: num(p.value, 0), label: p.label ? str(p.label) : undefined, open: !!p.open })),
      jumps: arr<Args>(a.jumps).map((j) => ({ from: num(j.from, 0), to: num(j.to, 0), label: j.label ? str(j.label) : undefined })),
      intervals: arr<Args>(a.intervals).map((iv) => ({ from: num(iv.from, -Infinity), to: num(iv.to, Infinity), openFrom: !!iv.open_from, openTo: !!iv.open_to })),
    }),
  },
  fractions: {
    tool: 'show_fractions', width: 560,
    build: (a) => buildFractionModel({ shape: a.shape === 'circle' ? 'circle' : 'bar', fractions: arr<Args>(a.fractions).map((f) => ({ numerator: num(f.numerator, 0), denominator: num(f.denominator, 1), label: f.label ? str(f.label) : undefined })) }),
  },
  manipulatives: {
    tool: 'show_manipulatives', width: 480,
    build: (a) => {
      const k = str(a.kind);
      const spec: ManipulativeSpec = k === 'ten_frame' ? { kind: 'ten_frame', number: num(a.number, 0) } : k === 'array' ? { kind: 'array', rows: num(a.rows, 1), columns: num(a.columns, 1), groupBy: a.group_by === 'columns' ? 'columns' : a.group_by === 'rows' ? 'rows' : undefined } : k === 'counters' ? { kind: 'counters', groups: arr(a.groups).map((g) => num(g, 0)), labels: arr(a.labels).map(str) } : { kind: 'base_ten', number: num(a.number, 0) };
      return buildManipulatives(spec);
    },
  },
  arithmetic: {
    tool: 'column_arithmetic', width: 320,
    build: (a) => buildColumnArithmetic({ a: num(a.a, 0), b: num(a.b, 0), op: (['+', '-', '×', '÷'].includes(str(a.op)) ? str(a.op) : str(a.op) === '*' || str(a.op) === 'x' ? '×' : str(a.op) === '/' ? '÷' : '+') as '+' }),
  },
  periodic: {
    tool: 'show_periodic_table', width: 940,
    build: (a) => withElementInfo(a, buildPeriodicTable({ highlight: arr(a.highlight).map(str), group: a.group ? num(a.group, 0) : undefined, period: a.period ? num(a.period, 0) : undefined, category: a.category ? (str(a.category) as never) : undefined, focus: a.focus ? str(a.focus) : undefined, masses: !!a.masses })),
  },
  punnett: {
    tool: 'punnett_square', width: 480,
    build: (a) => {
      const traits = a.traits && typeof a.traits === 'object' ? Object.fromEntries(Object.entries(a.traits as Args).map(([k, v]) => [k, str(v)])) : undefined;
      const b = buildPunnett({ parent1: str(a.parent1), parent2: str(a.parent2), traits });
      return { ...b, info: { genotypes: b.result.genotypes, phenotypes: b.result.phenotypes, total: b.result.total } };
    },
  },
  gloss: {
    tool: 'gloss_text', width: 640,
    build: (a) => buildGloss({ words: arr<Args>(a.words).map((w) => ({ text: str(w.text), reading: w.reading ? str(w.reading) : undefined, gloss: w.gloss ? str(w.gloss) : undefined, pos: w.pos ? str(w.pos) : undefined })), translation: a.translation ? str(a.translation) : undefined, rtl: !!a.rtl }),
  },
  notation: {
    tool: 'show_notation', width: 560,
    build: (a) => {
      const b = buildNotation({ notes: str(a.notes), clef: a.clef === 'bass' ? 'bass' : a.clef === 'treble' ? 'treble' : undefined, names: a.names !== false, keyboard: a.keyboard !== false });
      return { ...b, info: { midi: b.sequence.map((ch) => ch.map((n) => n.midi)) } };
    },
  },
};
/** Adds the focused element's facts to a periodic-table result, so the tutor can talk about them accurately. */
function withElementInfo(a: Args, built: Built): Built {
  const el = a.focus ? findElement(str(a.focus)) : undefined;
  if (!el) return built;
  return { ...built, info: { element: { number: el.z, symbol: el.symbol, name: el.name, mass: el.mass, category: el.category, group: el.group, period: el.period, configuration: electronConfiguration(el.z) } } };
}
const KIND_BY_TOOL = Object.fromEntries(Object.entries(BUILDERS).map(([k, v]) => [v.tool, k]));

/** Rebuilds a subject sketch with a new spec (update_item). Returns null when the element isn't one. */
export function updateSubjectSketch(board: Board, el: BoardElement, args: Args): Result | null {
  if (el.type !== 'sketch' || !el.content.kind || !BUILDERS[el.content.kind]) return null;
  const kind = el.content.kind;
  if (kind === 'notation' && args.play && !args.spec) {
    const midi = (el.content.source as { midi?: number[][] })?.midi ?? [];
    playNotes(midi);
    return { ok: true, playing: true };
  }
  if (!args.spec || typeof args.spec !== 'object') return { ok: false, error: `Send the full new spec as spec: {...} (same fields as ${BUILDERS[kind]!.tool})` };
  let built: Built;
  try {
    built = BUILDERS[kind]!.build(args.spec as Args);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!built.svg) return { ok: false, error: (built.warnings ?? ['Nothing to draw']).join('; ') };
  const res = sanitizeSvg(built.svg, el.content.prefix, { trusted: true });
  if ('error' in res) return { ok: false, error: res.error };
  const width = Math.max(el.bounds.width, Math.min(760, res.vw));
  const height = Math.round((width * res.vh) / res.vw) + (el.content.title ? 26 : 0);
  board.update(el.id, { content: { ...el.content, svg: res.svg, vw: res.vw, vh: res.vh, parts: res.parts, source: built.info ?? args.spec }, bounds: { ...el.bounds, width, height } }, 'ai');
  if (kind === 'notation' && args.play !== false && built.info) playNotes(built.info.midi as number[][]);
  return { ok: true, ...(built.info ?? {}), ...(built.warnings?.length ? { warnings: built.warnings } : {}) };
}

export function executeSubjectTool(board: Board, view: BoardView, name: string, args: Args, place: Placer): Result | Promise<Result> {
  if (name === 'ask_activity') return askActivity(board, view, args, place);
  if (name === 'run_simulation') {
    const kind = (['projectile', 'pendulum', 'spring', 'wave'].includes(str(args.kind)) ? str(args.kind) : 'projectile') as SimulationKind;
    const params = simParams(kind, (args.params as Args) ?? {});
    const allowed = SIM_PARAMS[kind].map((p) => p.key);
    const controls = arr(args.controls).map(str).filter((c) => allowed.includes(c));
    const content = { kind, params, controls: controls.length ? controls : allowed.slice(0, 2), title: str(args.title) || undefined, run: 0 };
    const rows = Math.ceil(content.controls.length / 2);
    const el = place({ type: 'simulation', content }, { width: 640, height: 66 + Math.round((604 * 360) / 640) + 52 + rows * 52 });
    return { ok: true, id: ref(el), params, facts: roundFacts(simFacts(kind, params)), note: 'It is playing now. Talk about what happens; invite the student to drag a slider and predict.' };
  }
  const kind = KIND_BY_TOOL[name];
  if (!kind) return { ok: false, error: `Unknown tool ${name}` };
  const b = BUILDERS[kind]!;
  let built: Built;
  try {
    built = b.build(args);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!built.svg) return { ok: false, error: (built.warnings ?? ['Nothing to draw']).join('; ') };
  const prefix = `${kind.slice(0, 3)}${Math.random().toString(36).slice(2, 7)}-`;
  const res = sanitizeSvg(built.svg, prefix, { trusted: true });
  if ('error' in res) return { ok: false, error: res.error };
  const title = str(args.title) || undefined;
  const width = Math.min(kind === 'periodic' ? 960 : 760, Math.max(200, Math.min(b.width, res.vw * (kind === 'arithmetic' ? 1.1 : 1))));
  const el = place(
    { type: 'sketch', content: { svg: res.svg, vw: res.vw, vh: res.vh, prefix, parts: res.parts, title, kind: kind as never, source: built.info ?? args } },
    { width, height: Math.round((width * res.vh) / res.vw) + (title ? 26 : 0) },
  );
  if (kind === 'notation' && args.play !== false && built.info) playNotes(built.info.midi as number[][]);
  return { ok: true, id: ref(el), ...(kind === 'periodic' ? {} : { parts: res.parts.slice(0, 40) }), ...(built.info ?? {}), ...(built.warnings?.length ? { warnings: built.warnings } : {}) };
}

const roundFacts = (f: Record<string, number>) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, +v.toFixed(2)]));

async function askActivity(board: Board, view: BoardView, a: Args, place: Placer): Promise<Result> {
  const kind = str(a.kind);
  const prompt = str(a.prompt);
  if (!prompt) return { ok: false, error: 'prompt is required' };
  let spec: ActivitySpec;
  let width = 560;
  switch (kind) {
    case 'choice': {
      const options = arr(a.options).map(str).filter(Boolean).slice(0, 6);
      const answer = (Array.isArray(a.answer) ? a.answer : [a.answer]).map((v) => num(v, -1)).filter((v) => v >= 0);
      spec = { kind, options, answer, multiple: !!a.multiple || answer.length > 1 };
      break;
    }
    case 'answer':
      spec = { kind, answers: arr(a.answers).map(str).filter(Boolean), numeric: !!a.numeric, tolerance: a.tolerance !== undefined ? num(a.tolerance, 0) : undefined, unit: a.unit ? str(a.unit) : undefined };
      width = 480;
      break;
    case 'order': spec = { kind, items: arr(a.items).map(str).filter(Boolean).slice(0, 10) }; width = 480; break;
    case 'sort': spec = { kind, categories: arr<Args>(a.categories).map((c) => ({ name: str(c.name), items: arr(c.items).map(str).filter(Boolean) })).slice(0, 4) }; width = 620; break;
    case 'match': spec = { kind, pairs: arr<Args>(a.pairs).map((p) => [str(p.left), str(p.right)] as [string, string]).filter(([l, r]) => l && r).slice(0, 8) }; width = 600; break;
    case 'cloze': spec = { kind, text: str(a.text), bank: arr(a.bank).map(str).filter(Boolean), typed: !!a.typed }; width = 620; break;
    case 'select': spec = { kind, text: str(a.text) }; width = 600; break;
    case 'number_line':
      spec = { kind, min: num(a.min, 0), max: num(a.max, 1), step: num(a.step_size ?? a.step, 0.1), answer: num(a.answer, NaN), denominator: a.denominator ? num(a.denominator, 0) : undefined, tolerance: a.tolerance !== undefined ? num(a.tolerance, 0) : undefined };
      width = 640;
      break;
    case 'fraction_shade': spec = { kind, parts: num(a.parts, num(a.denominator, 4)), shape: a.shape === 'circle' ? 'circle' : a.shape === 'grid' ? 'grid' : 'bar', numerator: num(a.numerator, 1), denominator: num(a.denominator, 2) }; width = 600; break;
    case 'plot_point': {
      const xr = arr(a.x_range).map((v) => num(v, 0)), yr = arr(a.y_range).map((v) => num(v, 0));
      spec = { kind, points: arr<Args>(a.points).map((p) => ({ x: num(p.x, 0), y: num(p.y, 0) })), xRange: xr.length === 2 ? [xr[0]!, xr[1]!] : [-6, 6], yRange: yr.length === 2 ? [yr[0]!, yr[1]!] : [-6, 6], tolerance: a.tolerance !== undefined ? num(a.tolerance, 0.25) : undefined };
      width = 460;
      break;
    }
    case 'map_click': {
      const region = a.region === 'usa' ? 'usa' : 'world';
      const names = arr(a.answers).map(str).filter(Boolean);
      let built, canon: (string | null)[];
      try {
        [built, canon] = await Promise.all([buildMap({ region, focus: arr(a.focus).map(str), pickable: true, labels: false }, fetchTopology), resolvePlaces(names, region, fetchTopology)]);
      } catch (e) {
        return { ok: false, error: `Map data unavailable: ${(e as Error).message}` };
      }
      const unknown = names.filter((_, i) => !canon[i]);
      if (unknown.length) return { ok: false, error: `Not on the map: ${unknown.join(', ')}` };
      const res = sanitizeSvg(built.svg, `mc${Math.random().toString(36).slice(2, 7)}-`, { trusted: true });
      if ('error' in res) return { ok: false, error: res.error };
      const answers = canon.map((c) => mapSlug(c!));
      spec = { kind, svg: res.svg, vw: res.vw, vh: res.vh, answers, names: Object.fromEntries(answers.map((s, i) => [s, canon[i]!])) };
      width = 620;
      break;
    }
    case 'chem_balance': spec = { kind, reactants: arr(a.reactants).map(str).filter(Boolean), products: arr(a.products).map(str).filter(Boolean) }; width = 620; break;
    case 'label': {
      const sk = board.get(str(a.sketch_id).replace(/^#/, ''));
      if (!sk || sk.type !== 'sketch') return { ok: false, error: 'label needs sketch_id: the id of a sketch you drew (its part ids are the targets)' };
      const targets = arr<Args>(a.targets).map((t) => ({ part: str(t.part), label: str(t.label) })).filter((t) => t.part && t.label);
      const missing = targets.filter((t) => !sk.content.parts.includes(t.part)).map((t) => t.part);
      if (missing.length) return { ok: false, error: `That sketch has no parts ${missing.join(', ')}; its parts are: ${sk.content.parts.slice(0, 30).join(', ')}` };
      spec = { kind, svg: sk.content.svg, vw: sk.content.vw, vh: sk.content.vh, targets, extra: arr(a.extra).map(str).filter(Boolean) };
      width = 600;
      break;
    }
    default:
      return { ok: false, error: `Unknown activity kind "${kind}"` };
  }
  const problems = validateActivity(spec);
  if (problems.length) return { ok: false, error: problems.join('; ') };
  const content: ActivityContent = {
    prompt, spec, status: 'open', attempts: 0,
    hints: arr(a.hints).map(str).filter(Boolean).slice(0, 3),
    explanation: a.explanation ? str(a.explanation) : undefined,
    step: a.step ? str(a.step) : undefined,
  };
  // Reserve room for the tallest state (feedback + hint + "Show me"), so nothing below gets covered.
  const height = Math.max(
    view.measureActivity(content, width),
    view.measureActivity({ ...content, status: 'wrong', attempts: 2, feedback: 'Not quite. 2 of 4 in the right place.', response: undefined }, width),
  );
  const el = place({ type: 'activity', content }, { width, height });
  return { ok: true, id: ref(el), note: 'The student is working on it. Encourage briefly, then call wait_for_student. You will get an [Activity] message with the result; do not say the answer.' };
}
