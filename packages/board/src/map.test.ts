import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildMap, findShape, normalizeName, type MapLoader } from './index';
import { feature } from 'topojson-client';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (f: string) => JSON.parse(readFileSync(path.join(here, '../test-fixtures', f), 'utf8'));
const world = fixture('countries-110m.json');
const usa = fixture('states-10m.json');
// The detailed 50m file isn't needed for these checks: serve the 110m data for any world URL.
const load: MapLoader = async (url) => (url.includes('us-atlas') ? usa : world);
const shapes = (feature(world, world.objects.countries) as unknown as { features: { properties: { name: string } }[] }).features as never[];

describe('country names', () => {
  it('matches common names, abbreviations and aliases', () => {
    const name = (n: string) => (findShape(shapes, n) as unknown as { properties: { name: string } } | undefined)?.properties.name;
    expect(name('USA')).toBe('United States of America');
    expect(name('United States')).toBe('United States of America');
    expect(name('DRC')).toBe('Dem. Rep. Congo');
    expect(name('Czech Republic')).toBe('Czechia');
    expect(name('Bosnia')).toBe('Bosnia and Herz.');
    expect(name('Egypt')).toBe('Egypt');
    expect(name('Atlantis')).toBeUndefined();
    expect(normalizeName('Central African Rep.')).toBe('central african republic');
  });
});

describe('buildMap', () => {
  it('highlights countries, zooms to them, and places markers and routes', async () => {
    const m = await buildMap(
      {
        highlight: [{ name: 'Egypt' }, { name: 'Sudan' }],
        markers: [{ label: 'Cairo', lat: 30.04, lon: 31.24 }],
        routes: [{ from: { lat: 30.04, lon: 31.24 }, to: { lat: 15.5, lon: 32.56 }, label: 'Nile' }],
      },
      load,
    );
    expect(m.unmatched).toEqual([]);
    expect(m.matched).toEqual(['Egypt', 'Sudan']);
    for (const id of ['area-egypt', 'area-sudan', 'label-egypt', 'marker-cairo', 'route-1']) expect(m.svg).toContain(`id="${id}"`);
    // Zoomed in: Cairo's marker sits well inside the frame rather than at world scale.
    const cx = Number(/id="marker-cairo" cx="([\d.]+)"/.exec(m.svg)![1]);
    expect(cx).toBeGreaterThan(100);
    expect(cx).toBeLessThan(540);
    expect(m.credit).toMatch(/Natural Earth/);
  });

  it('reports names it cannot find instead of guessing', async () => {
    const m = await buildMap({ highlight: [{ name: 'Atlantis' }, { name: 'France' }] }, load);
    expect(m.unmatched).toEqual(['Atlantis']);
    expect(m.matched).toEqual(['France']);
  });

  it('draws US states with the US projection', async () => {
    const m = await buildMap({ region: 'usa', highlight: [{ name: 'Texas' }, { name: 'California' }] }, load);
    expect(m.matched).toEqual(['Texas', 'California']);
    expect(m.vh).toBeGreaterThan(250);
  });

  it('zooms to the focus area', async () => {
    const m = await buildMap({ focus: ['Ethiopia', 'Yemen', 'Italy'], highlight: [{ name: 'Ethiopia' }] }, load);
    const d = /id="area-ethiopia"[^>]* d="([^"]+)"/.exec(m.svg)![1]!;
    const xs = [...d.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((p) => Number(p[1]));
    // At world scale Ethiopia is ~25px wide; zoomed to East Africa through Italy it's far bigger.
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(80);
    expect(m.vh).toBeLessThan(m.vw); // tall areas are widened to stay landscape
    expect(m.vh).toBeGreaterThan(300);
  });
});
