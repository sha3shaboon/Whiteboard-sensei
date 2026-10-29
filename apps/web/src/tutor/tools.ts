// The AI's whiteboard commands (function calls) and how they're executed on the board.
// Placement is relative ("below #12"); the board computes exact positions and avoids overlap.
// The tool set is designed so that visual, interactive teaching is the easy path for the model.

import {
  COLORS,
  applyStructureOp,
  buildMap,
  fetchTopology,
  buildStrokeSvg,
  strokeTypeName,
  totalStrokes,
  buildFigure,
  simParams,
  simFacts,
  buildMoleculeSvg,
  buildChart,
  buildTimeline,
  arrowBounds,
  createStructure,
  describeStructure,
  structureSize,
  branchBetween,
  compileExpression,
  curveBetween,
  layoutDiagram,
  routeBetween,
  straightBetween,
  resolvePlacement,
  union,
  describeStep,
  solutionSteps,
  type Board,
  type ArrowPath,
  type CharStrokes,
  type FigureSpec,
  type MapSpec,
  type ChartSpec,
  type TimelineSpec,
  type MoleculeData,
  type StructureOp,
  type BoardElement,
  type Bounds,
  type DiagramLayout,
  type Region,
} from '@ai-tutor/board';
import { SHAPE_FONT, sanitizeSvg, wrapLines, type BoardView, type DomContent } from '@ai-tutor/board/view';
import { apiFetch } from '../api';
import type { ToolDefinition } from './realtime';
import { SUBJECT_TOOLS, SUBJECT_TOOL_NAMES, executeSubjectTool, updateSubjectSketch, type Placer } from './subjectTools';

const placement = {
  type: 'string',
  description: 'Where to put it, relative to existing items: "below #12", "right of #7", "above #3", "new section" (starts a new area for a new idea), or omit to continue under your last item.',
};
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required });

