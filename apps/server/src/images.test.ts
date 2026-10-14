import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { createImageSearch, licenseName, parseCommons, parseOpenverse, stripHtml } from './images.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (f: string) => JSON.parse(readFileSync(path.join(here, '../test-fixtures', f), 'utf8'));
const commons = fixture('commons-volcano.json');
const openverse = fixture('openverse-volcano.json');

describe('image search', () => {
  it('reads Commons results in rank order with author, license and source; skips non-images, tiny and unlicensed files', () => {
    const r = parseCommons(commons);
    expect(r.map((x) => x.title)).toEqual(['Stromboli Eruption', 'Volcano diagram']);
    expect(r[0]).toMatchObject({ author: 'Wolfgang Beyer', license: 'CC BY-SA 3.0', source: 'https://commons.wikimedia.org/wiki/File:Stromboli_Eruption.jpg', provider: 'Wikimedia Commons' });
    expect(r[0]!.description).toContain('Eruption of Stromboli');
    expect(r[0]!.width).toBe(939);
  });

  it('reads Openverse results and never keeps non-commercial licenses', () => {
    const r = parseOpenverse(openverse);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.author && x.license.startsWith('C') && x.source.startsWith('http'))).toBe(true);
    const nc = parseOpenverse({ results: [{ id: '1', url: 'u', foreign_landing_url: 's', license: 'by-nc', creator: 'a' }] });
    expect(nc).toEqual([]);
    expect(licenseName('by-sa', '2.0')).toBe('CC BY-SA 2.0');
    expect(licenseName('cc0')).toBe('CC0');
    expect(stripHtml('<a href="x">Jane &amp; Joe</a>')).toBe('Jane & Joe');
  });

  it('falls back to Openverse when Commons fails, caches, and proxies only issued URLs', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('https://commons.wikimedia.org')) return new Response('too many requests', { status: 429 });
      if (url.startsWith('https://api.openverse.org')) return Response.json(openverse);
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
    });
    const images = createImageSearch(fetchMock as unknown as typeof fetch);
    const app = createApp({ realtime: null, recognizer: null, images, fetchImpl: fetchMock as unknown as typeof fetch });
    const body = (await (await app.request('/api/images?q=volcano')).json()) as { results: { url: string; provider: string }[] };
    expect(body.results[0]!.provider).toContain('Openverse');
    await app.request('/api/images?q=Volcano');
    expect(fetchMock).toHaveBeenCalledTimes(2); // second query served from cache
    const ok = await app.request(`/api/images/view?url=${encodeURIComponent(body.results[0]!.url)}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/jpeg');
    expect((await app.request('/api/images/view?url=http://169.254.169.254/latest')).status).toBe(404);
    expect((await app.request('/api/images')).status).toBe(400);
  });
});
