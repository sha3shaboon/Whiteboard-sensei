import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { createMoleculeLoader, parseRecord } from './molecule.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const record = JSON.parse(readFileSync(path.join(here, '../test-fixtures/caffeine-2d.json'), 'utf8'));
const props = { Title: 'Caffeine', MolecularFormula: 'C8H10N4O2', IUPACName: '1,3,7-trimethylpurine-2,6-dione', MolecularWeight: '194.19' };

describe('PubChem molecules', () => {
  it('parses atoms, bonds and 2D coordinates', () => {
    const m = parseRecord(record.PC_Compounds[0], props);
    expect(m.cid).toBe(2519);
    expect(m.atoms.filter((a) => a.el === 'N')).toHaveLength(4);
    expect(m.atoms.filter((a) => a.el === 'O')).toHaveLength(2);
    expect(m.bonds.some((b) => b.order === 2)).toBe(true);
    expect(m.atoms.every((a) => Number.isFinite(a.x) && Number.isFinite(a.y))).toBe(true);
  });

  it('looks up by name, caches, and reports unknown names', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/name/caffeine/cids')) return Response.json({ IdentifierList: { CID: [2519] } });
      if (url.includes('/cid/2519/JSON')) return Response.json(record);
      if (url.includes('/cid/2519/property')) return Response.json({ PropertyTable: { Properties: [props] } });
      return new Response('not found', { status: 404 });
    });
    const app = createApp({ realtime: null, recognizer: null, molecules: createMoleculeLoader(fetchMock as unknown as typeof fetch) });
    const ok = (await (await app.request('/api/molecule?name=caffeine')).json()) as { molecule: { formula: string }; credit: string };
    expect(ok.molecule.formula).toBe('C8H10N4O2');
    expect(ok.credit).toMatch(/PubChem/);
    const calls = fetchMock.mock.calls.length;
    await app.request('/api/molecule?name=Caffeine');
    expect(fetchMock.mock.calls.length).toBe(calls); // cached (case-insensitive)
    expect((await app.request('/api/molecule?name=unobtainium')).status).toBe(404);
    expect((await app.request('/api/molecule')).status).toBe(400);
  });
});