export const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    name: 'write_steps',
    description:
      'Write the next line of a solution or derivation, with an optional short note explaining the move (e.g. "subtract 4 from both sides"). Normally pass ONE step per call, as you say it; consecutive calls continue the same column underneath, aligned. Each step gets its own id so you can point at it later.',
    parameters: obj(
      {
        steps: {
          type: 'array',
          items: obj({ latex: { type: 'string', description: 'LaTeX, no $ delimiters' }, note: { type: 'string', description: 'Optional, under 8 words' } }, ['latex']),
        },
        title: { type: 'string', description: 'Optional short heading above the steps' },
        placement,
      },
      ['steps'],
    ),
  },
  {
    type: 'function',
    name: 'write_math',
    description: 'Write a single formula or equation (a definition, a key result, the problem statement). For several steps use write_steps.',
    parameters: obj({ latex: { type: 'string', description: 'LaTeX without $ delimiters' }, placement }, ['latex']),
  },
  {
    type: 'function',
    name: 'draw_diagram',
    description:
      'Draw a diagram of boxes connected by arrows, laid out and routed automatically (it draws in box by box). Afterwards, explain it part by part, annotating each part as you talk about it. Use it for processes and cycles (photosynthesis, water cycle, an algorithm), cause and effect, timelines, hierarchies and classifications, concept maps, parts of a system. Layouts: "flow-right" (sequence/timeline), "flow-down" (steps), "tree" (hierarchy/classification), "cycle" (repeating process), "hub" (central idea with related ideas; the first node is the center).',
    parameters: obj(
      {
        layout: { type: 'string', enum: ['flow-right', 'flow-down', 'tree', 'cycle', 'hub'] },
        title: { type: 'string' },
        nodes: {
          type: 'array',
          items: obj(
            {
              id: { type: 'string', description: 'Short key you choose, used in edges' },
              label: { type: 'string', description: 'Up to ~6 words' },
              shape: { type: 'string', enum: ['rectangle', 'ellipse'] },
            },
            ['id', 'label'],
          ),
        },
        edges: { type: 'array', items: obj({ from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' } }, ['from', 'to']) },
        placement,
      },
      ['layout', 'nodes'],
    ),
  },
  {
    type: 'function',
    name: 'draw_sketch',
    description:
      'Draw an illustration of a physical setup, object or scene, as SVG. Use it to SHOW things instead of describing them: a coil of wire with its loops and a magnet, field lines around a magnet, eddy-current loops in a metal plate, forces on a block on a slope, a circuit, a lens and light rays, a cell, a heart, a molecule, a geometric figure. ' +
      'Write one <svg viewBox="0 0 400 300"> (any size) using path, line, polyline, polygon, circle, ellipse, rect, text and g. Keep it clean and schematic like a teacher\'s drawing: dark outlines (stroke="#1c1c1a"), blue for the main subject (#2563eb), red for currents/forces (#dc2626), green (#16a34a) or orange (#ea580c) for highlights, light fills (e.g. fill="#dbeafe"), labels as <text> with font-size 13-16. ' +
      'Arrowheads: marker-end="url(#arrow)" (also #arrow-red, #arrow-blue, #arrow-green, #arrow-orange). Give each part an id (id="magnet", id="loop1"): you can then add to or change the picture with update_item(svg) by sending the full new SVG with the same ids, and only new parts are drawn. Parts are drawn in the order you write them, so write them in the order you explain them.',
    parameters: obj(
      {
        svg: { type: 'string', description: 'A single <svg viewBox="0 0 W H">…</svg> element' },
        title: { type: 'string' },
        width: { type: 'number', description: 'Width on the board, 240-800 (default 440)' },
        placement,
      },
      ['svg'],
    ),
  },
  {
    type: 'function',
    name: 'draw_geometry',
    description:
      'Draw a precise geometric figure; the app computes where every mark goes, so angle arcs sit inside their angle with the label on the bisector, side labels sit outside their edge, point labels sit away from the figure. ALWAYS use this (not draw_sketch) for triangles, polygons, circles, angles, altitudes, proofs and constructions. ' +
      'Coordinates are math coordinates (y up, any scale). Angles are given by vertex and the two points on its rays: {at:"B", from:"A", to:"C", label:"θ"} (right:true for a right-angle square). Constructed points: triangle_sss (from three side lengths), feet (foot of a perpendicular, for altitudes), midpoints. Parts have ids like seg-AB, angle-B, side-AB, point-A for annotate/update_item(geometry).',
    parameters: obj(
      {
        points: { type: 'array', items: obj({ name: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } }, ['name', 'x', 'y']) },
        triangle_sss: obj({ names: { type: 'array', items: { type: 'string' } }, sides: { type: 'array', items: { type: 'number' }, description: '[a, b, c] with a = BC, b = CA, c = AB' } }, ['names', 'sides']),
        feet: { type: 'array', items: obj({ name: { type: 'string' }, from: { type: 'string' }, to: { type: 'array', items: { type: 'string' } } }, ['name', 'from', 'to']) },
        midpoints: { type: 'array', items: obj({ name: { type: 'string' }, of: { type: 'array', items: { type: 'string' } } }, ['name', 'of']) },
        segments: { type: 'array', items: { type: 'string' }, description: 'Like "AB"' },
        polygons: { type: 'array', items: { type: 'string' }, description: 'Filled shapes like "ABC"' },
        angles: { type: 'array', items: obj({ at: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' }, right: { type: 'boolean' } }, ['at', 'from', 'to']) },
        sides: { type: 'array', items: obj({ from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' } }, ['from', 'to', 'label']) },
        ticks: { type: 'array', items: obj({ from: { type: 'string' }, to: { type: 'string' }, count: { type: 'number' } }, ['from', 'to']), description: 'Equal-length marks' },
        circles: { type: 'array', items: obj({ center: { type: 'string' }, radius: { type: 'number' }, through: { type: 'string' } }, ['center']) },
        title: { type: 'string' },
        width: { type: 'number' },
        placement,
      },
      [],
    ),
  },
  {
    type: 'function',
    name: 'show_stroke_order',
    description:
      'Show how to write kanji, hiragana or katakana using real stroke-order data (never draw these yourself). Strokes appear one at a time in the correct order and direction, numbered, on a practice grid with a faint guide; the newest strokes are red. ' +
      'Use reveal to go gradually: e.g. reveal 3 shows the first 3 strokes; then update_item(id, reveal: 6) adds the next ones while you explain them. The result lists every stroke with its type (horizontal, vertical, left-falling sweep, dot...) so you can describe each one correctly.',
    parameters: obj(
      {
        text: { type: 'string', description: '1-6 kanji/kana, e.g. "新"' },
        reveal: { type: 'number', description: 'How many strokes to show now (default: all)' },
        title: { type: 'string' },
        placement,
      },
      ['text'],
    ),
  },
  {
    type: 'function',
    name: 'show_map',
    description:
      'Show a real map (Natural Earth borders): never draw maps yourself. Highlight countries (or US states with region "usa") in colors, add cities as markers (lat/lon), draw routes (curved great-circle arrows, e.g. trade routes, migrations, flights), and zoom to an area (focus on countries, or bounds in degrees). ' +
      'Reveal gradually: show the base map first, then update_item(id, map: {...same fields plus the next highlight/marker/route}) step by step while you explain; only the new parts draw in. Unknown names are reported back.',
    parameters: obj(
      {
        region: { type: 'string', enum: ['world', 'usa'] },
        focus: { type: 'array', items: { type: 'string' }, description: 'Countries/states to zoom to' },
        bounds: obj({ west: { type: 'number' }, south: { type: 'number' }, east: { type: 'number' }, north: { type: 'number' } }, ['west', 'south', 'east', 'north']),
        highlight: { type: 'array', items: obj({ name: { type: 'string' }, color: { type: 'string', description: 'Hex color, optional' }, label: { type: 'string' } }, ['name']) },
        markers: { type: 'array', items: obj({ label: { type: 'string' }, lat: { type: 'number' }, lon: { type: 'number' } }, ['label', 'lat', 'lon']) },
        routes: { type: 'array', items: obj({ from: obj({ lat: { type: 'number' }, lon: { type: 'number' } }, ['lat', 'lon']), to: obj({ lat: { type: 'number' }, lon: { type: 'number' } }, ['lat', 'lon']), label: { type: 'string' } }, ['from', 'to']) },
        labels: { type: 'boolean' },
        title: { type: 'string' },
        placement,
      },
      [],
    ),
  },
  {
    type: 'function',
    name: 'show_molecule',
    description:
      'Show the real structural formula of a molecule from PubChem (never draw molecules yourself): give a common or IUPAC name ("caffeine", "glucose", "benzene", "ethanoic acid") or a SMILES string. Drawn in skeletal style (carbons are corners, heteroatoms labeled with their hydrogens); bonds draw in from one end. The result has the formula, weight and IUPAC name to talk about.',
    parameters: obj({ name: { type: 'string' }, smiles: { type: 'string' }, title: { type: 'string' }, placement }, []),
  },
  {
    type: 'function',
    name: 'draw_chart',
    description:
      'Draw a chart computed from data (to scale, round axis ticks, legend): "bar" (compare amounts), "line" (change over time), "pie" (parts of a whole, one series; percentages are computed). Use it for statistics, populations, climate, economics, experiment results. Only use data you are confident about, and say if values are approximate. ' +
      'To build it up, draw the first values, then update_item(id, chart: {...all fields with more values or another series}); only the new bars/points draw in.',
    parameters: obj(
      {
        type: { type: 'string', enum: ['bar', 'line', 'pie'] },
        labels: { type: 'array', items: { type: 'string' }, description: 'Categories or x values, e.g. ["1950","1975","2000"]' },
        series: { type: 'array', items: obj({ name: { type: 'string' }, values: { type: 'array', items: { type: 'number' } }, color: { type: 'string' } }, ['values']) },
        x_label: { type: 'string' },
        y_label: { type: 'string' },
        unit: { type: 'string', description: 'e.g. "million", "°C", "%"' },
        title: { type: 'string' },
        placement,
      },
      ['type', 'labels', 'series'],
    ),
  },
  {
    type: 'function',
    name: 'draw_timeline',
    description:
      'Draw a timeline to scale: events at their real dates, periods (with end) as bands. Dates like 1066, "500 BC", "AD 79", "1969-07-20", "3rd century BC", "65 mya". Use it for history, the history of science, geology, evolution, a person\'s life. ' +
      'Go gradually: start with one or two events, then update_item(id, timeline: {events: [...all events so far plus the next]}) as you tell the story; only new events draw in. Keep earlier events in the same order.',
    parameters: obj(
      {
        events: { type: 'array', items: obj({ date: { type: 'string' }, end: { type: 'string' }, label: { type: 'string', description: 'Short, a few words' } }, ['date', 'label']) },
        start: { type: 'string', description: 'Optional axis start date (to leave room for later events)' },
        end: { type: 'string', description: 'Optional axis end date' },
        title: { type: 'string' },
        placement,
      },
      ['events'],
    ),
  },
  {
    type: 'function',
    name: 'show_image',
    description:
      'Put a real picture on the board for things that cannot be drawn: a real place, animal, plant, artwork, historical photo or person, a rock or mineral, a cell under a microscope, a building, a machine. Images come from openly licensed sources (Wikimedia Commons, Openverse) and are credited automatically with author, license and source. ' +
      'Search in English with specific, concrete terms ("Mount Fuji from Lake Kawaguchi", "plant cell micrograph", "Mona Lisa", "Saturn Cassini"). Add a short caption saying what to notice. You will SEE the picture after it is placed, so describe what is actually in it. If it is not right, update_item(id, pick: n) swaps to one of the listed alternatives. Do not use it for things the other tools draw better (maps, molecules, geometry, charts).',
    parameters: obj(
      {
        query: { type: 'string' },
        caption: { type: 'string', description: 'One line: what the student should notice' },
        title: { type: 'string' },
        width: { type: 'number', description: 'Display width (default 420)' },
        placement,
      },
      ['query'],
    ),
  },
  {
    type: 'function',
    name: 'draw_structure',
    description:
      'Draw a data structure that you will then change step by step with structure_op, so the student SEES each operation happen (items slide in and out, pointers move). kinds: "queue" (front on the left, rear on the right), "stack" (bottom to top), "array" (with indexes), "linkedlist" (nodes with next arrows). Use it whenever you teach how a data structure or algorithm works, instead of writing its states as text.',
    parameters: obj(
      {
        kind: { type: 'string', enum: ['queue', 'stack', 'array', 'linkedlist'] },
        items: { type: 'array', items: { type: 'string' }, description: 'Initial values (may be empty)' },
        title: { type: 'string' },
        placement,
      },
      ['kind'],
    ),
  },
  {
    type: 'function',
    name: 'structure_op',
    description:
      'Apply ONE operation to a structure drawn with draw_structure; it animates on the board. Explain what is happening while it moves. ops: enqueue/dequeue (queue), push/pop (stack), insert/remove/set at index (array, linkedlist), append (any), highlight (mark an item, e.g. the one being compared), clear_highlight.',
    parameters: obj(
      {
        id: { type: 'string', description: 'The structure id, e.g. "#7"' },
        op: { type: 'string', enum: ['enqueue', 'dequeue', 'push', 'pop', 'append', 'insert', 'remove', 'set', 'highlight', 'clear_highlight'] },
        value: { type: 'string' },
        index: { type: 'number' },
      },
      ['id', 'op'],
    ),
  },
  {
    type: 'function',
    name: 'update_item',
    description:
      'Change something already on the board instead of writing it again: relabel a diagram box, change an equation or text in place, add to or change a sketch (svg), or recolor an item to show its state ("active" = the step you are on, "done", "error", "normal"). Use it to show a process advancing, a value changing, or which part you are talking about.',
    parameters: obj(
      {
        id: { type: 'string' },
        label: { type: 'string', description: 'New label (diagram box / shape)' },
        latex: { type: 'string', description: 'New LaTeX (math item)' },
        text: { type: 'string', description: 'New text (text item)' },
        state: { type: 'string', enum: ['active', 'done', 'error', 'normal'] },
        svg: { type: 'string', description: 'For sketches: the full new SVG. Keep the ids of parts that stay; new parts are drawn in, missing ones disappear.' },
        geometry: { type: 'object', description: 'For draw_geometry figures: the full new figure spec (same fields as draw_geometry). New parts are drawn in.' },
        reveal: { description: 'Stroke-order drawings: total number of strokes to show. Worked examples (show_example): "next" (default) shows one more step, a number shows that many, "all" finishes it.' },
        spec: { type: 'object', description: 'For number lines, fraction models, manipulatives, column arithmetic, periodic table, Punnett squares, glossed text, notation: the full new spec (same fields as the tool that made it).' },
        params: { type: 'object', description: 'For simulations: new parameter values (replays it)' },
        play: { type: 'boolean', description: 'For notation: play the notes again' },
        map: { type: 'object', description: 'For maps: the full new map spec (same fields as show_map). New highlights/markers/routes draw in.' },
        pick: { type: 'number', description: 'For pictures: show alternative n from the show_image result instead' },
        caption: { type: 'string', description: 'For pictures: new caption' },
        chart: { type: 'object', description: 'For charts: the full new chart spec (same fields as draw_chart).' },
        timeline: { type: 'object', description: 'For timelines: the full new timeline spec (same fields as draw_timeline).' },
      },
      ['id'],
    ),
  },
  {
    type: 'function',
    name: 'wait_for_student',
    description:
      'Call this when you have finished an explanation or worked example, or asked the student something, and now want to wait for them. Until you call it (or ask a question), the lesson keeps flowing: you automatically get the turn back after each reply.',
    parameters: obj({}, []),
  },
  {
    type: 'function',
    name: 'make_table',
    description:
      'Draw a table: comparisons (mitosis vs meiosis), properties, verb conjugations, vocabulary, data, truth tables, dates and events. Cells may contain inline math between $...$.',
    parameters: obj(
      {
        title: { type: 'string' },
        headers: { type: 'array', items: { type: 'string' } },
        rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
        placement,
      },
      ['headers', 'rows'],
    ),
  },
  {
    type: 'function',
    name: 'plot',
    description:
      'Draw a graph of one or more functions y = f(x), optionally marking points (roots, intersections, maxima). Expressions use x, + - * / ^, sin cos tan sqrt abs ln log exp, pi, e. Example: functions ["x^2 - 4", "2x - 1"], points [{x:2, y:0, label:"root"}].',
    parameters: obj(
      {
        functions: { type: 'array', items: { type: 'string' } },
        x_min: { type: 'number' },
        x_max: { type: 'number' },
        points: { type: 'array', items: obj({ x: { type: 'number' }, y: { type: 'number' }, label: { type: 'string' } }, ['x', 'y']) },
        title: { type: 'string' },
        placement,
      },
      ['functions'],
    ),
  },
  {
    type: 'function',
    name: 'ask_question',
    description:
      'Ask the student to do something ON THE BOARD. kind "write": shows the question with an answer box; the student writes or draws inside it and presses Done, and you get an [Answer] message with what they wrote. kind "choice": a clickable multiple-choice card; you get an [Answer] when they pick. Use it for practice at the end of an explanation or worked example, or for a step that is good for the student to try. Not for confirming each step. After calling it, invite them to answer and wait.',
    parameters: obj(
      {
        question: { type: 'string', description: 'The question. Inline math between $...$ (choice cards) or plain text.' },
        kind: { type: 'string', enum: ['write', 'choice'] },
        choices: { type: 'array', items: { type: 'string' }, description: 'For kind "choice": 2-5 options' },
        latex: { type: 'string', description: 'Optional: an expression to show with a "write" question, e.g. the equation to solve' },
        placement,
      },
      ['question', 'kind'],
    ),
  },
  {
    type: 'function',
    name: 'write_text',
    description: 'Only for titles, headings and short labels (at most ~10 words). Never write sentences or paragraphs: say explanations aloud and put the structure on the board with the other tools.',
    parameters: obj({ text: { type: 'string' }, style: { type: 'string', enum: ['title', 'label'] }, placement }, ['text']),
  },
  {
    type: 'function',
    name: 'write_code',
    description: 'Write a code snippet.',
    parameters: obj({ code: { type: 'string' }, language: { type: 'string' }, placement }, ['code']),
  },
  {
    type: 'function',
    name: 'draw_shape',
    description: 'Draw one labeled box or circle (for diagrams prefer draw_diagram).',
    parameters: obj(
      { shape: { type: 'string', enum: ['rectangle', 'ellipse'] }, label: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' }, placement },
      ['shape'],
    ),
  },
  {
    type: 'function',
    name: 'draw_arrow',
    description: 'Draw an arrow from one item to another (by id), optionally labeled. Great for connecting the student\'s work to yours.',
    parameters: obj({ from_id: { type: 'string' }, to_id: { type: 'string' }, label: { type: 'string' } }, ['from_id', 'to_id']),
  },
  {
    type: 'function',
    name: 'annotate',
    description:
      "Point at, circle or highlight an existing item, including the student's handwriting, with an optional short note. Use region to target part of it, as fractions of its box: {x0:0.6,x1:0.8,y0:0,y1:1} is the right part. Use this whenever you refer to something on the board, and to mark mistakes in the student's work.",
    parameters: obj(
      {
        target_id: { type: 'string' },
        mode: { type: 'string', enum: ['circle', 'highlight', 'point'] },
        region: obj({ x0: { type: 'number' }, x1: { type: 'number' }, y0: { type: 'number' }, y1: { type: 'number' } }, []),
        note: { type: 'string' },
      },
      ['target_id', 'mode'],
    ),
  },
  {
    type: 'function',
    name: 'erase',
    description: "Erase one of your own items (by id). Don't erase the student's work unless they ask.",
    parameters: obj({ id: { type: 'string' } }, ['id']),
  },
  ...SUBJECT_TOOLS,
];

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : d);
const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const id = (v: unknown) => str(v).replace(/^#/, '');
const ref = (el: { id: string }) => `#${el.id}`;

export type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };

type NewElement = Omit<BoardElement, 'id' | 'bounds' | 'createdAt' | 'updatedAt' | 'author'>;

/** Executes one AI tool call against the board. */
export function executeTool(board: Board, view: BoardView, name: string, args: Args): ToolResult | Promise<ToolResult> {
  const now = Date.now();
  const meta = { author: 'ai' as const, createdAt: now, updatedAt: now };

  /** Adds an element at an exact position. */
  const addAt = (el: NewElement, bounds: Bounds): BoardElement => {
    const element = { ...el, ...meta, id: board.nextId(), bounds } as BoardElement;
    board.add(element, 'ai');
    return element;
  };
  /** Adds one element where `placement` says, avoiding overlaps. */
  const place = (el: NewElement, size: { width: number; height: number }, where = str(args.placement)): BoardElement => {
    const pos = resolvePlacement(board, size, where || undefined, view.getViewport());
    const element = addAt(el, { ...pos, ...size });
    view.ensureVisible(element.bounds);
    return element;
  };
  const measureText = (text: string, style: 'title' | 'label' | 'note' = 'label') => {
    const content = { text, fontSize: style === 'title' ? 26 : style === 'note' ? 16 : 20, color: style === 'note' ? '#5b7bbf' : COLORS.aiInk };
    return { content, size: view.measure({ type: 'text', content }) };
  };

  if (SUBJECT_TOOL_NAMES.has(name)) return executeSubjectTool(board, view, name, args, place as unknown as Placer);
  switch (name) {
    case 'write_text': {
      const style = args.style === 'title' ? 'title' : 'label';
      const { content, size } = measureText(str(args.text), style);
      return { ok: true, id: ref(place({ type: 'text', content }, size)) };
    }

    case 'write_math': {
      const content = { latex: str(args.latex), fontSize: 26, color: COLORS.aiInk };
      return { ok: true, id: ref(place({ type: 'math', content }, view.measure({ type: 'math', content }))) };
    }

    case 'write_steps': {
      const steps = arr<{ latex?: unknown; note?: unknown }>(args.steps).filter((s) => str(s?.latex));
      if (!steps.length) return { ok: false, error: 'steps must contain at least one {latex}' };
      // Measure everything first, then reserve one block so the steps stay together.
      const title = str(args.title) ? measureText(str(args.title), 'title') : null;
      const rows = steps.map((s) => {
        const math = { latex: str(s.latex), fontSize: 26, color: COLORS.aiInk };
        const note = str(s.note) ? measureText(str(s.note), 'note') : null;
        return { math, mathSize: view.measure({ type: 'math', content: math }), note };
      });
      const noteGap = 32, rowGap = 10;
      // Continuing a previous step block: keep its equation and note columns aligned.
      const prev = previousStepRow(board);
      const mathW = Math.max(...rows.map((r) => r.mathSize.width), prev ? prev.noteX - prev.mathX - noteGap : 0);
      const rowH = rows.map((r) => Math.max(r.mathSize.height, r.note?.size.height ?? 0));
      const width = Math.max(title?.size.width ?? 0, mathW + (rows.some((r) => r.note) ? noteGap + Math.max(...rows.map((r) => r.note?.size.width ?? 0)) : 0));
      const height = (title ? title.size.height + 8 : 0) + rowH.reduce((a, b) => a + b, 0) + rowGap * (rows.length - 1);
      const origin = resolvePlacement(board, { width, height }, str(args.placement) || undefined, view.getViewport());
      if (prev && !str(args.placement) && Math.abs(origin.x - prev.mathX) < 2) origin.x = prev.mathX;
      let y = origin.y;
      const ids: string[] = [];
      let titleId: string | undefined;
      if (title) {
        titleId = ref(addAt({ type: 'text', content: title.content }, { x: origin.x, y, ...title.size }));
        y += title.size.height + 8;
      }
      rows.forEach((r, i) => {
        const h = rowH[i]!;
        ids.push(ref(addAt({ type: 'math', content: r.math }, { x: origin.x, y: y + (h - r.mathSize.height) / 2, ...r.mathSize })));
        if (r.note) addAt({ type: 'text', content: r.note.content }, { x: origin.x + mathW + noteGap, y: y + (h - r.note.size.height) / 2, ...r.note.size });
        y += h + rowGap;
      });
      view.ensureVisible({ ...origin, width, height });
      return { ok: true, title: titleId, steps: ids };
    }

    case 'write_code': {
      const content = { code: str(args.code), language: str(args.language) || 'text' };
      return { ok: true, id: ref(place({ type: 'code', content }, view.measure({ type: 'code', content }))) };
    }

    case 'plot':
    case 'plot_function': {
      const exprs = [...arr<string>(args.functions), ...(args.expression ? [str(args.expression)] : [])].map(str).filter(Boolean).slice(0, 4);
      if (!exprs.length) return { ok: false, error: 'functions must list at least one expression' };
      for (const e of exprs) {
        try {
          compileExpression(e);
        } catch (err) {
          return { ok: false, error: `Can't plot "${e}": ${(err as Error).message}. Use x, + - * / ^ and sin cos tan sqrt abs ln log exp.` };
        }
      }
      const x0 = num(args.x_min, -10), x1 = num(args.x_max, 10);
      if (!(x1 > x0)) return { ok: false, error: 'x_max must be greater than x_min' };
      const points = arr<{ x?: unknown; y?: unknown; label?: unknown }>(args.points)
        .map((p) => ({ x: num(p?.x, NaN), y: num(p?.y, NaN), label: str(p?.label) || undefined }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      const functions = exprs.map((expression, i) => ({ expression, color: COLORS.series[i % COLORS.series.length]! }));
      const legend = 20 * (functions.length + (args.title ? 1 : 0));
      const el = place({ type: 'graph', content: { functions, xRange: [x0, x1], points, title: str(args.title) || undefined } }, { width: 460, height: 300 + legend });
      return { ok: true, id: ref(el) };
    }

    case 'draw_diagram': {
      const layout = (['flow-right', 'flow-down', 'tree', 'cycle', 'hub'] as const).includes(args.layout as DiagramLayout) ? (args.layout as DiagramLayout) : 'flow-right';
      const nodes = arr<{ id?: unknown; label?: unknown; shape?: unknown }>(args.nodes)
        .map((n, i) => ({ key: str(n?.id) || `n${i + 1}`, label: str(n?.label), shape: n?.shape === 'ellipse' ? ('ellipse' as const) : ('rectangle' as const) }))
        .filter((n) => n.label)
        .slice(0, 16);
      if (!nodes.length) return { ok: false, error: 'nodes must contain at least one {id, label}' };
      const sized = nodes.map((n) => ({ ...n, size: nodeSize(n.label, n.shape) }));
      const keys = new Set(sized.map((n) => n.key));
      const edges = arr<{ from?: unknown; to?: unknown; label?: unknown }>(args.edges)
        .map((e) => ({ from: str(e?.from), to: str(e?.to), label: str(e?.label) || undefined }))
        .filter((e) => keys.has(e.from) && keys.has(e.to) && e.from !== e.to);
      // Labeled arrows need room between boxes so the label sits beside the arrow, not on a box.
      const longestLabel = Math.max(0, ...edges.map((e) => (e.label ? e.label.length * 7.6 + 24 : 0)));
      const pos = layoutDiagram(sized, edges, layout, { hGap: longestLabel, vGap: longestLabel ? 64 : 0 });
      const boxes = sized.map((n) => ({ ...pos.get(n.key)!, ...n.size }));
      const area = union(boxes)!;
      const title = str(args.title) ? measureText(str(args.title), 'title') : null;
      const titleH = title ? title.size.height + 16 : 0;
      const total = { width: Math.max(area.width, title?.size.width ?? 0), height: area.height + titleH };
      const origin = resolvePlacement(board, total, str(args.placement) || undefined, view.getViewport());
      let titleId: string | undefined;
      if (title) titleId = ref(addAt({ type: 'text', content: title.content }, { x: origin.x, y: origin.y, ...title.size }));
      const placed = new Map<string, BoardElement>();
      const pivot = { x: origin.x + area.width / 2, y: origin.y + titleH + area.height / 2 };
      const route = (a: Bounds, b: Bounds): ArrowPath =>
        layout === 'cycle' ? curveBetween(a, b, pivot) : layout === 'hub' ? straightBetween(a, b) : layout === 'tree' ? branchBetween(a, b) : routeBetween(a, b);
      const arrows: string[] = [];
      const drawn = new Set<number>();
      // Box, then the arrows that can now connect to it: the diagram builds up in reading order.
      sized.forEach((n, i) => {
        const b = boxes[i]!;
        placed.set(n.key, addAt({ type: 'shape', content: { shape: n.shape, color: COLORS.aiInk, label: n.label } }, { x: origin.x + b.x, y: origin.y + titleH + b.y, width: b.width, height: b.height }));
        edges.forEach((e, k) => {
          if (drawn.has(k) || !placed.has(e.from) || !placed.has(e.to)) return;
          drawn.add(k);
          arrows.push(ref(addArrow(route(placed.get(e.from)!.bounds, placed.get(e.to)!.bounds), e.label)));
        });
      });
      view.ensureVisible({ ...origin, ...total });
      return { ok: true, title: titleId, nodes: Object.fromEntries([...placed].map(([k, el]) => [k, ref(el)])), arrows };
    }

    case 'make_table': {
      const headers = arr(args.headers).map(str).slice(0, 8);
      if (!headers.length) return { ok: false, error: 'headers must not be empty' };
      const rows = arr<unknown[]>(args.rows).slice(0, 20).map((r) => headers.map((_, i) => str(arr(r)[i])));
      const content = { headers, rows, color: COLORS.aiInk, title: str(args.title) || undefined };
      return { ok: true, id: ref(place({ type: 'table', content }, view.measure({ type: 'table', content }, 760))) };
    }

    case 'ask_question': {
      const question = str(args.question);
      if (!question) return { ok: false, error: 'question is required' };
      if (args.kind === 'choice') {
        const choices = arr(args.choices).map(str).filter(Boolean).slice(0, 5);
        if (choices.length < 2) return { ok: false, error: 'a choice question needs 2-5 choices' };
        const content = { question, choices };
        const size = view.measure({ type: 'choice', content }, 460);
        return { ok: true, question: ref(place({ type: 'choice', content }, { width: Math.max(320, size.width), height: size.height })) };
      }
      // "write": question text (+ optional expression) and an answer box, kept together as one block.
      const q = measureText(question, 'label');
      const math = str(args.latex) ? { latex: str(args.latex), fontSize: 26, color: COLORS.aiInk } : null;
      const mathSize = math ? view.measure({ type: 'math', content: math }) : null;
      const box = { width: Math.max(440, q.size.width), height: 180 };
      const height = q.size.height + 8 + (mathSize ? mathSize.height + 8 : 0) + box.height;
      const origin = resolvePlacement(board, { width: Math.max(box.width, mathSize?.width ?? 0), height }, str(args.placement) || undefined, view.getViewport());
      const qEl = addAt({ type: 'text', content: q.content }, { ...origin, ...q.size });
      let y = origin.y + q.size.height + 8;
      let mathId: string | undefined;
      if (math && mathSize) {
        mathId = ref(addAt({ type: 'math', content: math }, { x: origin.x, y, ...mathSize }));
        y += mathSize.height + 8;
      }
      const answer = addAt({ type: 'answer', content: { question: qEl.id } }, { x: origin.x, y, ...box });
      view.ensureVisible({ x: origin.x, y: origin.y, width: box.width, height });
      return { ok: true, question: ref(qEl), expression: mathId, answer_box: ref(answer) };
    }

    case 'draw_sketch': {
      const prefix = `sk${Math.random().toString(36).slice(2, 8)}-`;
      const res = sanitizeSvg(str(args.svg), prefix);
      if ('error' in res) return { ok: false, error: res.error };
      const width = Math.min(800, Math.max(240, num(args.width, 440)));
      const title = str(args.title) || undefined;
      const size = { width, height: Math.round((width * res.vh) / res.vw) + (title ? 26 : 0) };
      const el = place({ type: 'sketch', content: { svg: res.svg, vw: res.vw, vh: res.vh, prefix, parts: res.parts, title } }, size);
      return { ok: true, id: ref(el), parts: res.parts };
    }

    case 'draw_geometry': {
      const spec = geometrySpec(args);
      const built = buildFigure(spec);
      if (!built.svg) return { ok: false, error: built.warnings.join('; ') };
      const prefix = `geo${Math.random().toString(36).slice(2, 8)}-`;
      const res = sanitizeSvg(built.svg, prefix);
      if ('error' in res) return { ok: false, error: res.error };
      const width = Math.min(700, Math.max(240, num(args.width, Math.min(460, res.vw))));
      const title = str(args.title) || undefined;
      const el = place(
        { type: 'sketch', content: { svg: res.svg, vw: res.vw, vh: res.vh, prefix, parts: res.parts, title, kind: 'geometry', source: spec } },
        { width, height: Math.round((width * res.vh) / res.vw) + (title ? 26 : 0) },
      );
      return { ok: true, id: ref(el), parts: res.parts, ...(built.warnings.length ? { warnings: built.warnings } : {}) };
    }

    case 'show_stroke_order':
      return showStrokeOrder();

    case 'show_map':
      return showMap();

    case 'show_molecule':
      return showMolecule();

    case 'show_image':
      return showImage();

    case 'draw_chart':
    case 'draw_timeline': {
      const kind = name === 'draw_chart' ? 'chart' : 'timeline';
      const spec = kind === 'chart' ? chartSpec(args) : timelineSpec(args);
      const built = kind === 'chart' ? buildChart(spec as ChartSpec) : buildTimeline(spec as TimelineSpec);
      if (!built.svg) return { ok: false, error: built.warnings.join('; ') };
      const prefix = `${kind.slice(0, 2)}${Math.random().toString(36).slice(2, 8)}-`;
      const res = sanitizeSvg(built.svg, prefix, { trusted: true });
      if ('error' in res) return { ok: false, error: res.error };
      const title = str(args.title) || undefined;
      const width = Math.min(680, Math.max(320, res.vw));
      const el = place(
        { type: 'sketch', content: { svg: res.svg, vw: res.vw, vh: res.vh, prefix, parts: res.parts, title, kind, source: spec } },
        { width, height: Math.round((width * res.vh) / res.vw) + (title ? 26 : 0) },
      );
      return { ok: true, id: ref(el), ...(built.warnings.length ? { warnings: built.warnings } : {}) };
    }

    case 'draw_structure': {
      const kind = (['queue', 'stack', 'array', 'linkedlist'] as const).find((k) => k === args.kind) ?? 'array';
      const content = createStructure(kind, arr(args.items).map(str).slice(0, 16), COLORS.aiInk, str(args.title) || undefined);
      return { ok: true, id: ref(place({ type: 'structure', content }, structureSize(content))), state: describeStructure(content) };
    }

    case 'structure_op': {
      const el = board.get(id(args.id));
      if (el?.type !== 'structure') return { ok: false, error: `${args.id} is not a structure; draw one with draw_structure first` };
      const op = str(args.op);
      const value = str(args.value);
      const index = Math.round(num(args.index, NaN));
      const needsValue = ['enqueue', 'push', 'append', 'insert', 'set'].includes(op);
      if (needsValue && !value) return { ok: false, error: `${op} needs a value` };
      const res = applyStructureOp(el.content, { op, value, index } as StructureOp);
      if (!res.ok) return { ok: false, error: res.error };
      const size = structureSize(res.content);
      board.update(el.id, { content: res.content, bounds: { ...el.bounds, width: Math.max(el.bounds.width, size.width), height: Math.max(el.bounds.height, size.height) } }, 'ai');
      view.ensureVisible(el.bounds);
      return { ok: true, state: describeStructure(res.content), ...(res.removed !== undefined ? { removed: res.removed } : {}) };
    }

    case 'update_item': {
      const el = board.get(id(args.id));
      if (!el) return { ok: false, error: `Unknown item ${args.id}` };
      if (el.author !== 'ai') return { ok: false, error: "That's the student's work; annotate it instead of changing it" };
      const subject = updateSubjectSketch(board, el, args);
      if (subject) return subject;
      if (el.type === 'simulation') {
        const params = { ...el.content.params, ...((args.params as Args) ?? {}) };
        board.update(el.id, { content: { ...el.content, params: simParams(el.content.kind, params), run: el.content.run + 1 } }, 'ai');
        return { ok: true, params: simParams(el.content.kind, params), facts: Object.fromEntries(Object.entries(simFacts(el.content.kind, simParams(el.content.kind, params))).map(([k, v]) => [k, +v.toFixed(2)])) };
      }
      if (el.type === 'activity') {
        if (el.content.mode !== 'example') return { ok: false, error: 'Activities are answered by the student; ask a new one with ask_activity (or solve one in front of them with show_example)' };
        const total = solutionSteps(el.content.spec), cur = el.content.shown ?? 0;
        const r = args.reveal;
        const shown = Math.max(0, Math.min(total, r === 'all' ? total : typeof r === 'number' || (typeof r === 'string' && /^\d+$/.test(r)) ? Number(r) : cur + 1));
        board.update(el.id, { content: { ...el.content, shown } }, 'ai');
        return {
          ok: true, shown, total,
          ...(shown > cur ? { did: Array.from({ length: shown - cur }, (_, i) => describeStep(el.content.spec, cur + i)).join('; ') } : {}),
          ...(shown >= total ? { done: true, note: 'Solved. Sum up the method in a sentence, then let the student try a similar one (ask_activity with given).' } : {}),
        };
      }
      const color = STATE_COLORS[str(args.state)];
      if (el.type === 'sketch' && el.content.kind === 'map') {
        if (!args.map || typeof args.map !== 'object') return Promise.resolve({ ok: false, error: 'Send the full new map spec as map: {...}' });
        const spec = mapSpec(args.map as Args);
        return buildMap(spec, fetchTopology).then((built): ToolResult => {
          const res = sanitizeSvg(built.svg, el.content.prefix, { trusted: true });
          if ('error' in res) return { ok: false, error: res.error };
          board.update(el.id, { content: { ...el.content, svg: res.svg, vw: res.vw, vh: res.vh, parts: res.parts, source: spec } }, 'ai');
          return { ok: true, ...(built.unmatched.length ? { not_found: built.unmatched } : {}) };
        });
      }
      if (el.type === 'sketch' && (el.content.kind === 'chart' || el.content.kind === 'timeline')) {
        const kind = el.content.kind;
        const raw = args[kind];
        if (!raw || typeof raw !== 'object') return { ok: false, error: `Send the full new ${kind} spec as ${kind}: {...}` };
        const spec = kind === 'chart' ? chartSpec(raw as Args) : timelineSpec(raw as Args);
        const built = kind === 'chart' ? buildChart(spec as ChartSpec) : buildTimeline(spec as TimelineSpec);
        if (!built.svg) return { ok: false, error: built.warnings.join('; ') };
        const res = sanitizeSvg(built.svg, el.content.prefix, { trusted: true });
        if ('error' in res) return { ok: false, error: res.error };
        // Grow with the data (more bars, a longer timeline) rather than shrinking the drawing.
        const width = Math.max(el.bounds.width, Math.min(680, res.vw));
        const height = Math.round((width * res.vh) / res.vw) + (el.content.title ? 26 : 0);
        board.update(el.id, { content: { ...el.content, svg: res.svg, vw: res.vw, vh: res.vh, parts: res.parts, source: spec }, bounds: { ...el.bounds, width, height } }, 'ai');
        return { ok: true, ...(built.warnings.length ? { warnings: built.warnings } : {}) };
      }
      if (el.type === 'image') {
        const alts = (el.content.alternatives ?? []) as ImageHit[];
        const pick = args.pick === undefined ? -1 : Math.round(num(args.pick, -1));
        if (pick >= alts.length) return { ok: false, error: `There are ${alts.length} alternatives (0-${alts.length - 1})` };
        const hit = pick >= 0 ? alts[pick]! : null;
        const content = { ...el.content, ...(hit ? imageContent(hit) : {}), caption: args.caption !== undefined ? str(args.caption) || undefined : el.content.caption };
        const height = imageHeight(el.bounds.width, content);
        board.update(el.id, { content, bounds: { ...el.bounds, height } }, 'ai');
        return hit ? seeImage(ref(el), hit, { ok: true, now_showing: describeHit(hit) }) : { ok: true };
      }
      if (el.type === 'sketch' && el.content.kind === 'molecule') return { ok: false, error: 'Molecules are fixed; use annotate to point at a part, or show_molecule for another one' };
      if (el.type === 'sketch' && el.content.kind === 'strokes') {
        const chars = el.content.source as CharStrokes[];
        const total = totalStrokes(chars);
        const prev = el.content.shownStrokes ?? total;
        const shown = Math.min(total, Math.max(1, Math.round(num(args.reveal, total))));
        const built = buildStrokeSvg(chars, shown, Math.min(prev, shown - 1));
        const res = sanitizeSvg(built.svg, el.content.prefix);
        if ('error' in res) return { ok: false, error: res.error };
        board.update(el.id, { content: { ...el.content, svg: res.svg, parts: res.parts, shownStrokes: shown } }, 'ai');
        return { ok: true, shown, total, ...(shown > prev ? { now_drawing: strokeList(chars).slice(prev, shown) } : {}) };
      }
      if (el.type === 'sketch' && el.content.kind === 'geometry') {
        if (!args.geometry || typeof args.geometry !== 'object') return { ok: false, error: 'Send the full new figure as geometry: {...}' };
        const spec = geometrySpec(args.geometry as Args);
        const built = buildFigure(spec);
        if (!built.svg) return { ok: false, error: built.warnings.join('; ') };
        const res = sanitizeSvg(built.svg, el.content.prefix);
        if ('error' in res) return { ok: false, error: res.error };
        const height = Math.round((el.bounds.width * res.vh) / res.vw) + (el.content.title ? 26 : 0);
        board.update(el.id, { content: { ...el.content, svg: res.svg, vw: res.vw, vh: res.vh, parts: res.parts, source: spec }, bounds: { ...el.bounds, height } }, 'ai');
        return { ok: true, parts: res.parts, ...(built.warnings.length ? { warnings: built.warnings } : {}) };
      }
      if (el.type === 'sketch') {
        if (!str(args.svg)) return { ok: false, error: 'Send the full new svg to change a sketch' };
        const res = sanitizeSvg(str(args.svg), el.content.prefix);
        if ('error' in res) return { ok: false, error: res.error };
        const height = Math.round((el.bounds.width * res.vh) / res.vw) + (el.content.title ? 26 : 0);
        board.update(el.id, { content: { ...el.content, svg: res.svg, vw: res.vw, vh: res.vh, parts: res.parts }, bounds: { ...el.bounds, height } }, 'ai');
        return { ok: true, parts: res.parts };
      }
      if (el.type === 'shape') {
        board.update(el.id, { content: { ...el.content, label: args.label !== undefined ? str(args.label) : el.content.label, color: color ?? el.content.color } }, 'ai');
      } else if (el.type === 'math' || el.type === 'text') {
        const content = el.type === 'math'
          ? { ...el.content, latex: args.latex !== undefined ? str(args.latex) : el.content.latex, color: color ?? el.content.color }
          : { ...el.content, text: args.text !== undefined ? str(args.text) : el.content.text, color: color ?? el.content.color };
        const size = view.measure({ type: el.type, content } as DomContent);
        board.update(el.id, { content, bounds: { ...el.bounds, ...size } }, 'ai');
      } else if (el.type === 'arrow' || el.type === 'table') {
        if (!color) return { ok: false, error: 'Only state (color) can be changed on this item' };
        board.update(el.id, { content: { ...el.content, color } as typeof el.content }, 'ai');
      } else {
        return { ok: false, error: `Can't update a ${el.type}; use structure_op for structures` };
      }
      return { ok: true };
    }

    case 'wait_for_student':
      return { ok: true };

    case 'draw_shape': {
      const shape = args.shape === 'ellipse' ? 'ellipse' : 'rectangle';
      const label = str(args.label) || undefined;
      const auto = label ? nodeSize(label, shape) : { width: 160, height: 80 };
      const size = { width: Math.min(800, Math.max(40, num(args.width, auto.width))), height: Math.min(600, Math.max(30, num(args.height, auto.height))) };
      return { ok: true, id: ref(place({ type: 'shape', content: { shape, color: COLORS.aiInk, label } }, size)) };
    }

    case 'draw_arrow': {
      const a = board.get(id(args.from_id)), b = board.get(id(args.to_id));
      if (!a || !b) return { ok: false, error: `Unknown item ${!a ? args.from_id : args.to_id}` };
      return { ok: true, id: ref(addArrow(routeBetween(a.bounds, b.bounds), str(args.label) || undefined)) };
    }

    case 'annotate': {
      const target = board.get(id(args.target_id));
      if (!target) return { ok: false, error: `Unknown item ${args.target_id}` };
      const r = (args.region ?? {}) as Partial<Record<keyof Region, unknown>>;
      const region = { x0: clamp01(num(r.x0, 0)), x1: clamp01(num(r.x1, 1)), y0: clamp01(num(r.y0, 0)), y1: clamp01(num(r.y1, 1)) };
      const mode = args.mode === 'highlight' || args.mode === 'point' ? args.mode : 'circle';
      const el = addAt({ type: 'annotation', content: { target: target.id, mode, region, color: COLORS.annotation, note: str(args.note) || undefined } }, target.bounds);
      view.ensureVisible(target.bounds);
      return { ok: true, id: ref(el) };
    }

    case 'erase': {
      const el = board.get(id(args.id));
      if (!el) return { ok: false, error: `Unknown item ${args.id}` };
      board.remove(el.id, 'ai');
      for (const a of board.all()) if (a.type === 'annotation' && a.content.target === el.id) board.remove(a.id, 'ai');
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unknown tool ${name}` };
  }

  async function showStrokeOrder(): Promise<ToolResult> {
    const text = str(args.text).trim();
    if (!text) return { ok: false, error: 'text is required' };
    const res = await apiFetch(`/api/strokes/${encodeURIComponent(text)}`);
    const body = (await res.json().catch(() => ({}))) as { chars?: CharStrokes[]; credit?: string; error?: string };
    if (!res.ok || !body.chars) return { ok: false, error: body.error ?? `Stroke data unavailable (${res.status})` };
    const chars = body.chars;
    const total = totalStrokes(chars);
    const shown = Math.min(total, Math.max(1, Math.round(num(args.reveal, total))));
    const prefix = `ko${Math.random().toString(36).slice(2, 8)}-`;
    const built = buildStrokeSvg(chars, shown, 0);
    const clean = sanitizeSvg(built.svg, prefix);
    if ('error' in clean) return { ok: false, error: clean.error };
    const title = str(args.title) || undefined;
    const width = Math.min(640, 230 * chars.length + 14 * (chars.length - 1));
    const el = place(
      { type: 'sketch', content: { svg: clean.svg, vw: clean.vw, vh: clean.vh, prefix, parts: clean.parts, title, kind: 'strokes', source: chars, credit: body.credit, shownStrokes: shown } },
      { width, height: Math.round((width * clean.vh) / clean.vw) + (title ? 26 : 0) + 20 },
    );
    return { ok: true, id: ref(el), shown, total, strokes: strokeList(chars) };
  }

  async function showMolecule(): Promise<ToolResult> {
    const q = str(args.smiles).trim() ? `smiles=${encodeURIComponent(str(args.smiles).trim())}` : `name=${encodeURIComponent(str(args.name).trim())}`;
    if (!str(args.smiles).trim() && !str(args.name).trim()) return { ok: false, error: 'Give a name or smiles' };
    const res = await apiFetch(`/api/molecule?${q}`);
    const body = (await res.json().catch(() => ({}))) as { molecule?: MoleculeData & { iupac?: string; weight?: string }; credit?: string; error?: string };
    if (!res.ok || !body.molecule) return { ok: false, error: body.error ?? `Structure unavailable (${res.status})` };
    const m = body.molecule;
    const built = buildMoleculeSvg(m);
    const prefix = `mol${Math.random().toString(36).slice(2, 8)}-`;
    const clean = sanitizeSvg(built.svg, prefix, { trusted: true });
    if ('error' in clean) return { ok: false, error: clean.error };
    const title = str(args.title) || built.title;
    const width = Math.min(520, Math.max(200, clean.vw * 1.1));
    const el = place(
      { type: 'sketch', content: { svg: clean.svg, vw: clean.vw, vh: clean.vh, prefix, parts: clean.parts, title, kind: 'molecule', source: { cid: m.cid, title: m.title }, credit: body.credit } },
      { width, height: Math.round((width * clean.vh) / clean.vw) + 26 + 20 },
    );
    return { ok: true, id: ref(el), name: m.title, formula: m.formula, iupac: m.iupac, molar_mass: m.weight ? `${m.weight} g/mol` : undefined };
  }

  async function showImage(): Promise<ToolResult> {
    const query = str(args.query).trim();
    if (!query) return { ok: false, error: 'query is required' };
    const res = await apiFetch(`/api/images?q=${encodeURIComponent(query)}`);
    const body = (await res.json().catch(() => ({}))) as { results?: ImageHit[]; error?: string };
    if (!res.ok || !body.results) return { ok: false, error: body.error ?? `Image search unavailable (${res.status})` };
    if (!body.results.length) return { ok: false, error: `No openly licensed picture found for "${query}". Try simpler or different words.` };
    const [hit, ...rest] = body.results.slice(0, 6) as [ImageHit, ...ImageHit[]];
    const width = Math.min(640, Math.max(200, num(args.width, 420)));
    const content = { ...imageContent(hit), title: str(args.title) || undefined, caption: str(args.caption) || undefined, alternatives: body.results.slice(0, 6) };
    const el = place({ type: 'image', content }, { width, height: imageHeight(width, content) });
    return seeImage(ref(el), hit, {
      ok: true,
      id: ref(el),
      showing: describeHit(hit),
      ...(rest.length ? { alternatives: body.results.slice(0, 6).map((r, i) => `${i}: ${r.title}`) } : {}),
    });
  }

  async function showMap(): Promise<ToolResult> {
    const spec = mapSpec(args);
    let built;
    try {
      built = await buildMap(spec, fetchTopology);
    } catch (err) {
      return { ok: false, error: `Map data unavailable: ${(err as Error).message}` };
    }
    const prefix = `map${Math.random().toString(36).slice(2, 8)}-`;
    const res = sanitizeSvg(built.svg, prefix, { trusted: true });
    if ('error' in res) return { ok: false, error: res.error };
    const title = str(args.title) || undefined;
    const width = 560;
    const el = place(
      { type: 'sketch', content: { svg: res.svg, vw: res.vw, vh: res.vh, prefix, parts: res.parts, title, kind: 'map', source: spec, credit: built.credit } },
      { width, height: Math.round((width * res.vh) / res.vw) + (title ? 26 : 0) + 20 },
    );
    return { ok: true, id: ref(el), shown: built.matched, ...(built.unmatched.length ? { not_found: built.unmatched } : {}) };
  }

  function addArrow(path: ArrowPath, label?: string): BoardElement {
    return addAt({ type: 'arrow', content: { ...path, color: COLORS.aiInk, label } }, arrowBounds(path));
  }
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

const STATE_COLORS: Record<string, string> = { active: '#ea580c', done: '#16a34a', error: '#dc2626', normal: COLORS.aiInk };

let measureCtx: CanvasRenderingContext2D | null = null;

/** Box size that fits a wrapped label (canvas text, same font as the shape renderer). */
function nodeSize(label: string, shape: 'rectangle' | 'ellipse'): { width: number; height: number } {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  measureCtx.font = `${SHAPE_FONT}px system-ui, sans-serif`;
  const natural = measureCtx.measureText(label).width;
  const width = Math.round(Math.min(220, Math.max(110, natural + 32)) * (shape === 'ellipse' ? 1.3 : 1));
  const inner = shape === 'ellipse' ? width * 0.64 : width - 24;
  const lines = wrapLines(measureCtx, label, inner).length;
  return { width, height: Math.max(shape === 'ellipse' ? 64 : 52, lines * SHAPE_FONT * 1.25 + (shape === 'ellipse' ? 36 : 24)) };
}

/**
 * If the most recent AI item is a step (an AI math line, possibly with a note to its right),
 * returns the x of its equation and note columns so the next step lines up with it.
 */
function previousStepRow(board: Board): { mathX: number; noteX: number } | null {
  const ai = board.all().filter((e) => e.author === 'ai' && e.type !== 'annotation' && e.type !== 'arrow');
  const last = ai.at(-1), beforeLast = ai.at(-2);
  const math = last?.type === 'math' ? last : beforeLast?.type === 'math' && last?.type === 'text' ? beforeLast : null;
  if (!math) return null;
  const note = last !== math && last && last.bounds.x > math.bounds.x + math.bounds.width ? last : null;
  return { mathX: math.bounds.x, noteX: note ? note.bounds.x : math.bounds.x + math.bounds.width + 32 };
}

/** The figure fields of a draw_geometry call, loosely validated (the builder reports anything unusable). */
function geometrySpec(a: Record<string, unknown>): FigureSpec {
  const list = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : undefined);
  const sss = a.triangle_sss as { names?: unknown; sides?: unknown } | undefined;
  return {
    points: list<{ name: string; x: unknown; y: unknown }>(a.points)?.map((p) => ({ name: String(p.name), x: Number(p.x), y: Number(p.y) })),
    triangle_sss:
      sss && Array.isArray(sss.names) && Array.isArray(sss.sides) && sss.names.length === 3 && sss.sides.length === 3
        ? { names: sss.names.map(String) as [string, string, string], sides: sss.sides.map(Number) as [number, number, number] }
        : undefined,
    feet: list(a.feet),
    midpoints: list(a.midpoints),
    segments: list(a.segments),
    polygons: list(a.polygons),
    angles: list(a.angles),
    sides: list(a.sides),
    ticks: list(a.ticks),
    circles: list(a.circles),
  };
}

/** "新 stroke 1: dot" etc., numbered across characters, for the tutor's narration. */
function strokeList(chars: CharStrokes[]): string[] {
  return chars.flatMap((c) => c.strokes.map((s, i) => `${c.char} stroke ${i + 1}: ${strokeTypeName(s.type)}`));
}

/** The map fields of a show_map call, loosely validated. */
function mapSpec(a: Record<string, unknown>): MapSpec {
  const list = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : undefined);
  const n = (v: unknown) => Number(v);
  const b = a.bounds as Record<string, unknown> | undefined;
  return {
    region: a.region === 'usa' ? 'usa' : 'world',
    focus: list<unknown>(a.focus)?.map(String),
    bounds: b && [b.west, b.south, b.east, b.north].every((v) => Number.isFinite(Number(v))) ? { west: n(b.west), south: n(b.south), east: n(b.east), north: n(b.north) } : undefined,
    highlight: list<Record<string, unknown>>(a.highlight)?.map((h) => ({ name: String(h.name), color: h.color ? String(h.color) : undefined, label: h.label ? String(h.label) : undefined })),
    markers: list<Record<string, unknown>>(a.markers)
      ?.map((m) => ({ label: String(m.label), lat: n(m.lat), lon: n(m.lon) }))
      .filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon)),
    routes: list<Record<string, Record<string, unknown>>>(a.routes)
      ?.map((r) => ({ from: { lat: n(r.from?.lat), lon: n(r.from?.lon) }, to: { lat: n(r.to?.lat), lon: n(r.to?.lon) }, label: r.label ? String(r.label) : undefined }))
      .filter((r) => [r.from.lat, r.from.lon, r.to.lat, r.to.lon].every(Number.isFinite)),
    labels: a.labels === false ? false : undefined,
  };
}

/** The fields of a draw_chart call, loosely validated. */
function chartSpec(a: Record<string, unknown>): ChartSpec {
  const opt = (v: unknown) => (v == null || v === '' ? undefined : String(v));
  return {
    type: a.type === 'line' || a.type === 'pie' ? a.type : 'bar',
    labels: (Array.isArray(a.labels) ? a.labels : []).map(String),
    series: (Array.isArray(a.series) ? a.series : []).map((s: Record<string, unknown>) => ({
      name: opt(s?.name),
      color: opt(s?.color),
      values: (Array.isArray(s?.values) ? s.values : []).map((v) => (typeof v === 'number' ? v : Number.parseFloat(String(v).replace(/,/g, '')))),
    })),
    x_label: opt(a.x_label),
    y_label: opt(a.y_label),
    unit: opt(a.unit),
  };
}

/** The fields of a draw_timeline call, loosely validated. */
function timelineSpec(a: Record<string, unknown>): TimelineSpec {
  const date = (v: unknown) => (typeof v === 'number' ? v : String(v ?? ''));
  return {
    events: (Array.isArray(a.events) ? a.events : []).map((e: Record<string, unknown>) => ({
      date: date(e?.date),
      label: String(e?.label ?? ''),
      ...(e?.end != null && e.end !== '' ? { end: date(e.end) } : {}),
    })),
    ...(a.start != null && a.start !== '' ? { start: date(a.start) } : {}),
    ...(a.end != null && a.end !== '' ? { end: date(a.end) } : {}),
  };
}

interface ImageHit {
  id: string;
  title: string;
  description: string;
  url: string;
  width: number;
  height: number;
  source: string;
  author: string;
  license: string;
  licenseUrl?: string;
  provider: string;
}

function imageContent(h: ImageHit) {
  return { url: h.url, width: h.width || 4, height: h.height || 3, author: h.author, license: h.license, licenseUrl: h.licenseUrl, source: h.source, provider: h.provider };
}

/** Picture height plus room for the title, caption and credit lines. */
function imageHeight(width: number, c: { width: number; height: number; title?: string; caption?: string }): number {
  const ratio = c.width > 0 && c.height > 0 ? c.height / c.width : 0.75;
  const captionLines = c.caption ? Math.ceil((c.caption.length * 7.4) / width) : 0;
  return Math.round(width * Math.min(ratio, 1.6) + (c.title ? 26 : 0) + captionLines * 19 + (c.caption ? 6 : 0) + 22);
}

function describeHit(h: ImageHit): string {
  return `${h.title}${h.description ? ` (${h.description.slice(0, 160)})` : ''}; ${h.author}, ${h.license}, ${h.provider}`;
}

/**
 * Adds the picture itself (downscaled) to a tool result so the model can look at it; the realtime
 * client sends it as an image message. Without it the tutor would describe a photo it hasn't seen.
 */
async function seeImage(id: string, hit: ImageHit, result: ToolResult & { ok: true }): Promise<ToolResult> {
  try {
    const res = await apiFetch(`/api/images/view?url=${encodeURIComponent(hit.url)}`);
    if (!res.ok) return result;
    const bitmap = await createImageBitmap(await res.blob());
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return {
      ...result,
      see: {
        image: canvas.toDataURL('image/jpeg', 0.8),
        text: `[Picture] This is the picture now on the board as ${id} ("${hit.title}"), sent by the app (not the student) so you can see it. Describe only what is really in it; if it doesn't fit, swap it with update_item pick.`,
      },
    };
  } catch {
    return result;
  }
}
