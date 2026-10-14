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
const queue = (r: Results) => at(r, 1).id as string;
const stack = (r: Results) => at(r, 8).id as string;
const node = (r: Results, key: string) => (at(r, 11).nodes as R)[key] as string;

export const DEMO: DemoStep[] = [
  { say: 'A queue works like a line at a shop: people join at the back and leave from the front.', tool: 'write_text', args: { text: 'Queues: first in, first out', style: 'title', placement: 'new section' } },
  { say: "Here's a queue holding one item, A. Since it's the only item, it's both the front and the rear.", tool: 'draw_structure', args: { kind: 'queue', items: ['A'], title: 'queue' } },
  { say: 'When we enqueue B, it always joins at the rear, behind A. Notice that the rear pointer moves to B, while the front stays on A.', tool: 'structure_op', args: (r) => ({ id: queue(r), op: 'enqueue', value: 'B' }) },
  { say: 'Enqueue C, and again it lines up behind the last item. Nothing already in the queue moves.', tool: 'structure_op', args: (r) => ({ id: queue(r), op: 'enqueue', value: 'C' }) },
  { say: 'Dequeue is the opposite end: we always remove from the front. A was first in, so A is first out, and B becomes the new front.', tool: 'structure_op', args: (r) => ({ id: queue(r), op: 'dequeue' }) },
  { say: 'Dequeue again, and B leaves. Now C is alone, so it is both front and rear.', tool: 'structure_op', args: (r) => ({ id: queue(r), op: 'dequeue' }) },
  { say: 'That front-and-rear rule is what makes a queue fair: whoever waited longest is served next.', tool: 'annotate', args: (r) => ({ target_id: queue(r), mode: 'highlight', region: { x0: 0, x1: 0.3, y0: 0.4, y1: 1 } }) },
  { say: 'Compare that with a stack, where everything happens at one end, the top.', tool: 'write_text', args: { text: 'Stacks: last in, first out', style: 'title', placement: 'new section' } },
  { say: 'A stack of plates: we can only add or take from the top.', tool: 'draw_structure', args: { kind: 'stack', items: ['1', '2'], title: 'stack' } },
  { say: 'Pushing 3 puts it on top of 2, and the top pointer moves up with it.', tool: 'structure_op', args: (r) => ({ id: stack(r), op: 'push', value: '3' }) },
  { say: 'Pop takes from the top again, so the 3 we just added is the first to leave.', tool: 'structure_op', args: (r) => ({ id: stack(r), op: 'pop' }) },
  {
    say: "Finally, here's how a request moves through a web server.",
    tool: 'draw_diagram',
    args: (r) => ({
      layout: 'flow-right',
      nodes: [
        { id: 'in', label: 'Request arrives' },
        { id: 'q', label: 'Waits in a queue' },
        { id: 'w', label: 'Worker handles it' },
        { id: 'out', label: 'Response sent' },
      ],
      edges: [{ from: 'in', to: 'q' }, { from: 'q', to: 'w' }, { from: 'w', to: 'out' }],
      placement: `right of ${stack(r)}`,
    }),
  },
  { say: 'First, the request arrives at the server.', tool: 'update_item', args: (r) => ({ id: node(r, 'in'), state: 'active' }) },
  { say: '', tool: 'update_item', args: (r) => ({ id: node(r, 'in'), state: 'done' }) },
  { say: 'If every worker is busy, it waits in a queue, first come, first served, exactly like the one we just built.', tool: 'update_item', args: (r) => ({ id: node(r, 'q'), state: 'active' }) },
  { say: '', tool: 'update_item', args: (r) => ({ id: node(r, 'q'), state: 'done' }) },
  { say: 'And when a worker is free, it takes the request at the front of the queue.', tool: 'update_item', args: (r) => ({ id: node(r, 'w'), state: 'active' }) },
];
