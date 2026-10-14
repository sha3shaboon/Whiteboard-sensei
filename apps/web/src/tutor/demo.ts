// Scripted mini-lesson that drives the same tool executor the AI uses, one step at a time.
// Lets anyone see the board side working without an API key (open the app with ?demo).

import type { ToolResult } from './tools';

type Results = ToolResult[];
type R = Record<string, unknown>;

export interface DemoStep {
  say: string;
  tool?: string;
  /** Static args, or computed from earlier steps' results (to reference the ids they created). */
  args?: Record<string, unknown> | ((results: Results) => Record<string, unknown>);
}

const at = (results: Results, i: number) => results[i] as R;
const idOf = (r: Results, i: number) => at(r, i).id as string;

// The eddy-current sketch, built up in layers. Each layer keeps the ids of the previous ones,
// so only the new parts are drawn in.
const plate = `
  <polygon id="plate" points="40,200 320,200 400,262 120,262" fill="#e5e7eb"/>
  <text id="plate-label" x="300" y="282" fill="#6b6b66">copper plate</text>
  <rect id="magnet-s" x="185" y="40" width="60" height="38" fill="#dbeafe"/>
  <text id="s-label" x="215" y="65" text-anchor="middle" font-weight="600">S</text>
  <rect id="magnet-n" x="185" y="78" width="60" height="38" fill="#fecaca"/>
  <text id="n-label" x="215" y="103" text-anchor="middle" font-weight="600">N</text>
  <line id="motion" x1="262" y1="78" x2="330" y2="78" stroke="#2563eb" marker-end="url(#arrow-blue)"/>
  <text id="motion-label" x="296" y="68" text-anchor="middle" fill="#2563eb">moving</text>`;
const field = `
  <path id="b1" d="M200 120 L192 212" stroke="#2563eb" stroke-width="1.5" marker-end="url(#arrow-blue)"/>
  <path id="b2" d="M215 120 L215 214" stroke="#2563eb" stroke-width="1.5" marker-end="url(#arrow-blue)"/>
  <path id="b3" d="M230 120 L238 212" stroke="#2563eb" stroke-width="1.5" marker-end="url(#arrow-blue)"/>
  <text id="b-label" x="246" y="170" fill="#2563eb" font-style="italic">B</text>`;
const eddies = `
  <ellipse id="eddy-front" cx="285" cy="232" rx="38" ry="13" stroke="#dc2626" stroke-width="2.5"/>
  <path id="eddy-front-dir" d="M280 219 L292 219" stroke="#dc2626" stroke-width="2.5" marker-end="url(#arrow-red)"/>
  <ellipse id="eddy-back" cx="160" cy="232" rx="38" ry="13" stroke="#dc2626" stroke-width="2.5"/>
  <path id="eddy-back-dir" d="M166 219 L154 219" stroke="#dc2626" stroke-width="2.5" marker-end="url(#arrow-red)"/>
  <text id="eddy-label" x="330" y="236" fill="#dc2626">eddy currents</text>`;
const drag = `
  <line id="drag" x1="180" y1="97" x2="118" y2="97" stroke="#ea580c" stroke-width="2.5" marker-end="url(#arrow-orange)"/>
  <text id="drag-label" x="110" y="86" text-anchor="middle" fill="#ea580c">drag</text>`;
const sketch = (...layers: string[]) => `<svg viewBox="0 0 440 290">${layers.join('')}</svg>`;

