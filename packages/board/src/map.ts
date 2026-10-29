// Maps from real geographic data (Natural Earth via world-atlas / us-atlas): the AI names
// countries, cities (lat/lon) and routes; this module projects and draws them. Base shapes are
// static; highlights, markers and routes draw in so a map can be revealed step by step.

import { geoAlbersUsa, geoBounds, geoInterpolate, geoMercator, geoNaturalEarth1, geoPath, type GeoProjection, type GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';

export interface MapSpec {
  /** "world" (countries) or "usa" (states). */
  region?: 'world' | 'usa';
  /** Zoom to these countries/states (default: all highlighted ones; else the whole region). */
  focus?: string[];
  /** Give every country/state shape an id (c-<name>) so it can be clicked (map_click activities). */
  pickable?: boolean;
  /** Zoom to a box instead: degrees. */
  bounds?: { west: number; south: number; east: number; north: number };
  highlight?: { name: string; color?: string; label?: string }[];
  markers?: { label: string; lat: number; lon: number; color?: string }[];
  routes?: { from: { lat: number; lon: number }; to: { lat: number; lon: number }; label?: string; color?: string }[];
  /** Label highlighted areas with their names (default true). */
  labels?: boolean;
}

export interface BuiltMap {
  svg: string;
  vw: number;
  vh: number;
  matched: string[];
  unmatched: string[];
  credit: string;
}

type Shape = Feature<Geometry, { name: string }>;

export const MAP_SOURCES = {
  world110: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
  world50: 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json',
  usa: 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json',
};

export type MapLoader = (url: string) => Promise<Topology>;

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#ca8a04'];
const FILLS: Record<string, string> = { '#2563eb': '#bfdbfe', '#dc2626': '#fecaca', '#16a34a': '#bbf7d0', '#ea580c': '#fed7aa', '#9333ea': '#e9d5ff', '#0891b2': '#a5f3fc', '#ca8a04': '#fef08a' };

// ---------- names ----------

const ALIASES: Record<string, string> = {
  usa: 'united states of america', us: 'united states of america', 'united states': 'united states of america', america: 'united states of america',
  uk: 'united kingdom', britain: 'united kingdom', 'great britain': 'united kingdom', england: 'united kingdom', scotland: 'united kingdom', wales: 'united kingdom',
  'czech republic': 'czechia', swaziland: 'eswatini', 'north macedonia': 'macedonia', burma: 'myanmar', holland: 'netherlands',
  'ivory coast': "cote d'ivoire", 'east timor': 'timor-leste', drc: 'democratic republic congo', 'dr congo': 'democratic republic congo',
  'democratic republic of the congo': 'democratic republic congo', 'congo-kinshasa': 'democratic republic congo',
  'republic of the congo': 'congo', 'congo-brazzaville': 'congo', 'south korea': 'south korea', korea: 'south korea',
  'western sahara': 'western sahara', 'uae': 'united arab emirates', 'vatican': 'vatican', 'bosnia': 'bosnia and herzegovina',
};

const ABBREV: [RegExp, string][] = [
  [/\bdem\./g, 'democratic'], [/\brep\./g, 'republic'], [/\beq\./g, 'equatorial'], [/\bis\./g, 'islands'], [/\bi\./g, 'island'],
  [/\bs\./g, 'south'], [/\bn\./g, 'north'], [/\bw\./g, 'western'], [/\bfr\./g, 'french'], [/\bst\./g, 'saint'], [/\bbr\./g, 'british'],
  [/\bherz\./g, 'herzegovina'], [/\bbarb\./g, 'barbuda'], [/\bter\./g, 'territory'], [/\bgeo\./g, 'georgia'], [/\bvin\./g, 'vincent'], [/\bgren\./g, 'grenadines'],
];

export function normalizeName(s: string): string {
  let n = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [re, full] of ABBREV) n = n.replace(re, full);
  n = n.replace(/\bof the\b|\bthe\b/g, ' ').replace(/[^a-z' -]/g, ' ').replace(/\s+/g, ' ').trim();
  return ALIASES[n] ?? n;
}

/** Finds a shape by a human name: exact, alias, then a unique partial match. */
export function findShape(shapes: Shape[], name: string): Shape | undefined {
  const want = normalizeName(name);
  const norm = shapes.map((s) => [normalizeName(s.properties.name), s] as const);
  const exact = norm.find(([n]) => n === want);
  if (exact) return exact[1];
  const partial = norm.filter(([n]) => n.includes(want) || want.includes(n));
  return partial.length === 1 ? partial[0]![1] : undefined;
}

// ---------- building ----------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** Stable id fragment for a place name ("Côte d'Ivoire" -> "cote-d-ivoire"). */
export const mapSlug = (s: string) => normalizeName(s).replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') || 'x';
const fmt = (n: number) => Math.round(n * 10) / 10;

export async function buildMap(spec: MapSpec, load: MapLoader): Promise<BuiltMap> {
  const usa = spec.region === 'usa';
  const W = 640;
  const unmatched: string[] = [];
  const matched: string[] = [];

  // First pass with the light world file to find the zoom area; detailed data for close-ups.
  let topo = await load(usa ? MAP_SOURCES.usa : MAP_SOURCES.world110);
  let shapes = toShapes(topo, usa ? 'states' : 'countries');
  const focusNames = spec.focus?.length ? spec.focus : (spec.highlight ?? []).map((h) => h.name);
  const focusShapes = focusNames.map((n) => findShape(shapes, n)).filter(Boolean) as Shape[];

  let projection: GeoProjection;
  let bbox: [[number, number], [number, number]] | null = null;
  if (spec.bounds) bbox = [[spec.bounds.west, spec.bounds.south], [spec.bounds.east, spec.bounds.north]];
  else if (focusShapes.length && !usa) {
    const fc: FeatureCollection = { type: 'FeatureCollection', features: focusShapes };
    bbox = geoBounds(fc as GeoPermissibleObjects) as [[number, number], [number, number]];
  }
  const span = bbox ? Math.abs(bbox[1][0] - bbox[0][0]) + Math.abs(bbox[1][1] - bbox[0][1]) : 360;
  if (!usa && bbox && span < 60) {
    topo = await load(MAP_SOURCES.world50); // close-up: use the more detailed borders
    shapes = toShapes(topo, 'countries');
  }

  if (usa) {
    projection = geoAlbersUsa();
    projection.fitWidth(W, { type: 'FeatureCollection', features: shapes } as GeoPermissibleObjects);
  } else if (bbox) {
    projection = geoMercator();
    projection.fitWidth(W, paddedBox(bbox));
  } else {
    projection = geoNaturalEarth1();
    projection.fitWidth(W, { type: 'Sphere' } as GeoPermissibleObjects);
  }
  const path = geoPath(projection).digits(1);
  // Height: what the projection actually spans for the area shown.
  const area = usa
    ? path.bounds({ type: 'FeatureCollection', features: shapes } as GeoPermissibleObjects)
    : bbox
      ? path.bounds(paddedBox(bbox))
      : path.bounds({ type: 'Sphere' } as GeoPermissibleObjects);
  const vh = Math.max(160, Math.round(area[1][1] - area[0][1]));
  const vw = W;
  const oy = area[0][1];

  const parts: string[] = [];
  parts.push(`<defs><clipPath id="frame"><rect x="0" y="${fmt(oy)}" width="${vw}" height="${vh}"/></clipPath></defs>`);
  // Base map: drawn instantly.
  parts.push(
    `<g id="base" data-static="1" clip-path="url(#frame)">` +
      `<rect x="0" y="${fmt(oy)}" width="${vw}" height="${vh}" fill="#eef6fb" stroke="none"/>` +
      shapes.map((f) => `<path${spec.pickable ? ` id="c-${mapSlug(f.properties.name)}"` : ''} d="${path(f) ?? ''}" fill="#f7f7f5" stroke="#b9b9b2" stroke-width="0.6"/>`).join('') +
      `</g>`,
  );

  const labels: string[] = [];
  (spec.highlight ?? []).forEach((h, i) => {
    const f = findShape(shapes, h.name);
    if (!f) return unmatched.push(h.name);
    matched.push(f.properties.name);
    const color = h.color && /^#[0-9a-f]{6}$/i.test(h.color) ? h.color : COLORS[i % COLORS.length]!;
    const fill = FILLS[color] ?? color;
    parts.push(`<path id="area-${mapSlug(h.name)}" clip-path="url(#frame)" d="${path(f) ?? ''}" fill="${fill}" stroke="${color}" stroke-width="1.4"/>`);
    if (spec.labels !== false) {
      const [cx, cy] = path.centroid(f);
      if (Number.isFinite(cx)) labels.push(`<text id="label-${mapSlug(h.name)}" x="${fmt(cx)}" y="${fmt(cy)}" text-anchor="middle" font-size="13" font-weight="600" fill="${color}" stroke="#ffffff" stroke-width="3" paint-order="stroke">${esc(h.label ?? f.properties.name)}</text>`);
    }
  });
  for (const name of spec.focus ?? []) if (!findShape(shapes, name) && !unmatched.includes(name)) unmatched.push(name);

  (spec.routes ?? []).forEach((r, i) => {
    const interp = geoInterpolate([r.from.lon, r.from.lat], [r.to.lon, r.to.lat]);
    const pts = Array.from({ length: 33 }, (_, k) => projection(interp(k / 32))).filter(Boolean) as [number, number][];
    if (pts.length < 2) return;
    const color = r.color && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#dc2626';
    parts.push(`<path id="route-${i + 1}" d="M${pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}" stroke="${color}" stroke-width="2.2" marker-end="url(#${color === '#dc2626' ? 'arrow-red' : 'arrow'})"/>`);
    if (r.label) {
      const [mx, my] = pts[Math.floor(pts.length / 2)]!;
      labels.push(`<text id="route-label-${i + 1}" x="${fmt(mx)}" y="${fmt(my - 8)}" text-anchor="middle" font-size="12" fill="${color}" stroke="#ffffff" stroke-width="3" paint-order="stroke">${esc(r.label)}</text>`);
    }
  });

  for (const m of spec.markers ?? []) {
    const p = projection([m.lon, m.lat]);
    if (!p) continue;
    const color = m.color && /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#1c1c1a';
    parts.push(`<circle id="marker-${mapSlug(m.label)}" cx="${fmt(p[0])}" cy="${fmt(p[1])}" r="4" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>`);
    labels.push(`<text id="marker-label-${mapSlug(m.label)}" x="${fmt(p[0] + 7)}" y="${fmt(p[1] + 4)}" font-size="12" fill="#1c1c1a" stroke="#ffffff" stroke-width="3" paint-order="stroke">${esc(m.label)}</text>`);
  }

  return {
    svg: `<svg viewBox="0 ${fmt(oy)} ${vw} ${vh}">${parts.join('')}${labels.join('')}</svg>`,
    vw,
    vh,
    matched,
    unmatched,
    credit: 'Map data: Natural Earth',
  };
}

/** The area of interest plus a margin, so neighbors give context. */
function paddedBox([[w, s], [e, n]]: [[number, number], [number, number]]): GeoPermissibleObjects {
  const padY = Math.max(3, (n - s) * 0.25);
  // Keep close-ups roughly landscape: widen tall areas (Italy down to Ethiopia) on both sides.
  const padX = Math.max(3, (e - w) * 0.25, ((n - s + 2 * padY) * 1.25 - (e - w)) / 2);
  // Corner points rather than a polygon: a polygon's winding decides which side is "inside" on the
  // sphere, and the wrong one means the whole globe minus the box.
  const S = Math.max(-80, s - padY), N = Math.min(84, n + padY);
  return { type: 'MultiPoint', coordinates: [[w - padX, S], [e + padX, S], [e + padX, N], [w - padX, N]] } as GeoPermissibleObjects;
}

function toShapes(topo: Topology, object: string): Shape[] {
  const fc = feature(topo, topo.objects[object]!) as unknown as FeatureCollection<Geometry, { name: string }>;
  return fc.features as Shape[];
}

/** Browser loader with an in-memory cache. */
const cache = new Map<string, Promise<Topology>>();
export const fetchTopology: MapLoader = (url) => {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => (r.ok ? (r.json() as Promise<Topology>) : Promise.reject(new Error(`map data ${r.status}`)))));
  return cache.get(url)!;
};

/** Canonical names for places as they appear on the map ("USA" -> "United States of America"); null when unknown. */
export async function resolvePlaces(names: string[], region: 'world' | 'usa', load: MapLoader): Promise<(string | null)[]> {
  const topo = await load(region === 'usa' ? MAP_SOURCES.usa : MAP_SOURCES.world110);
  const shapes = toShapes(topo, region === 'usa' ? 'states' : 'countries');
  return names.map((n) => findShape(shapes, n)?.properties.name ?? null);
}
