import { describe, expect, it } from 'vitest';
import { normalizeLatex } from './normalize';

describe('normalizeLatex', () => {
  it('treats equivalent spellings as equal', () => {
    expect(normalizeLatex('$x^{2} + 3$')).toBe(normalizeLatex('x^2+3'));
    expect(normalizeLatex('\\dfrac{a}{b}')).toBe(normalizeLatex('\\frac{a}{b}'));
    expect(normalizeLatex('\\left( x \\right)')).toBe(normalizeLatex('(x)'));
    expect(normalizeLatex('2 \\cdot 3')).toBe(normalizeLatex('2\\times3'));
  });

  it('keeps real differences', () => {
    expect(normalizeLatex('x^2')).not.toBe(normalizeLatex('x^3'));
    expect(normalizeLatex('\\frac{1}{2}')).not.toBe(normalizeLatex('\\frac{2}{1}'));
  });
});
