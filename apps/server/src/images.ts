// Pictures for things that can't be drawn (a real volcano, a painting, a cell under a microscope,
// a historical photo). Only openly licensed images are used: Wikimedia Commons first (free
// licenses only, rich educational coverage), then Openverse filtered to licenses that allow
// commercial use. Every result carries its author, license and source page for the credit line.

export interface ImageResult {
  id: string;
  title: string;
  description: string;
  /** Display URL (a thumbnail around 800px wide where available). */
  url: string;
  width: number;
  height: number;
  /** The page the image comes from, for the credit link. */
  source: string;
  author: string;
  license: string;
  licenseUrl?: string;
  provider: string;
  /** For a Wikipedia lead picture: the article it illustrates. */
  article?: string;
}

export type ImageSearch = (query: string) => Promise<ImageResult[]>;

const UA = 'WhiteboardSensei/1.0 (AI tutoring whiteboard; educational image lookup)';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const WIKIPEDIA = 'https://en.wikipedia.org/w/api.php';
const OPENVERSE = 'https://api.openverse.org/v1/images/';
const MIMES = new Set(['image/jpeg', 'image/png', 'image/svg+xml', 'image/gif', 'image/webp']);

/** Plain text from the small HTML snippets in Commons metadata. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

interface CommonsPage {
  title: string;
  imageinfo?: {
    thumburl?: string;
    thumbwidth?: number;
    thumbheight?: number;
    url: string;
    width: number;
    height: number;
    descriptionurl: string;
    mime: string;
    extmetadata?: Record<string, { value: string } | undefined>;
  }[];
}

export function parseCommons(body: { query?: { pages?: CommonsPage[] } }): ImageResult[] {
  const pages = [...(body.query?.pages ?? [])].sort((a, b) => ((a as { index?: number }).index ?? 0) - ((b as { index?: number }).index ?? 0));
  return pages.flatMap((p) => {
    const info = p.imageinfo?.[0];
    if (!info || !MIMES.has(info.mime) || Math.max(info.width, info.height) < 200) return [];
    const meta = info.extmetadata ?? {};
    const license = stripHtml(meta.LicenseShortName?.value ?? '');
    // Commons only hosts freely licensed files, but skip anything without a stated license.
    if (!license) return [];
    const name = p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '');
    return [
      {
        id: `commons:${p.title}`,
        title: stripHtml(meta.ObjectName?.value ?? '') || name,
        description: clip(stripHtml(meta.ImageDescription?.value ?? ''), 300),
        url: info.thumburl ?? info.url,
        width: info.thumbwidth ?? info.width,
        height: info.thumbheight ?? info.height,
        source: info.descriptionurl,
        author: clip(stripHtml(meta.Artist?.value ?? '') || 'Unknown author', 80),
        license,
        licenseUrl: meta.LicenseUrl?.value || undefined,
        provider: 'Wikimedia Commons',
      },
    ];
  });
}

interface OpenverseItem {
  id: string;
  title?: string;
  url: string;
  foreign_landing_url: string;
  creator?: string;
  license: string;
  license_version?: string;
  license_url?: string;
  provider?: string;
  source?: string;
  width?: number | null;
  height?: number | null;
  tags?: { name: string }[];
  mature?: boolean;
}

export function licenseName(code: string, version?: string): string {
  const c = code.toLowerCase();
  if (c === 'cc0') return 'CC0';
  if (c === 'pdm') return 'Public Domain Mark';
  return `CC ${c.toUpperCase()}${version ? ` ${version}` : ''}`;
}

export function parseOpenverse(body: { results?: OpenverseItem[] }): ImageResult[] {
  return (body.results ?? []).flatMap((r) => {
    // Belt and braces: never use non-commercial or unknown licenses, even if the filter changes.
    if (r.mature || /nc/i.test(r.license) || !/^(by|by-sa|by-nd|cc0|pdm)$/i.test(r.license)) return [];
    return [
      {
        id: `openverse:${r.id}`,
        title: r.title || 'Untitled',
        description: clip((r.tags ?? []).slice(0, 8).map((t) => t.name).join(', '), 200),
        url: r.url,
        width: r.width ?? 0,
        height: r.height ?? 0,
        source: r.foreign_landing_url,
        author: clip(r.creator || 'Unknown author', 80),
        license: licenseName(r.license, r.license_version),
        licenseUrl: r.license_url,
        provider: r.provider ? `${r.provider.charAt(0).toUpperCase()}${r.provider.slice(1)} via Openverse` : 'Openverse',
      },
    ];
  });
}

const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/**
 * Commons' own ranking often puts a loosely related file first ("Mount Fuji" -> planes flying
 * past it). Prefer titles that contain the query words, then descriptions, then shorter titles.
 */
