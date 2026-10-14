import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { createImageSearch, licenseName, parseCommons, parseOpenverse, rerank, stripHtml, type ImageResult } from './images.js';

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
    const calls = fetchMock.mock.calls.length;
    await app.request('/api/images?q=Volcano');
    expect(fetchMock.mock.calls.length).toBe(calls); // second query served from cache
    const ok = await app.request(`/api/images/view?url=${encodeURIComponent(body.results[0]!.url)}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/jpeg');
    expect((await app.request('/api/images/view?url=http://169.254.169.254/latest')).status).toBe(404);
    expect((await app.request('/api/images')).status).toBe(400);
  });

  it('ranks files whose titles match the query first', () => {
    const r = (title: string, description = '') => ({ id: title, title, description }) as ImageResult;
    const ranked = rerank([r('Grumman E-2C Hawkeyes of VAW-115 fly past Mount Fuji on 15 February 2007'), r('Japanese temple', 'Mount Fuji in the distance'), r('Mount Fuji from Lake Kawaguchi')], 'Mount Fuji');
    expect(ranked.map((x) => x.title)).toEqual(['Mount Fuji from Lake Kawaguchi', 'Grumman E-2C Hawkeyes of VAW-115 fly past Mount Fuji on 15 February 2007', 'Japanese temple']);
  });

  it("puts the Wikipedia article's lead picture first, only if it is a free file on Commons", async () => {
    const stromboli = commons.query.pages.find((p: { title: string }) => p.title === 'File:Stromboli Eruption.jpg');
    const run = async (onCommons: boolean, query = 'Stromboli') => {
      const fetchMock = vi.fn(async (url: string) => {
        if (url.startsWith('https://en.wikipedia.org')) return Response.json({ query: { pages: [{ title: 'Stromboli', pageimage: 'Stromboli_Eruption.jpg' }] } });
        if (url.includes('titles=File')) return Response.json({ query: { pages: onCommons ? [stromboli] : [{ title: 'File:Stromboli Eruption.jpg', missing: true }] } });
        if (url.startsWith('https://commons.wikimedia.org')) return Response.json({ query: { pages: commons.query.pages.filter((p: { title: string }) => p.title !== 'File:Stromboli Eruption.jpg') } });
        return new Response('no', { status: 500 });
      });
      return createImageSearch(fetchMock as unknown as typeof fetch)(query);
    };
    expect((await run(true)).map((r) => r.title)).toEqual(['Stromboli Eruption', 'Volcano diagram']);
    // A non-free file hosted only on Wikipedia (fair use) is not on Commons, so it's skipped.
    expect((await run(false)).map((r) => r.title)).toEqual(['Volcano diagram']);
    // A query about one aspect of the article ("... diagram") doesn't get the article picture first.
    expect((await run(true, 'Stromboli volcano diagram'))[0]!.title).toBe('Volcano diagram');
  });
});
