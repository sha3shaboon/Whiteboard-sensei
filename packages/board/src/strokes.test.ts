import { describe, expect, it } from 'vitest';
import { buildStrokeSvg, strokeTypeName, totalStrokes, type CharStrokes } from './index';

const ni: CharStrokes = {
  char: '二',
  strokes: [{ d: 'M28 30c3 0 6 0 9 0', type: '㇐' }, { d: 'M14 79c4 1 8 1 12 0', type: '㇐' }],
  numbers: [{ x: 22, y: 30 }, { x: 8, y: 79 }],
};

describe('buildStrokeSvg', () => {
  it('shows only the revealed strokes, newest in red, with numbers', () => {
    const { svg, vw } = buildStrokeSvg([ni], 1, 0);
    expect(vw).toBe(109);
    expect(svg).toContain('id="c0s1"');
    expect(svg).not.toContain('id="c0s2"');
    expect(svg).toMatch(/id="c0s1"[^>]*stroke="#dc2626"/);
    expect(svg).toMatch(/id="c0n1"[^>]*>1</);
  });

  it('counts strokes across characters and turns earlier strokes black', () => {
    const { svg, vw } = buildStrokeSvg([ni, ni], 3, 2);
    expect(vw).toBe(109 * 2 + 14);
    expect(svg).toMatch(/id="c0s2"[^>]*stroke="#1c1c1a"/);
    expect(svg).toMatch(/id="c1s1"[^>]*stroke="#dc2626"/);
    expect(svg).not.toContain('id="c1s2"');
    expect(totalStrokes([ni, ni])).toBe(4);
  });

  it('names stroke types for narration', () => {
    expect(strokeTypeName('㇐')).toBe('horizontal');
    expect(strokeTypeName('㇑a')).toBe('vertical');
    expect(strokeTypeName('')).toBe('stroke');
  });
});