export function rerank(results: ImageResult[], query: string): ImageResult[] {
  const q = [...new Set(words(query))];
  if (!q.length) return results;
  const score = (r: ImageResult) => {
    const t = new Set(words(r.title)), d = new Set(words(r.description));
    const inTitle = q.filter((w) => t.has(w)).length / q.length;
    const inDesc = q.filter((w) => d.has(w)).length / q.length;
    return inTitle * 2 + inDesc * 0.5 - Math.min(r.title.length, 150) / 150;
  };
  return results.map((r, i) => ({ r, i, s: score(r) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.r);
}

export function createImageSearch(fetchImpl: typeof fetch = fetch): ImageSearch & { issued: Set<string> } {
  const cache = new Map<string, { at: number; results: ImageResult[] }>();
  // URLs this server has handed out; the image proxy only fetches these (no open proxy).
  const issued = new Set<string>();

  const commonsInfo = async (extra: Record<string, string>) => {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|size|mime',
      iiurlwidth: '960',
      iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ImageDescription|ObjectName',
      ...extra,
    });
    const res = await fetchImpl(`${COMMONS}?${params}`, { headers: { 'user-agent': UA, 'api-user-agent': UA } });
    if (!res.ok) throw new Error(`Commons ${res.status}`);
    return parseCommons((await res.json()) as never);
  };

  // The lead picture of the best-matching Wikipedia article: usually the canonical photo of a
  // named thing. Looked up on Commons, so non-free files Wikipedia hosts locally are never used.
  const wikipediaLead = async (q: string): Promise<ImageResult[]> => {
    const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', generator: 'search', gsrsearch: q, gsrlimit: '1', prop: 'pageimages', piprop: 'name' });
    const res = await fetchImpl(`${WIKIPEDIA}?${params}`, { headers: { 'user-agent': UA, 'api-user-agent': UA } });
    if (!res.ok) return [];
    const body = (await res.json()) as { query?: { pages?: { title: string; pageimage?: string }[] } };
    const page = body.query?.pages?.[0];
    if (!page?.pageimage) return [];
    const found = await commonsInfo({ titles: `File:${page.pageimage}` });
    return found.map((r) => ({ ...r, description: r.description || page.title, article: page.title }));
  };

  const commons = async (q: string) => {
    const [lead, searched] = await Promise.all([
      wikipediaLead(q).catch(() => [] as ImageResult[]),
      commonsInfo({ generator: 'search', gsrsearch: `${q} filetype:bitmap|drawing`, gsrnamespace: '6', gsrlimit: '10' }),
    ]);
    // The article picture leads only when the article is exactly what was asked for ("Mount Fuji"),
    // not when the query asks for a particular aspect of it ("Coffea arabica fruits").
    const pick = lead[0];
    const qWords = words(q);
    const exact = !!pick && qWords.every((w) => words(pick.article ?? '').includes(w));
    if (exact) return [pick, ...rerank(searched.filter((r) => r.id !== pick.id), q)];
    return rerank([...searched, ...lead.filter((r) => !searched.some((s) => s.id === r.id))], q);
  };

  const openverse = async (q: string) => {
    const params = new URLSearchParams({ q, page_size: '8', license_type: 'commercial', mature: 'false' });
    const res = await fetchImpl(`${OPENVERSE}?${params}`, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`Openverse ${res.status}`);
    return parseOpenverse((await res.json()) as never);
  };

  const search = (async (query: string) => {
    const q = query.trim().replace(/\s+/g, ' ').slice(0, 120);
    const key = q.toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.results;
    let results: ImageResult[] = [];
    const errors: string[] = [];
    for (const source of [commons, openverse]) {
      try {
        results = await source(q);
      } catch (err) {
        errors.push((err as Error).message);
      }
      if (results.length) break;
    }
    if (!results.length && errors.length === 2) throw new Error(errors.join('; '));
    if (issued.size > 5000) issued.clear();
    for (const r of results) issued.add(r.url);
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), results });
    return results;
  }) as ImageSearch & { issued: Set<string> };
  search.issued = issued;
  return search;
}
