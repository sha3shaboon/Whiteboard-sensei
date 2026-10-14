// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeSvg, type SanitizedSketch } from './sketch';

const ok = (r: ReturnType<typeof sanitizeSvg>): SanitizedSketch => {
  if ('error' in r) throw new Error(r.error);
  return r;
};

describe('sanitizeSvg', () => {
  it('keeps drawing elements and namespaces ids, rewriting references', () => {
    const r = ok(sanitizeSvg('<svg viewBox="0 0 400 200"><path id="wire" d="M10 10 L100 10" marker-end="url(#arrow)"/><circle id="loop" cx="50" cy="50" r="20"/></svg>', 's1-'));
    expect(r.vw).toBe(400);
    expect(r.vh).toBe(200);
    expect(r.parts).toEqual(['wire', 'loop']);
    expect(r.svg).toContain('id="s1-wire"');
    expect(r.svg).toContain('marker-end="url(#s1-arrow)"');
    expect(r.svg).toContain('id="s1-arrow"'); // built-in marker injected
  });

  it('strips scripts, event handlers, links and external urls', () => {
    const r = ok(
      sanitizeSvg(
        '<svg viewBox="0 0 10 10"><script>alert(1)</script><a href="https://x"><rect width="5" height="5"/></a><rect onclick="alert(1)" fill="url(https://evil/x.svg)" width="5" height="5"/><foreignObject><div>hi</div></foreignObject><image href="https://x/y.png"/></svg>',
        'p-',
      ),
    );
    expect(r.svg).not.toMatch(/script|onclick|https:|foreignObject|<image|<a /i);
    expect(r.svg).toContain('<rect');
  });

  it('rejects markup that is not an svg', () => {
    expect(sanitizeSvg('<div>no</div>', 'p-')).toHaveProperty('error');
    expect(sanitizeSvg('<svg><path d="M0 0"', 'p-')).toHaveProperty('error');
  });

  it('defaults text to filled', () => {
    const r = ok(sanitizeSvg('<svg viewBox="0 0 100 50"><text x="5" y="20">N</text></svg>', 'p-'));
    expect(r.svg).toMatch(/<text[^>]*fill="#1c1c1a"/);
  });
});
