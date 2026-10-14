// Scripted mini-lessons that drive the same tool executor the AI uses. Lets anyone see the board
// side working without an API key (open the app with ?demo).

export interface DemoStep {
  say: string;
  tool?: string;
  args?: Record<string, unknown>;
}

export const DEMO: DemoStep[] = [
  { say: "Let's solve a linear equation together.", tool: 'write_text', args: { text: 'Linear equations', style: 'title', placement: 'new section' } },
  {
    say: 'Here are the steps. We undo each operation on x, doing the same thing to both sides.',
    tool: 'write_steps',
    args: {
      steps: [
        { latex: '2x + 4 = 10', note: 'the equation' },
        { latex: '2x = 6', note: 'subtract 4 from both sides' },
        { latex: 'x = 3', note: 'divide both sides by 2' },
      ],
    },
  },
  { say: 'This is the key move: x is now alone.', tool: 'annotate', args: { target_id: '#6', mode: 'circle', note: 'x is isolated' } },
  {
    say: 'On a graph, the solution is where the line y = 2x + 4 meets the level y = 10.',
    tool: 'plot',
    args: { functions: ['2x + 4', '10'], x_min: -1, x_max: 5, points: [{ x: 3, y: 10, label: 'x = 3' }], placement: 'right of #3' },
  },
  {
    say: 'Every linear equation follows the same plan.',
    tool: 'draw_diagram',
    args: {
      layout: 'flow-right',
      title: 'The plan',
      nodes: [
        { id: 'a', label: 'Simplify both sides' },
        { id: 'b', label: 'Move x terms to one side' },
        { id: 'c', label: 'Undo + and −' },
        { id: 'd', label: 'Undo × and ÷' },
      ],
      edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }],
      placement: 'new section',
    },
  },
  {
    say: 'Each operation has an opposite that undoes it.',
    tool: 'make_table',
    args: { title: 'Inverse operations', headers: ['Operation', 'Undo it with'], rows: [['add $a$', 'subtract $a$'], ['subtract $a$', 'add $a$'], ['multiply by $a$', 'divide by $a$'], ['divide by $a$', 'multiply by $a$']], placement: 'right of #14' },
  },
  {
    say: 'Quick check: what do we do first here?',
    tool: 'ask_question',
    args: { kind: 'choice', question: 'To solve $3x - 5 = 7$, the first step is…', choices: ['Divide both sides by 3', 'Add 5 to both sides', 'Subtract 7 from both sides'], placement: 'new section' },
  },
  {
    say: 'Now your turn: solve this one in the box, then press Done.',
    tool: 'ask_question',
    args: { kind: 'write', question: 'Solve for x:', latex: '3x - 5 = 7', placement: 'right of #19' },
  },
];
