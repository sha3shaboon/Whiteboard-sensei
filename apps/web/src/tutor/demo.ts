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

export const DEMO: DemoStep[] = [
  { say: "Let's solve a linear equation, one step at a time.", tool: 'write_text', args: { text: 'Linear equations', style: 'title', placement: 'new section' } },
  { say: 'Here is our equation: two x plus four equals ten.', tool: 'write_steps', args: { steps: [{ latex: '2x + 4 = 10', note: 'the equation' }] } },
  { say: 'First, I subtract four from both sides, so the plus four disappears.', tool: 'write_steps', args: { steps: [{ latex: '2x = 6', note: 'subtract 4 from both sides' }] } },
  { say: 'Then I divide both sides by two.', tool: 'write_steps', args: { steps: [{ latex: 'x = 3', note: 'divide both sides by 2' }] } },
  { say: 'And x is on its own: x equals three.', tool: 'annotate', args: (r) => ({ target_id: (at(r, 3).steps as string[])[0], mode: 'circle', note: 'x is isolated' }) },
  {
    say: "On a graph, that's where the line y equals two x plus four reaches ten.",
    tool: 'plot',
    args: (r) => ({ functions: ['2x + 4', '10'], x_min: -1, x_max: 5, points: [{ x: 3, y: 10, label: 'x = 3' }], placement: `right of ${(at(r, 1).steps as string[])[0]}` }),
  },
  {
    say: 'Now a cycle: how water moves around the planet.',
    tool: 'draw_diagram',
    args: {
      layout: 'cycle',
      title: 'The water cycle',
      nodes: [
        { id: 'evap', label: 'Evaporation' },
        { id: 'cond', label: 'Condensation' },
        { id: 'prec', label: 'Precipitation' },
        { id: 'coll', label: 'Collection' },
      ],
      edges: [{ from: 'evap', to: 'cond' }, { from: 'cond', to: 'prec' }, { from: 'prec', to: 'coll' }, { from: 'coll', to: 'evap' }],
      placement: 'new section',
    },
  },
  { say: 'It starts here: the sun heats water and it evaporates.', tool: 'annotate', args: (r) => ({ target_id: (at(r, 6).nodes as R).evap, mode: 'point', note: 'start here' }) },
  {
    say: 'And a classification, drawn as a tree.',
    tool: 'draw_diagram',
    args: (r) => ({
      layout: 'tree',
      title: 'Numbers',
      nodes: [
        { id: 'r', label: 'Real numbers' },
        { id: 'q', label: 'Rational' },
        { id: 'i', label: 'Irrational' },
        { id: 'z', label: 'Integers' },
        { id: 'f', label: 'Fractions' },
      ],
      edges: [{ from: 'r', to: 'q' }, { from: 'r', to: 'i' }, { from: 'q', to: 'z' }, { from: 'q', to: 'f' }],
      placement: `right of ${(at(r, 6).nodes as R).cond}`,
    }),
  },
  {
    say: 'Your turn: solve this one in the box, then press Done.',
    tool: 'ask_question',
    args: { kind: 'write', question: 'Solve for x:', latex: '3x - 5 = 7', placement: 'new section' },
  },
];