export const DEMO: DemoStep[] = [
  { say: "Let's label a triangle properly: three vertices, three angles, three sides.", tool: 'write_text', args: { text: 'Triangles', style: 'title', placement: 'new section' } },
  {
    say: 'Each angle sits at a vertex, between the two sides that meet there, and each side is named after the opposite vertex.',
    tool: 'draw_geometry',
    args: {
      points: [{ name: 'A', x: 0, y: 0 }, { name: 'B', x: 6, y: 0 }, { name: 'C', x: 2, y: 3.5 }],
      polygons: ['ABC'],
      angles: [{ at: 'A', from: 'B', to: 'C', label: 'α' }, { at: 'B', from: 'A', to: 'C', label: 'β' }, { at: 'C', from: 'A', to: 'B', label: 'γ' }],
      sides: [{ from: 'B', to: 'C', label: 'a' }, { from: 'C', to: 'A', label: 'b' }, { from: 'A', to: 'B', label: 'c' }],
    },
  },
  {
    say: 'The height from C drops straight down onto AB, meeting it at a right angle at H.',
    tool: 'update_item',
    args: (r) => ({
      id: idOf(r, 1),
      geometry: {
        points: [{ name: 'A', x: 0, y: 0 }, { name: 'B', x: 6, y: 0 }, { name: 'C', x: 2, y: 3.5 }],
        feet: [{ name: 'H', from: 'C', to: ['A', 'B'] }],
        polygons: ['ABC'],
        segments: ['CH'],
        angles: [{ at: 'A', from: 'B', to: 'C', label: 'α' }, { at: 'B', from: 'A', to: 'C', label: 'β' }, { at: 'C', from: 'A', to: 'B', label: 'γ' }, { at: 'H', from: 'B', to: 'C', right: true }],
        sides: [{ from: 'B', to: 'C', label: 'a' }, { from: 'C', to: 'A', label: 'b' }, { from: 'A', to: 'B', label: 'c' }],
      },
    }),
  },
  { say: 'Now kanji: 新, "new". It has thirteen strokes, and the order matters.', tool: 'write_text', args: { text: '新 (new): stroke order', style: 'title', placement: 'new section' } },
  { say: 'It starts with 立 at the top left: a short stroke on top, a horizontal, two short strokes leaning in, and a long horizontal.', tool: 'show_stroke_order', args: { text: '新', reveal: 5 } },
  { say: 'Under it comes 木, tree: a horizontal, the vertical through the middle, then the two sweeps out to the sides.', tool: 'update_item', args: (r) => ({ id: idOf(r, 4), reveal: 9 }) },
  { say: 'And the right side is 斤, the axe: two left-falling strokes, a horizontal, and a long vertical to finish.', tool: 'update_item', args: (r) => ({ id: idOf(r, 4), reveal: 13 }) },
  { say: "Eddy currents are loops of current that appear inside a piece of metal when the magnetic field through it changes.", tool: 'write_text', args: { text: 'Eddy currents', style: 'title', placement: 'new section' } },
  { say: "Picture a magnet sliding over a copper plate. Copper isn't magnetic, but it conducts electricity very well.", tool: 'draw_sketch', args: { svg: sketch(plate), title: 'Magnet moving over a copper plate', width: 460 } },
  { say: "The magnet's field passes down into the plate. As the magnet moves, the amount of field through each patch of copper keeps changing.", tool: 'update_item', args: (r) => ({ id: idOf(r, 8), svg: sketch(plate, field) }) },
  { say: 'That change pushes the free electrons around in little circles: these swirling loops are the eddy currents. Ahead of the magnet they circulate one way, behind it the other way.', tool: 'update_item', args: (r) => ({ id: idOf(r, 8), svg: sketch(plate, field, eddies) }) },
  { say: "This is Faraday's law: a changing magnetic flux creates a voltage, and in a solid conductor that voltage drives the currents round in loops.", tool: 'write_math', args: (r) => ({ latex: '\\mathcal{E} = -\\frac{d\\Phi_B}{dt}', placement: `right of ${idOf(r, 8)}` }) },
  { say: "The minus sign is Lenz's law: the currents make their own magnetic field that opposes the change.", tool: 'write_text', args: { text: "Lenz: the induced field opposes the change" } },
  { say: "So the plate pushes back on the magnet. That's a drag force, and it's exactly how magnetic brakes on trains and roller coasters work, with no contact at all.", tool: 'update_item', args: (r) => ({ id: idOf(r, 8), svg: sketch(plate, field, eddies, drag) }) },
  { say: 'Now something different: a queue, where items join at the back and leave from the front.', tool: 'write_text', args: { text: 'Queues: first in, first out', style: 'title', placement: 'new section' } },
  { say: "Here's a queue with one item, A, which is both the front and the rear.", tool: 'draw_structure', args: { kind: 'queue', items: ['A'], title: 'queue' } },
  { say: 'Enqueue B: it joins at the rear, behind A, and the rear pointer moves to it. A does not move.', tool: 'structure_op', args: (r) => ({ id: idOf(r, 15), op: 'enqueue', value: 'B' }) },
  { say: 'Enqueue C, lining up behind B.', tool: 'structure_op', args: (r) => ({ id: idOf(r, 15), op: 'enqueue', value: 'C' }) },
  { say: 'Dequeue always takes from the front: A was first in, so A is first out, and B becomes the front.', tool: 'structure_op', args: (r) => ({ id: idOf(r, 15), op: 'dequeue' }) },
  {
    say: 'A web server uses exactly this to handle requests fairly.',
    tool: 'draw_diagram',
    args: (r) => ({
      layout: 'flow-right',
      nodes: [
        { id: 'in', label: 'Request arrives' },
        { id: 'q', label: 'Request queue' },
        { id: 'w', label: 'Worker' },
      ],
      edges: [{ from: 'in', to: 'q', label: 'enqueue' }, { from: 'q', to: 'w', label: 'dequeue' }],
      placement: `right of ${idOf(r, 15)}`,
    }),
  },
];
