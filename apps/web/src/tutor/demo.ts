// Scripted mini-lesson that drives the same tool executor the AI uses. Lets anyone see the board
// side working without an API key (open the app with ?demo).

export interface DemoStep {
  say: string;
  tool?: string;
  args?: Record<string, unknown>;
}

export const DEMO: DemoStep[] = [
  { say: "Let's solve a linear equation together.", tool: 'write_text', args: { text: 'Solving a linear equation', placement: 'new section' } },
  { say: 'Here is the equation.', tool: 'write_math', args: { latex: '2x + 4 = 10' } },
  { say: 'First, subtract 4 from both sides.', tool: 'write_math', args: { latex: '2x = 10 - 4 = 6' } },
  { say: 'Then divide both sides by 2.', tool: 'write_math', args: { latex: 'x = \\frac{6}{2} = 3' } },
  { say: 'This is the step where we isolate x.', tool: 'annotate', args: { target_id: '#4', mode: 'circle', region: { x0: 0, x1: 0.3, y0: 0, y1: 1 }, note: 'x is alone' } },
  { say: 'We can also see it on a graph: the line y = 2x + 4 reaches 10 at x = 3.', tool: 'plot_function', args: { expression: '2x + 4', x_min: -1, x_max: 5, placement: 'right of #2' } },
  { say: 'And a quick diagram of the steps.', tool: 'draw_shape', args: { shape: 'rectangle', label: '2x + 4 = 10', width: 150, height: 56, placement: 'new section' } },
  { say: '', tool: 'draw_shape', args: { shape: 'rectangle', label: 'x = 3', width: 120, height: 56, placement: 'right of #7' } },
  { say: 'Subtract, then divide.', tool: 'draw_arrow', args: { from_id: '#7', to_id: '#8', label: '−4, ÷2' } },
  { say: 'Your turn: try 3x − 5 = 7 on the board, then press "Check my work".', tool: 'write_math', args: { latex: '3x - 5 = 7', placement: 'new section' } },
];
