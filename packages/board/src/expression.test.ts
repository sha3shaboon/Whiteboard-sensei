import { describe, expect, it } from 'vitest';
import { compileExpression } from './expression';

const at = (src: string, x: number) => compileExpression(src)(x);

describe('compileExpression', () => {
  it('handles precedence, powers and unary minus', () => {
    expect(at('1 + 2 * x ^ 2', 3)).toBe(19);
    expect(at('-x^2', 3)).toBe(-9);
    expect(at('2^3^2', 0)).toBe(512);
  });

  it('handles implicit multiplication, functions and constants', () => {
    expect(at('2x + 1', 4)).toBe(9);
    expect(at('(x+1)(x-1)', 3)).toBe(8);
    expect(at('3sin(x)', Math.PI / 2)).toBeCloseTo(3);
    expect(at('2pi', 0)).toBeCloseTo(2 * Math.PI);
    expect(at('sqrt(x) + abs(-2)', 9)).toBe(5);
  });

  it('strips y = / f(x) = prefixes', () => {
    expect(at('y = x^2', 2)).toBe(4);
    expect(at('f(x) = x + 1', 2)).toBe(3);
  });

  it('rejects anything that is not math', () => {
    expect(() => compileExpression('alert(1)')).toThrow();
    expect(() => compileExpression('x +')).toThrow();
    expect(() => compileExpression('(x')).toThrow();
  });
});
