// Loose LaTeX normalization so equivalent spellings compare equal.
export function normalizeLatex(s: string): string {
  return s
    .trim()
    .replace(/^\$+|\$+$/g, '') // strip $ delimiters
    .replace(/^```(?:latex)?|```$/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\[,;:! ]/g, '') // spacing commands
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\\dfrac|\\tfrac/g, '\\frac')
    .replace(/\{(\w)\}/g, '$1') // x^{2} -> x^2
    .replace(/\s+/g, '');
}
