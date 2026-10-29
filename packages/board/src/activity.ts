// Interactive activities: Synthesis-style questions the student answers by tapping, dragging,
// placing or typing. Every kind is checked here, deterministically, so feedback is instant and
// needs no AI call; the tutor is told the result afterwards.

import { checkBalance, balanceEquation } from './chemistry';
import { compileExpression } from './expression';

export type ActivitySpec =
  | { kind: 'choice'; options: string[]; answer: number[]; multiple?: boolean }
  | { kind: 'answer'; answers: string[]; numeric?: boolean; tolerance?: number; unit?: string; placeholder?: string }
  | { kind: 'order'; items: string[] }
  | { kind: 'sort'; categories: { name: string; items: string[] }[] }
  | { kind: 'match'; pairs: [string, string][] }
  | { kind: 'cloze'; text: string; bank?: string[]; typed?: boolean }
  | { kind: 'select'; text: string }
  | { kind: 'number_line'; min: number; max: number; step: number; answer: number; tolerance?: number; denominator?: number }
  | { kind: 'fraction_shade'; parts: number; shape: 'bar' | 'circle' | 'grid'; numerator: number; denominator: number }
  | { kind: 'plot_point'; xRange: [number, number]; yRange: [number, number]; points: { x: number; y: number }[]; tolerance?: number }
  | { kind: 'map_click'; svg: string; vw: number; vh: number; answers: string[]; names: Record<string, string> }
  | { kind: 'chem_balance'; reactants: string[]; products: string[] }
  | { kind: 'label'; svg: string; vw: number; vh: number; targets: { part: string; label: string }[]; extra?: string[] };

export type ActivityKind = ActivitySpec['kind'];
export type ActivityStatus = 'open' | 'wrong' | 'correct' | 'revealed';

export interface ActivityContent {
  prompt: string;
  spec: ActivitySpec;
  hints?: string[];
  /** Shown once it's solved or revealed: why the answer is right. */
  explanation?: string;
  /** "2/3" progress label for a set of questions. */
  step?: string;
  /** Dim the rest of the board while it's open (default true). */
  focus?: boolean;
  status: ActivityStatus;
  attempts: number;
  response?: unknown;
  /** Short result line for the student ("2 of 4 in the right place"). */
  feedback?: string;
}

export interface Grade {
  correct: boolean;
  /** For the student. */
  feedback: string;
  /** For the tutor: what the student did, plainly. */
  detail: string;
}

const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]$/, '');

/** Reads a number the way students write it: 0.75, 3/4, 1 1/2, 75%, -2, 2.5e3, sqrt(2), pi/2. */
export function parseNumber(input: string): number | null {
  const s = input.trim().replace(/,/g, '').replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/');
  if (!s) return null;
  const mixed = /^(-?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (mixed) return (mixed[1] ? -1 : 1) * (Number(mixed[2]) + Number(mixed[3]) / Number(mixed[4]));
  const pct = /^(-?[\d.]+)\s*%$/.exec(s);
  if (pct) return Number(pct[1]) / 100;
  if (/^-?[\d.]+(e[+-]?\d+)?$/i.test(s)) return Number.isFinite(Number(s)) ? Number(s) : null;
  // Arithmetic like "2/3 + 1/6", "sqrt(2)", "pi/2", using the board's safe expression parser (no eval).
  if (/x/i.test(s)) return null;
  try {
    const v = compileExpression(s)(0);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** The blanks of a cloze text: "The [[cat|kitty]] sat on the [[mat]]." -> [["cat","kitty"],["mat"]]. */
export function clozeBlanks(text: string): string[][] {
  return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]!.split('|').map((x) => x.trim()));
}

/** Tokens of a select text: words in [brackets] are the correct ones to tap. */
export function selectTokens(text: string): { text: string; correct: boolean }[] {
  const out: { text: string; correct: boolean }[] = [];
  for (const m of text.matchAll(/\[([^\]]+)\]|([^\s[\]]+)/g)) {
    if (m[1]) out.push(...m[1].split(/\s+/).map((w) => ({ text: w, correct: true })));
    else out.push({ text: m[2]!, correct: false });
  }
  return out;
}

/** Deterministic shuffle so the same activity shows the same order everywhere (and never the answer order). */
export function shuffled<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  if (out.length > 1 && out.every((x, i) => x === items[i])) out.push(out.shift()!);
  return out;
}

