import { describe, expect, it } from 'vitest';
import { DARK_SURFACE, themeColor, themeText } from './theme';

const lum = (hex: string) => {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return (n(1) + n(3) + n(5)) / 3;
};

describe('dark theme colors', () => {
  it('turns paper into the dark surface and ink into near-white', () => {
    expect(themeColor('#ffffff', 'dark')).toBe(DARK_SURFACE);
    expect(themeColor('#fff', 'dark')).toBe(DARK_SURFACE);
    expect(lum(themeColor('#1c1c1a', 'dark'))).toBeGreaterThan(0.8);
  });

  it('keeps hues: accents stay their color but brighter, pastels become dark tints', () => {
    const blue = themeColor('#2563eb', 'dark');
    expect(parseInt(blue.slice(5, 7), 16)).toBeGreaterThan(parseInt(blue.slice(1, 3), 16)); // still blue
    expect(lum(blue)).toBeGreaterThan(lum('#2563eb'));
    const pink = themeColor('#fecaca', 'dark');
    expect(lum(pink)).toBeLessThan(0.3);
    expect(parseInt(pink.slice(1, 3), 16)).toBeGreaterThan(parseInt(pink.slice(5, 7), 16)); // still reddish
  });

  it('keeps alpha, passes through gradients and the light theme', () => {
    expect(themeColor('rgba(250, 204, 21, 0.4)', 'dark')).toMatch(/^rgba\(.+, 0\.4\)$/);
    expect(themeColor('url(#g)', 'dark')).toBe('url(#g)');
    expect(themeColor('#2563eb', 'light')).toBe('#2563eb');
  });

  it('converts colors inside style strings', () => {
    expect(themeText('color:#1c1c1a;background:#fff;border:1px solid #d9dfee', 'dark')).not.toMatch(/#1c1c1a|#fff\b/);
  });
});
