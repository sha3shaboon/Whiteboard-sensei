import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { createStrokeLoader, parseKanjiVG } from './strokes.js';

// Trimmed KanjiVG file for 二 (two strokes), with a malicious path that must be dropped.
const NI = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:kvg="http://kanjivg.tagaini.net">
<g id="kvg:StrokePaths_04e8c">
  <path id="kvg:04e8c-s2" kvg:type="㇐" d="M14.5,79.5c4,1,8.5,0.9,12.5,0.5"/>
  <path id="kvg:04e8c-s1" kvg:type="㇐" d="M28.5,30.5c3,0.6,6.6,0.6,9.5,0.4"/>
  <path id="kvg:04e8c-s3" d="javascript:alert(1)"/>
</g>
<g id="kvg:StrokeNumbers_04e8c">
  <text transform="matrix(1 0 0 1 22.25 30.50)">1</text>
  <text transform="matrix(1 0 0 1 8.50 79.50)">2</text>
</g></svg>`;

describe('KanjiVG strokes', () => {
  it('parses strokes in stroke order with types and number positions, dropping unsafe paths', () => {
    const d = parseKanjiVG('二', NI)!;
    expect(d.strokes.map((s) => s.d)).toEqual(['M28.5,30.5c3,0.6,6.6,0.6,9.5,0.4', 'M14.5,79.5c4,1,8.5,0.9,12.5,0.5']);
    expect(d.strokes[0]!.type).toBe('㇐');
    expect(d.numbers).toEqual([{ x: 22.25, y: 30.5 }, { x: 8.5, y: 79.5 }]);
  });

  it('fetches by code point, caches, and serves via /api/strokes', async () => {
    const fetchMock = vi.fn(async (url: string) => (url.includes('04e8c') ? new Response(NI) : new Response('nope', { status: 404 })));
    const loader = createStrokeLoader(fetchMock as unknown as typeof fetch);
    const app = createApp({ realtime: null, recognizer: null, strokes: loader });
    const res = await app.request(`/api/strokes/${encodeURIComponent('二')}`);
    const body = (await res.json()) as { chars: { strokes: unknown[] }[]; credit: string };
    expect(body.chars[0]!.strokes).toHaveLength(2);
    expect(body.credit).toMatch(/KanjiVG/);
    expect(fetchMock.mock.calls[0]![0]).toContain('/kanji/04e8c.svg');
    await app.request(`/api/strokes/${encodeURIComponent('二')}`);
    expect(fetchMock).toHaveBeenCalledTimes(1); // cached
    expect((await app.request(`/api/strokes/${encodeURIComponent('木')}`)).status).toBe(404);
    expect((await app.request('/api/strokes/abc')).status).toBe(400);
  });
});