const fmt = (n: number) => String(+n.toFixed(4));
const list = (xs: string[]) => xs.map((x) => `"${x}"`).join(', ');

export function gradeActivity(spec: ActivitySpec, response: unknown): Grade {
  switch (spec.kind) {
    case 'choice': {
      const picked = (Array.isArray(response) ? response : []).map(Number).sort();
      const want = [...spec.answer].sort();
      const correct = picked.length === want.length && picked.every((v, i) => v === want[i]);
      const names = picked.map((i) => `${String.fromCharCode(65 + i)}) ${spec.options[i] ?? '?'}`);
      return { correct, feedback: correct ? 'Correct!' : spec.multiple && picked.some((p) => want.includes(p)) ? 'Some of those are right, but not all.' : 'Not quite.', detail: `picked ${names.join(', ') || 'nothing'}` };
    }
    case 'answer': {
      const raw = String(response ?? '');
      if (spec.numeric) {
        const v = parseNumber(raw.replace(new RegExp(`\\s*${(spec.unit ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), ''));
        const targets = spec.answers.map(parseNumber).filter((x): x is number => x !== null);
        const tol = spec.tolerance ?? 1e-6;
        const correct = v !== null && targets.some((t) => Math.abs(v - t) <= tol * Math.max(1, tol < 1e-3 ? Math.abs(t) : 1));
        return { correct, feedback: correct ? 'Correct!' : v === null ? "That doesn't look like a number." : 'Not quite.', detail: `typed "${raw}"${v !== null ? ` (= ${fmt(v)})` : ''}` };
      }
      const correct = spec.answers.some((a) => norm(a) === norm(raw));
      return { correct, feedback: correct ? 'Correct!' : 'Not quite.', detail: `typed "${raw}"` };
    }
    case 'order': {
      const got = Array.isArray(response) ? response.map(String) : [];
      const right = got.filter((x, i) => x === spec.items[i]).length;
      const correct = right === spec.items.length && got.length === spec.items.length;
      return { correct, feedback: correct ? 'Perfect order!' : `${right} of ${spec.items.length} in the right place.`, detail: `ordered: ${list(got)}` };
    }
    case 'sort': {
      const got = (response && typeof response === 'object' ? response : {}) as Record<string, string>;
      const all = spec.categories.flatMap((c) => c.items.map((item) => [item, c.name] as const));
      const right = all.filter(([item, cat]) => got[item] === cat).length;
      const wrong = all.filter(([item, cat]) => got[item] && got[item] !== cat).map(([item]) => `"${item}" in ${got[item]}`);
      return { correct: right === all.length, feedback: right === all.length ? 'All sorted!' : `${right} of ${all.length} sorted correctly.`, detail: wrong.length ? `misplaced ${wrong.join(', ')}` : `sorted ${right} of ${all.length}` };
    }
    case 'match': {
      const got = (response && typeof response === 'object' ? response : {}) as Record<string, string>;
      const right = spec.pairs.filter(([l, r]) => got[l] === r).length;
      const wrong = spec.pairs.filter(([l, r]) => got[l] && got[l] !== r).map(([l]) => `"${l}" → "${got[l]}"`);
      return { correct: right === spec.pairs.length, feedback: right === spec.pairs.length ? 'All matched!' : `${right} of ${spec.pairs.length} pairs right.`, detail: wrong.length ? `wrong pairs ${wrong.join(', ')}` : `matched ${right} of ${spec.pairs.length}` };
    }
    case 'cloze': {
      const blanks = clozeBlanks(spec.text);
      const got = Array.isArray(response) ? response.map(String) : [];
      const right = blanks.filter((alts, i) => alts.some((a) => norm(a) === norm(got[i] ?? ''))).length;
      return { correct: right === blanks.length, feedback: right === blanks.length ? 'All blanks right!' : `${right} of ${blanks.length} blanks right.`, detail: `filled ${list(got)}` };
    }
    case 'select': {
      const tokens = selectTokens(spec.text);
      const got = new Set((Array.isArray(response) ? response : []).map(Number));
      const missed = tokens.filter((t, i) => t.correct && !got.has(i)).map((t) => t.text);
      const extra = tokens.filter((t, i) => !t.correct && got.has(i)).map((t) => t.text);
      const correct = !missed.length && !extra.length;
      const parts = [missed.length ? `missed ${list(missed)}` : '', extra.length ? `also tapped ${list(extra)}` : ''].filter(Boolean);
      return { correct, feedback: correct ? 'You found them all!' : missed.length && !extra.length ? `Almost: ${missed.length} more to find.` : extra.length && !missed.length ? `${extra.length} of those shouldn't be selected.` : 'Not quite.', detail: parts.join('; ') || 'selected exactly the right ones' };
    }
    case 'number_line': {
      const v = Number(response);
      const tol = spec.tolerance ?? spec.step / 2;
      const correct = Number.isFinite(v) && Math.abs(v - spec.answer) <= tol + 1e-9;
      return { correct, feedback: correct ? 'Right on!' : Number.isFinite(v) ? (v < spec.answer ? 'A bit too far left.' : 'A bit too far right.') : 'Place the marker first.', detail: `placed the marker at ${Number.isFinite(v) ? fmt(v) : 'nothing'}` };
    }
    case 'fraction_shade': {
      const n = Array.isArray(response) ? new Set(response.map(Number)).size : 0;
      const correct = Math.abs(n / spec.parts - spec.numerator / spec.denominator) < 1e-9;
      return { correct, feedback: correct ? 'Exactly right!' : n / spec.parts < spec.numerator / spec.denominator ? 'Shade a little more.' : 'Too much shaded.', detail: `shaded ${n} of ${spec.parts} parts (${fmt(n / spec.parts)}; wanted ${spec.numerator}/${spec.denominator})` };
    }
    case 'plot_point': {
      const got = (Array.isArray(response) ? response : []) as { x: number; y: number }[];
      const tol = spec.tolerance ?? 0.25;
      const hit = spec.points.filter((p) => got.some((g) => Math.abs(g.x - p.x) <= tol && Math.abs(g.y - p.y) <= tol)).length;
      const correct = hit === spec.points.length && got.length === spec.points.length;
      return { correct, feedback: correct ? 'Plotted perfectly!' : `${hit} of ${spec.points.length} points right.`, detail: `plotted ${got.map((g) => `(${fmt(g.x)}, ${fmt(g.y)})`).join(', ') || 'nothing'}` };
    }
    case 'map_click': {
      const got = new Set(Array.isArray(response) ? response.map(String) : []);
      const want = new Set(spec.answers);
      const missed = [...want].filter((a) => !got.has(a)).map((a) => spec.names[a] ?? a);
      const extra = [...got].filter((a) => !want.has(a)).map((a) => spec.names[a] ?? a);
      const correct = !missed.length && !extra.length;
      return { correct, feedback: correct ? 'Spot on!' : extra.length ? `Not ${extra.join(', ')}.` : `${missed.length} more to find.`, detail: `clicked ${[...got].map((a) => spec.names[a] ?? a).join(', ') || 'nothing'}` };
    }
    case 'chem_balance': {
      const k = (Array.isArray(response) ? response : []).map(Number);
      const { balanced, left, right } = checkBalance(spec.reactants, spec.products, k);
      const best = balanceEquation(spec.reactants, spec.products);
      const simplest = balanced && !!best && k.every((v, i) => v === best[i]);
      const off = Object.keys({ ...left, ...right }).filter((el) => left[el] !== right[el]).map((el) => `${el} ${left[el] ?? 0} vs ${right[el] ?? 0}`);
      return {
        correct: simplest,
        feedback: simplest ? 'Balanced!' : balanced ? 'Balanced, but use the smallest whole numbers.' : `Not balanced yet: ${off.join(', ')}.`,
        detail: `coefficients ${k.join(', ')}${balanced ? ' (balanced' + (simplest ? ')' : ', not lowest terms)') : `; unbalanced ${off.join(', ')}`}`,
      };
    }
    case 'label': {
      const got = (response && typeof response === 'object' ? response : {}) as Record<string, string>;
      const right = spec.targets.filter((t) => got[t.part] === t.label).length;
      const wrong = spec.targets.filter((t) => got[t.part] && got[t.part] !== t.label).map((t) => `"${got[t.part]}" on ${t.part}`);
      return { correct: right === spec.targets.length, feedback: right === spec.targets.length ? 'All labeled!' : `${right} of ${spec.targets.length} labels right.`, detail: wrong.length ? `wrong labels ${wrong.join(', ')}` : `placed ${right} labels` };
    }
  }
}

/** A correct response, used by "Show me". */
export function solutionFor(spec: ActivitySpec): unknown {
  switch (spec.kind) {
    case 'choice': return spec.answer;
    case 'answer': return spec.answers[0] ?? '';
    case 'order': return spec.items;
    case 'sort': return Object.fromEntries(spec.categories.flatMap((c) => c.items.map((i) => [i, c.name])));
    case 'match': return Object.fromEntries(spec.pairs);
    case 'cloze': return clozeBlanks(spec.text).map((a) => a[0]);
    case 'select': return selectTokens(spec.text).flatMap((t, i) => (t.correct ? [i] : []));
    case 'number_line': return spec.answer;
    case 'fraction_shade': return Array.from({ length: Math.round((spec.numerator / spec.denominator) * spec.parts) }, (_, i) => i);
    case 'plot_point': return spec.points;
    case 'map_click': return spec.answers;
    case 'chem_balance': return balanceEquation(spec.reactants, spec.products) ?? [];
    case 'label': return Object.fromEntries(spec.targets.map((t) => [t.part, t.label]));
  }
}

/** Checks an activity spec the AI wrote; returns problems to report back (empty when fine). */
export function validateActivity(spec: ActivitySpec): string[] {
  const p: string[] = [];
  switch (spec.kind) {
    case 'choice':
      if (spec.options.length < 2) p.push('choice needs at least 2 options');
      if (!spec.answer.length || spec.answer.some((i) => i < 0 || i >= spec.options.length)) p.push('answer must list the index (0-based) of each correct option');
      break;
    case 'answer':
      if (!spec.answers.length) p.push('answer needs at least one accepted answer');
      if (spec.numeric && spec.answers.some((a) => parseNumber(a) === null)) p.push('numeric answers must be numbers like 0.75, 3/4 or 1 1/2');
      break;
    case 'order': if (spec.items.length < 2) p.push('order needs at least 2 items'); break;
    case 'sort': if (spec.categories.length < 2) p.push('sort needs at least 2 categories'); break;
    case 'match': if (spec.pairs.length < 2) p.push('match needs at least 2 pairs'); break;
    case 'cloze': if (!clozeBlanks(spec.text).length) p.push('cloze text needs blanks written as [[answer]] or [[answer|alternative]]'); break;
    case 'select': if (!selectTokens(spec.text).some((t) => t.correct)) p.push('select text needs the correct words in [brackets]'); break;
    case 'number_line':
      if (!(spec.max > spec.min) || !(spec.step > 0)) p.push('number_line needs min < max and step > 0');
      else if (spec.answer < spec.min || spec.answer > spec.max) p.push('number_line answer must be between min and max');
      break;
    case 'fraction_shade':
      if (spec.parts < 1 || spec.parts > 48) p.push('fraction_shade parts must be 1-48');
      if (Math.abs(((spec.numerator / spec.denominator) * spec.parts) % 1) > 1e-9) p.push(`${spec.numerator}/${spec.denominator} of ${spec.parts} parts isn't a whole number of parts`);
      break;
    case 'plot_point': if (!spec.points.length) p.push('plot_point needs the points to plot'); break;
    case 'map_click': if (!spec.answers.length) p.push('map_click needs at least one country that exists on the map'); break;
    case 'chem_balance':
      try {
        if (!balanceEquation(spec.reactants, spec.products)) p.push("that equation can't be balanced; check the formulas");
      } catch (e) {
        p.push((e as Error).message);
      }
      break;
    case 'label': if (!spec.targets.length) p.push('label needs targets (sketch part ids with labels)'); break;
  }
  return p;
}

/** For the tutor's board summary. */
export function describeActivity(c: ActivityContent): string {
  const state = c.status === 'open' ? (c.attempts ? `not right yet after ${c.attempts} tries` : 'waiting for the student') : c.status === 'correct' ? `solved${c.attempts > 1 ? ` on try ${c.attempts}` : ''}` : c.status === 'revealed' ? 'answer shown' : `wrong (${c.attempts} tries)`;
  return `${c.spec.kind.replace('_', ' ')} activity "${c.prompt.slice(0, 70)}" (${state})`;
}
