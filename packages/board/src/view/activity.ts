// Activity cards: Synthesis-style questions the student answers by tapping, dragging, placing or
// typing. One focused card per question with big touch targets; the app checks the answer itself
// (activity.ts), so feedback is instant: a chime and confetti when right, a gentle shake and a hint
// when not, and "Show me" after two tries. The tutor hears the result through the event bridge.
// The same card doubles as a worked example: the tutor reveals the solution one step at a time while
// explaining, and things glide into place (FLIP) whenever they move, for the tutor or the student.

import { checkBalance, clozeBlanks, describeStep, fractionLabel, gradeActivity, parseFormula, partialSolution, prettyFormula, selectTokens, shuffled, solutionFor, solutionSteps, type ActivityContent, type ActivitySpec } from '../index';
import type { ActivityElement } from '../elements';
import { celebrate, playCorrect, playTap, playWrong, shake } from './feedback';
import { escapeHtml, richText } from './overlay';

export interface ActivityHost {
  /** Save the new state (as a student change, so the tutor hears about it). */
  commit(content: ActivityContent): void;
  /** Re-apply theme colors after a local re-render. */
  paint(node: HTMLElement): void;
}

/** In-progress answers, kept across re-renders until checked. */
const drafts = new Map<string, unknown>();
/** The chip/item the student tapped and is about to place. */
const picked = new Map<string, string | number | null>();

const KIND_LABEL: Record<ActivitySpec['kind'], string> = {
  choice: 'Choose', answer: 'Your answer', order: 'Put in order', sort: 'Sort', match: 'Match', cloze: 'Fill in the blanks', select: 'Tap the right ones',
  number_line: 'Place it on the line', fraction_shade: 'Shade the fraction', plot_point: 'Plot the point', map_click: 'Find it on the map', chem_balance: 'Balance the equation', label: 'Label the diagram',
};
const PAIR_COLORS = ['#7c3aed', '#2563eb', '#0d9488', '#d97706', '#db2777', '#16a34a', '#dc2626', '#0891b2'];

function initial(spec: ActivitySpec): unknown {
  switch (spec.kind) {
    case 'choice': case 'select': case 'fraction_shade': case 'plot_point': case 'map_click': return [];
    case 'answer': return '';
    case 'order': return [];
    case 'sort': case 'match': case 'label': return {};
    case 'cloze': return clozeBlanks(spec.text).map(() => '');
    case 'number_line': return null;
    case 'chem_balance': return [...spec.reactants, ...spec.products].map(() => 1);
  }
}

/** Whether the draft is complete enough to check. */
function ready(spec: ActivitySpec, d: unknown): boolean {
  switch (spec.kind) {
    case 'choice': return (d as number[]).length > 0;
    case 'answer': return String(d).trim().length > 0;
    case 'order': return true;
    case 'sort': return Object.keys(d as object).length === spec.categories.reduce((n, c) => n + c.items.length, 0);
    case 'match': return Object.keys(d as object).length === spec.pairs.length;
    case 'cloze': return (d as string[]).every((x) => x.trim());
    case 'select': case 'fraction_shade': case 'map_click': return (d as unknown[]).length > 0;
    case 'number_line': return d !== null && d !== undefined;
    case 'plot_point': return (d as unknown[]).length === spec.points.length;
    case 'chem_balance': return true;
    case 'label': return Object.keys(d as object).length === spec.targets.length;
  }
}

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const css = `
.act { --c-bg:#ffffff; --c-line:#e7e5e4; --c-text:#1c1c1a; --c-muted:#78716c; --c-chip:#f5f3ff; --c-chip-line:#c4b5fd; --c-acc:#6d28d9; --c-ok:#15803d; --c-ok-bg:#dcfce7; --c-bad:#be123c; --c-bad-bg:#ffe4e6; --c-soft:#fafaf9;
  font-family:'Inter',system-ui,-apple-system,sans-serif; color:var(--c-text); background:var(--c-bg); border:1.5px solid var(--c-line); border-radius:22px; padding:20px 22px 18px; box-shadow:0 10px 30px rgba(30,27,75,.10); position:relative; user-select:none; -webkit-user-select:none; }
.board-root[data-theme="dark"] .act, .act-ghost.dark { --c-bg:#14162a; --c-line:rgba(255,255,255,.11); --c-text:#eef0f8; --c-muted:#8b90a7; --c-chip:rgba(139,92,246,.16); --c-chip-line:rgba(167,139,250,.45); --c-acc:#a78bfa; --c-ok:#4ade80; --c-ok-bg:rgba(34,197,94,.15); --c-bad:#fb7185; --c-bad-bg:rgba(244,63,94,.15); --c-soft:rgba(255,255,255,.04); box-shadow:0 18px 50px rgba(0,0,0,.5); }
.act.act-live { box-shadow:0 0 0 3px color-mix(in srgb, var(--c-acc) 30%, transparent), 0 16px 44px rgba(76,29,149,.22); }
.act.act-s-correct { border-color:var(--c-ok); }
.act-head { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; letter-spacing:.09em; text-transform:uppercase; color:var(--c-acc); margin-bottom:8px; }
.act-step { padding:2px 8px; border-radius:999px; background:var(--c-chip); color:var(--c-acc); letter-spacing:.02em; }
.act-prompt { font-size:20px; font-weight:650; line-height:1.35; margin-bottom:16px; letter-spacing:-.01em; }
.act-prompt .katex { font-size:1.05em; }
.act button { font:inherit; color:inherit; cursor:pointer; }
.act-options { display:grid; gap:10px; }
.act-opt { display:flex; align-items:center; gap:12px; width:100%; text-align:left; padding:12px 14px; border-radius:14px; border:1.5px solid var(--c-line); background:var(--c-soft); font-size:17px; transition:transform .12s, border-color .12s, background .12s; }
.act-opt:hover:not(:disabled) { border-color:var(--c-chip-line); transform:translateY(-1px); }
.act-opt .katex { font-size:1.3em; }
.act-opt b { display:grid; place-items:center; width:30px; height:30px; flex:none; border-radius:10px; background:var(--c-chip); color:var(--c-acc); font-size:14px; }
.act-opt.sel { border-color:var(--c-acc); background:var(--c-chip); }
.act-opt.ok { border-color:var(--c-ok); background:var(--c-ok-bg); } .act-opt.ok b { background:var(--c-ok); color:#fff; }
.act-opt.bad { border-color:var(--c-bad); background:var(--c-bad-bg); opacity:.75; } .act-opt.bad b { background:var(--c-bad); color:#fff; }
.act-chip { display:inline-flex; align-items:center; gap:8px; padding:9px 14px; border-radius:12px; border:1.5px solid var(--c-chip-line); background:var(--c-chip); font-size:16px; font-weight:550; cursor:grab; touch-action:none; transition:transform .12s, box-shadow .12s; }
.act-chip:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(76,29,149,.15); }
.act-chip.picked { outline:3px solid var(--c-acc); outline-offset:2px; }
.act-chip.act-dragging { opacity:.3; }
.act-chip.ok { border-color:var(--c-ok); background:var(--c-ok-bg); } .act-chip.bad { border-color:var(--c-bad); background:var(--c-bad-bg); }
.act-ghost { position:fixed; z-index:9999; pointer-events:none; transform-origin:0 0; box-shadow:0 12px 28px rgba(0,0,0,.25); }
.act-bank { display:flex; flex-wrap:wrap; gap:8px; min-height:48px; padding:10px; border-radius:14px; border:1.5px dashed var(--c-line); background:var(--c-soft); }
.act-bank:empty::after { content:'All placed'; color:var(--c-muted); font-size:14px; align-self:center; }
.act-over { outline:3px solid var(--c-acc) !important; outline-offset:2px; }
.act-order { display:grid; gap:8px; }
.act-order .act-chip { display:flex; justify-content:space-between; width:100%; cursor:grab; }
.act-num { display:grid; place-items:center; width:26px; height:26px; border-radius:8px; background:var(--c-bg); color:var(--c-muted); font-size:13px; font-weight:700; flex:none; }
.act-chip.ok .act-num { background:var(--c-ok); color:#fff; }
.act-move button { border:0; background:none; padding:2px 6px; color:var(--c-muted); font-size:16px; }
.act-cats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-top:12px; }
.act-cat { min-height:96px; border-radius:14px; border:1.5px solid var(--c-line); padding:10px; background:var(--c-soft); display:flex; flex-direction:column; gap:8px; }
.act-cat-title { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--c-muted); }
.act-cat .act-chip { width:fit-content; }
.act-match { display:grid; grid-template-columns:1fr 1fr; gap:10px 28px; }
.act-match .act-chip { width:100%; justify-content:space-between; cursor:pointer; }
.act-pair { display:inline-grid; place-items:center; width:22px; height:22px; border-radius:50%; color:#fff; font-size:12px; font-weight:700; }
.act-cloze { font-size:19px; line-height:2.3; }
.act-blank { display:inline-flex; align-items:center; justify-content:center; min-width:84px; padding:0 10px; margin:0 3px; border-radius:10px; border:2px dashed var(--c-chip-line); background:var(--c-soft); line-height:1.7; vertical-align:middle; cursor:pointer; font-weight:600; }
.act-blank.filled { border-style:solid; background:var(--c-chip); }
.act-blank.ok { border-color:var(--c-ok); background:var(--c-ok-bg); } .act-blank.bad { border-color:var(--c-bad); background:var(--c-bad-bg); }
.act-blank input { width:110px; border:0; background:transparent; font:inherit; color:inherit; text-align:center; outline:none; }
.act-passage { font-size:19px; line-height:2.1; }
.act-token { padding:3px 5px; border-radius:8px; cursor:pointer; transition:background .12s; }
.act-token:hover { background:var(--c-chip); }
.act-token.sel { background:var(--c-chip); box-shadow:inset 0 -3px 0 var(--c-acc); }
.act-token.ok { background:var(--c-ok-bg); box-shadow:inset 0 -3px 0 var(--c-ok); } .act-token.bad { background:var(--c-bad-bg); box-shadow:inset 0 -3px 0 var(--c-bad); } .act-token.missed { box-shadow:inset 0 -3px 0 var(--c-ok); }
.act-stage { position:relative; border-radius:14px; overflow:hidden; background:var(--c-soft); border:1.5px solid var(--c-line); touch-action:none; }
.act-stage svg { display:block; width:100%; height:auto; }
.act-caption { margin-top:8px; font-size:14px; color:var(--c-muted); }
.act-input-row { display:flex; align-items:center; gap:10px; }
.act-input { flex:1; font:inherit; font-size:20px; padding:12px 14px; border-radius:14px; border:1.5px solid var(--c-line); background:var(--c-soft); color:var(--c-text); outline:none; user-select:text; -webkit-user-select:text; }
.act-input:focus { border-color:var(--c-acc); }
.act-eq { display:flex; flex-wrap:wrap; align-items:center; gap:8px; font-size:22px; font-weight:600; }
.act-coef { width:56px; font:inherit; font-size:20px; text-align:center; padding:6px 4px; border-radius:10px; border:1.5px solid var(--c-chip-line); background:var(--c-chip); color:var(--c-text); user-select:text; }
.act-atoms { margin-top:14px; display:flex; flex-wrap:wrap; gap:8px; }
.act-atom { font-size:14px; padding:5px 10px; border-radius:10px; background:var(--c-soft); border:1.5px solid var(--c-line); }
.act-atom.act-eqok { border-color:var(--c-ok); color:var(--c-ok); }
.act-zone { position:absolute; transform:translate(-50%,-50%); min-width:30px; min-height:30px; display:grid; place-items:center; }
.act-zone .act-dot { width:30px; height:30px; border-radius:50%; border:2.5px dashed var(--c-acc); background:color-mix(in srgb, var(--c-bg) 70%, transparent); display:grid; place-items:center; font-size:13px; font-weight:800; color:var(--c-acc); }
.act-zone .act-chip { white-space:nowrap; font-size:14px; padding:5px 10px; }
.act-foot { margin-top:16px; display:flex; flex-direction:column; gap:10px; }
.act-fb { display:flex; align-items:flex-start; gap:10px; padding:11px 14px; border-radius:14px; font-size:16px; font-weight:600; line-height:1.4; }
.act-fb.good { background:var(--c-ok-bg); color:var(--c-ok); } .act-fb.bad { background:var(--c-bad-bg); color:var(--c-bad); } .act-fb.info { background:var(--c-chip); color:var(--c-acc); }
.act-fb small { display:block; font-weight:500; color:var(--c-text); opacity:.85; margin-top:3px; }
.act-actions { display:flex; justify-content:flex-end; gap:10px; }
.act-btn { padding:11px 22px; border-radius:14px; border:1.5px solid var(--c-line); background:var(--c-soft); font-weight:650; font-size:15px; }
.act-btn.act-primary { border:0; color:#fff !important; background:linear-gradient(135deg,#8b5cf6,#3b82f6); box-shadow:0 8px 20px rgba(99,102,241,.35); }
.act-btn:disabled { opacity:.4; cursor:default; box-shadow:none; }
.act.act-example { border-style:dashed; border-color:var(--c-chip-line); }
.act-example .act-head { color:#0891b2; }
.board-root[data-theme="dark"] .act-example .act-head { color:#22d3ee; }
.act-example .act-step { background:rgba(8,145,178,.12); color:inherit; }
.act-example .act-chip, .act-example .act-blank, .act-example .act-opt { cursor:default; }
.act-fb.ex { background:var(--c-soft); color:var(--c-text); border:1.5px solid var(--c-line); font-weight:600; }
.act-fb.ex b { color:#0891b2; }
.board-root[data-theme="dark"] .act-fb.ex b { color:#22d3ee; }
`;
  const style = document.createElement('style');
  style.id = 'act-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

/** Drag a chip (mouse, touch or pen) onto any [data-drop] target; a plain tap calls onTap. */
function draggable(chip: HTMLElement, onDrop: (target: HTMLElement) => void, onTap: () => void): void {
  chip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const rect = chip.getBoundingClientRect();
    const zoom = rect.width / (chip.offsetWidth || rect.width || 1);
    const offX = sx - rect.left, offY = sy - rect.top;
    let ghost: HTMLElement | null = null, over: HTMLElement | null = null;
    chip.setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        ghost = chip.cloneNode(true) as HTMLElement;
        ghost.classList.add('act-ghost');
        if (chip.closest('.board-root')?.getAttribute('data-theme') === 'dark') ghost.classList.add('dark');
        Object.assign(ghost.style, { width: `${chip.offsetWidth}px`, transform: `scale(${zoom * 1.04})`, fontFamily: "'Inter',system-ui,sans-serif" });
        (chip.closest('.board-root') ?? document.body).appendChild(ghost);
        chip.classList.add('act-dragging');
      }
      ghost.style.left = `${ev.clientX - offX}px`;
      ghost.style.top = `${ev.clientY - offY}px`;
      const t = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-drop]') ?? null;
      if (t !== over) {
        over?.classList.remove('act-over');
        t?.classList.add('act-over');
        over = t;
      }
    };
    const end = () => {
      chip.removeEventListener('pointermove', move);
      chip.removeEventListener('pointerup', end);
      chip.removeEventListener('pointercancel', end);
      if (ghost) {
        ghost.remove();
        chip.classList.remove('act-dragging');
        over?.classList.remove('act-over');
        if (over) onDrop(over);
        else onTap(); // dropped nowhere: treat as a pick-up so a tap on a target can place it
      } else onTap();
    };
    chip.addEventListener('pointermove', move);
    chip.addEventListener('pointerup', end);
    chip.addEventListener('pointercancel', end);
  });
}

/** Pointer position in an SVG's user coordinates. */
function svgPoint(svg: SVGSVGElement, e: PointerEvent | MouseEvent): { x: number; y: number } {
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

const chipHtml = (v: string, attrs = '', cls = '') => `<span class="act-chip ${cls}" data-v="${escapeHtml(v)}" data-flip="c:${escapeHtml(v)}" ${attrs}>${richText(v)}</span>`;
const prettyPlace = (slug: string) => slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export function renderActivity(node: HTMLElement, el: ActivityElement, host?: ActivityHost): void {
  injectStyles();
  const c = el.content, spec = c.spec, id = el.id;
  const example = c.mode === 'example';
  const total = solutionSteps(spec), shown = Math.max(0, Math.min(total, c.shown ?? 0));
  const solved = c.status === 'correct' || c.status === 'revealed';
  const locked = solved || example;
  const draft: unknown = example ? partialSolution(spec, shown, id) : solved ? c.response ?? solutionFor(spec) : drafts.get(id) ?? c.response ?? (c.given ? givenStart(spec, c.given, id) : initial(spec));
  const before = node.childElementCount ? snapshot(node) : null;
  const setDraft = (v: unknown, rerender = true) => {
    drafts.set(id, v);
    if (rerender) renderActivity(node, el, host);
    else updateCheck();
  };
  const showMarks = c.status !== 'open' && JSON.stringify(drafts.get(id) ?? c.response) === JSON.stringify(c.response);
  const marks = locked || (c.status === 'wrong' && showMarks);
  const exampleDone = example && shown >= total;
  const autoSubmit = spec.kind === 'choice' && !spec.multiple;
  node.className = `act act-k-${spec.kind} act-s-${c.status}${!locked && c.focus !== false ? ' act-live' : ''}${example ? ' act-example' : ''}`;
  node.style.position = 'absolute';
  node.style.boxSizing = 'border-box';

  let body = '';
  switch (spec.kind) {
    case 'choice': {
      const sel = draft as number[];
      body = `<div class="act-options">${spec.options.map((o, i) => {
        const cls = [sel.includes(i) ? 'sel' : '', marks && spec.answer.includes(i) && (solved || sel.includes(i)) ? 'ok' : '', marks && !spec.answer.includes(i) && sel.includes(i) ? 'bad' : ''].join(' ');
        return `<button type="button" class="act-opt ${cls}" data-i="${i}" data-flip="o${i}:${cls.trim()}" ${locked ? 'disabled' : ''}><b>${String.fromCharCode(65 + i)}</b><span>${richText(o)}</span></button>`;
      }).join('')}</div>`;
      break;
    }
    case 'answer':
      body = `<div class="act-input-row"><input class="act-input" data-flip="ans:${escapeHtml(String(draft ?? ''))}" value="${escapeHtml(String(draft ?? ''))}" placeholder="${escapeHtml(spec.placeholder ?? 'Type your answer')}" ${locked ? 'disabled' : ''} inputmode="${spec.numeric ? 'decimal' : 'text'}" autocomplete="off"/>${spec.unit ? `<span style="font-size:18px;font-weight:600">${escapeHtml(spec.unit)}</span>` : ''}</div>`;
      break;
    case 'order': {
      const order = (draft as string[]).length === spec.items.length ? (draft as string[]) : shuffled(spec.items, id);
      if ((draft as string[]).length !== spec.items.length && !locked) drafts.set(id, order);
      body = `<div class="act-order">${order.map((v, i) => `<div class="act-chip ${marks && spec.items[i] === v && (!example || i < shown) ? 'ok' : ''} ${picked.get(id) === i ? 'picked' : ''}" data-v="${escapeHtml(v)}" data-flip="c:${escapeHtml(v)}" data-i="${i}" data-drop="${i}"><span style="display:flex;align-items:center;gap:10px"><span class="act-num">${i + 1}</span>${richText(v)}</span>${locked ? '' : `<span class="act-move"><button type="button" data-up="${i}" aria-label="Move up">↑</button><button type="button" data-down="${i}" aria-label="Move down">↓</button></span>`}</div>`).join('')}</div>`;
      break;
    }
    case 'sort': {
      const where = draft as Record<string, string>;
      const items = shuffled(spec.categories.flatMap((cat) => cat.items), id);
      const ok = (item: string) => spec.categories.find((cat) => cat.items.includes(item))?.name === where[item];
      const chip = (item: string) => chipHtml(item, '', `${marks && where[item] ? (ok(item) ? 'ok' : 'bad') : ''} ${picked.get(id) === item ? 'picked' : ''}`);
      body = `<div class="act-bank" data-drop="__bank">${items.filter((i) => !where[i]).map(chip).join('')}</div><div class="act-cats">${spec.categories.map((cat) => `<div class="act-cat" data-drop="${escapeHtml(cat.name)}"><div class="act-cat-title">${escapeHtml(cat.name)}</div>${items.filter((i) => where[i] === cat.name).map(chip).join('')}</div>`).join('')}</div>`;
      break;
    }
    case 'match': {
      const pairs = draft as Record<string, string>;
      const lefts = spec.pairs.map((p) => p[0]), rights = shuffled(spec.pairs.map((p) => p[1]), id);
      const colorOf = (l: string) => PAIR_COLORS[lefts.indexOf(l) % PAIR_COLORS.length]!;
      const right = (l: string) => spec.pairs.find((p) => p[0] === l)?.[1];
      const leftChip = (l: string) => {
        const r = pairs[l];
        const cls = `${picked.get(id) === l ? 'picked' : ''} ${marks && r ? (right(l) === r ? 'ok' : 'bad') : ''}`;
        return `<span class="act-chip ${cls}" data-l="${escapeHtml(l)}"><span>${richText(l)}</span>${r ? `<span class="act-pair" data-flip="pl:${escapeHtml(l)}" style="background:${colorOf(l)}">${lefts.indexOf(l) + 1}</span>` : ''}</span>`;
      };
      const rightChip = (r: string) => {
        const l = Object.keys(pairs).find((k) => pairs[k] === r);
        return `<span class="act-chip" data-r="${escapeHtml(r)}"><span>${richText(r)}</span>${l ? `<span class="act-pair" data-flip="pr:${escapeHtml(l)}" style="background:${colorOf(l)}">${lefts.indexOf(l) + 1}</span>` : ''}</span>`;
      };
      body = `<div class="act-match">${lefts.map((l, i) => leftChip(l) + rightChip(rights[i]!)).join('')}</div><div class="act-caption">Tap an item on the left, then its match on the right.</div>`;
      break;
    }
    case 'cloze': {
      const blanks = clozeBlanks(spec.text), vals = draft as string[];
      let k = 0;
      const typed = spec.typed;
      const html = escapeHtml(spec.text).replace(/\[\[[^\]]+\]\]/g, () => {
        const i = k++, v = vals[i] ?? '';
        const okCls = marks && v ? (blanks[i]!.some((a) => a.trim().toLowerCase() === v.trim().toLowerCase()) ? 'ok' : 'bad') : '';
        if (typed) return `<span class="act-blank filled ${okCls}"><input data-b="${i}" value="${escapeHtml(v)}" ${locked ? 'disabled' : ''} autocomplete="off"/></span>`;
        return `<span class="act-blank ${v ? 'filled' : ''} ${okCls} ${picked.get(id) === `b${i}` ? 'act-over' : ''}" data-b="${i}" data-drop="b${i}">${v ? `<span data-flip="c:${escapeHtml(v)}">${escapeHtml(v)}</span>` : '&nbsp;'}</span>`;
      });
      let bank = '';
      if (!typed) {
        const pool = shuffled([...blanks.map((b) => b[0]!), ...(spec.bank ?? [])], id);
        const used = [...vals];
        const left = pool.filter((w) => {
          const j = used.indexOf(w);
          if (j >= 0) { used.splice(j, 1); return false; }
          return true;
        });
        bank = `<div class="act-bank" data-drop="__bank" style="margin-top:12px">${left.map((w) => chipHtml(w, '', picked.get(id) === w ? 'picked' : '')).join('')}</div>`;
      }
      body = `<div class="act-cloze">${html}</div>${bank}`;
      break;
    }
    case 'select': {
      const sel = new Set(draft as number[]);
      const tokens = selectTokens(spec.text);
      body = `<div class="act-passage">${tokens.map((t, i) => {
        const cls = [sel.has(i) ? 'sel' : '', marks && sel.has(i) ? (t.correct ? 'ok' : 'bad') : '', c.status === 'revealed' && t.correct && !sel.has(i) ? 'missed' : ''].join(' ');
        return `<span class="act-token ${cls}" data-t="${i}" data-flip="t${i}:${sel.has(i)}">${escapeHtml(t.text)}</span>`;
      }).join(' ')}</div>`;
      break;
    }
    case 'number_line': {
      const W = 600, H = 120, pad = 36, y = 70;
      const X = (v: number) => pad + ((v - spec.min) / (spec.max - spec.min)) * (W - 2 * pad);
      const n = Math.round((spec.max - spec.min) / spec.step);
      const ticks: string[] = [];
      for (let i = 0; i <= n; i++) {
        const v = spec.min + i * spec.step, x = X(v);
        const whole = Math.abs(v - Math.round(v)) < 1e-9;
        const labelIt = i === 0 || i === n || (whole && n <= 40) || n <= 10;
        ticks.push(`<line x1="${x}" y1="${y - (whole ? 11 : 7)}" x2="${x}" y2="${y + (whole ? 11 : 7)}" stroke="#57534e" stroke-width="${whole ? 2 : 1.4}"/>`);
        if (labelIt) ticks.push(`<text x="${x}" y="${y + 32}" text-anchor="middle" font-size="16" fill="#44403c">${spec.denominator ? fractionLabel(v, spec.denominator) : +v.toFixed(4)}</text>`);
      }
      const v = draft as number | null;
      const marker = v === null || v === undefined ? '' : `<g data-marker="" data-flip="marker"><line x1="${X(v)}" y1="${y - 30}" x2="${X(v)}" y2="${y}" stroke="${marks ? (gradeActivity(spec, v).correct ? '#16a34a' : '#dc2626') : '#7c3aed'}" stroke-width="3"/><circle cx="${X(v)}" cy="${y - 34}" r="11" fill="${marks ? (gradeActivity(spec, v).correct ? '#16a34a' : '#dc2626') : '#7c3aed'}" stroke="#ffffff" stroke-width="2.5"/>${locked ? `<text x="${X(v)}" y="${y - 52}" text-anchor="middle" font-size="16" font-weight="700" fill="#16a34a">${spec.denominator ? fractionLabel(v, spec.denominator) : +v.toFixed(4)}</text>` : ''}</g>`;
      body = `<div class="act-stage" data-nl=""><svg viewBox="0 0 ${W} ${H}"><line x1="${pad - 16}" y1="${y}" x2="${W - pad + 16}" y2="${y}" stroke="#57534e" stroke-width="2.5"/>${ticks.join('')}<rect x="0" y="0" width="${W}" height="${H}" fill="transparent" stroke="none" data-hit=""/>${marker}</svg></div><div class="act-caption">${locked ? '' : 'Tap or drag along the line to place the marker.'}</div>`;
      break;
    }
    case 'fraction_shade': {
      const on = new Set(draft as number[]);
      const N = spec.parts;
      const fill = (i: number) => (on.has(i) ? (marks && !(example && !exampleDone) ? (gradeActivity(spec, [...on]).correct ? '#4ade80' : '#fb7185') : '#a78bfa') : '#ffffff');
      const flipKey = (i: number) => `data-flip="p${i}:${on.has(i)}"`;
      let shapes = '';
      if (spec.shape === 'circle') {
        const R = 110, cx = 140, cy = 130;
        shapes = Array.from({ length: N }, (_, i) => {
          const a0 = -Math.PI / 2 + (i / N) * 2 * Math.PI, a1 = -Math.PI / 2 + ((i + 1) / N) * 2 * Math.PI;
          const d = N === 1 ? `M${cx - R} ${cy}A${R} ${R} 0 1 1 ${cx + R} ${cy}A${R} ${R} 0 1 1 ${cx - R} ${cy}Z` : `M${cx} ${cy}L${cx + R * Math.cos(a0)} ${cy + R * Math.sin(a0)}A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${cx + R * Math.cos(a1)} ${cy + R * Math.sin(a1)}Z`;
          return `<path d="${d}" data-p="${i}" ${flipKey(i)} fill="${fill(i)}" stroke="#7c3aed" stroke-width="2.5" style="cursor:pointer"/>`;
        }).join('');
        body = `<div class="act-stage" style="max-width:300px;margin:0 auto"><svg viewBox="0 0 280 260">${shapes}</svg></div>`;
      } else if (spec.shape === 'grid') {
        const cols = Math.ceil(Math.sqrt(N)), rows = Math.ceil(N / cols), S = Math.min(56, 480 / cols);
        shapes = Array.from({ length: N }, (_, i) => `<rect x="${10 + (i % cols) * S}" y="${10 + Math.floor(i / cols) * S}" width="${S}" height="${S}" data-p="${i}" ${flipKey(i)} fill="${fill(i)}" stroke="#7c3aed" stroke-width="2" style="cursor:pointer"/>`).join('');
        body = `<div class="act-stage" style="max-width:${cols * S + 20}px;margin:0 auto"><svg viewBox="0 0 ${cols * S + 20} ${rows * S + 20}">${shapes}</svg></div>`;
      } else {
        const W = 560, H = 90, w = W / N;
        shapes = Array.from({ length: N }, (_, i) => `<rect x="${10 + i * w}" y="10" width="${w}" height="${H}" data-p="${i}" ${flipKey(i)} fill="${fill(i)}" stroke="#7c3aed" stroke-width="2.5" style="cursor:pointer"/>`).join('');
        body = `<div class="act-stage"><svg viewBox="0 0 ${W + 20} ${H + 20}">${shapes}</svg></div>`;
      }
      body += `<div class="act-caption">${on.size} of ${N} parts shaded</div>`;
      break;
    }
    case 'plot_point': {
      const [x0, x1] = spec.xRange, [y0, y1] = spec.yRange, S = 400, pad = 30;
      const X = (x: number) => pad + ((x - x0) / (x1 - x0)) * (S - 2 * pad), Y = (y: number) => S - pad - ((y - y0) / (y1 - y0)) * (S - 2 * pad);
      const grid: string[] = [];
      for (let x = Math.ceil(x0); x <= x1; x++) grid.push(`<line x1="${X(x)}" y1="${Y(y0)}" x2="${X(x)}" y2="${Y(y1)}" stroke="${x === 0 ? '#57534e' : '#e7e5e4'}" stroke-width="${x === 0 ? 2 : 1}"/>${x !== 0 && x1 - x0 <= 20 ? `<text x="${X(x)}" y="${Y(0) + 16}" text-anchor="middle" font-size="11" fill="#78716c">${x}</text>` : ''}`);
      for (let y = Math.ceil(y0); y <= y1; y++) grid.push(`<line x1="${X(x0)}" y1="${Y(y)}" x2="${X(x1)}" y2="${Y(y)}" stroke="${y === 0 ? '#57534e' : '#e7e5e4'}" stroke-width="${y === 0 ? 2 : 1}"/>${y !== 0 && y1 - y0 <= 20 ? `<text x="${X(0) - 8}" y="${Y(y) + 4}" text-anchor="end" font-size="11" fill="#78716c">${y}</text>` : ''}`);
      const pts = draft as { x: number; y: number }[];
      const ok = (p: { x: number; y: number }) => spec.points.some((q) => Math.abs(q.x - p.x) <= (spec.tolerance ?? 0.25) && Math.abs(q.y - p.y) <= (spec.tolerance ?? 0.25));
      const dots = pts.map((p) => `<circle data-flip="pt${p.x},${p.y}" cx="${X(p.x)}" cy="${Y(p.y)}" r="9" fill="${marks ? (ok(p) ? '#16a34a' : '#dc2626') : '#7c3aed'}" stroke="#ffffff" stroke-width="2.5"/>${marks ? `<text x="${X(p.x) + 12}" y="${Y(p.y) - 10}" font-size="14" font-weight="700" fill="${ok(p) ? '#16a34a' : '#dc2626'}">(${p.x}, ${p.y})</text>` : ''}`).join('');
      body = `<div class="act-stage" style="max-width:${S}px;margin:0 auto" data-pp=""><svg viewBox="0 0 ${S} ${S}">${grid.join('')}<text x="${X(x1) - 4}" y="${Y(0) - 8}" text-anchor="end" font-size="13" font-style="italic" fill="#57534e">x</text><text x="${X(0) + 8}" y="${Y(y1) + 14}" font-size="13" font-style="italic" fill="#57534e">y</text><rect x="0" y="0" width="${S}" height="${S}" fill="transparent" stroke="none"/>${dots}</svg></div><div class="act-caption">${locked ? '' : `Tap the grid to place ${spec.points.length === 1 ? 'the point' : `${spec.points.length} points`}; tap a point to remove it.`}</div>`;
      break;
    }
    case 'map_click': {
      const sel = draft as string[];
      body = `<div class="act-stage" data-map="">${spec.svg}</div><div class="act-bank" style="margin-top:10px;min-height:40px">${sel.map((s) => `<span data-flip="m:${s}" class="act-chip ${marks ? (spec.answers.includes(s) ? 'ok' : 'bad') : ''}" style="cursor:default">${escapeHtml(spec.names[s] ?? prettyPlace(s))}</span>`).join('') || `<span class="act-caption" style="margin:0">Tap a country on the map.</span>`}</div>`;
      break;
    }
    case 'chem_balance': {
      const k = draft as (number | null)[];
      const species = [...spec.reactants, ...spec.products];
      const parts = species.map((f, i) => `${i === spec.reactants.length ? '<span style="padding:0 6px">→</span>' : i > 0 ? '<span>+</span>' : ''}<span style="display:inline-flex;align-items:center;gap:6px"><input type="number" min="1" max="30" class="act-coef" data-c="${i}" data-flip="k${i}:${k[i]}" value="${k[i] === null ? '' : k[i] ?? 1}" placeholder="?" ${locked ? 'disabled' : ''}/><span>${prettyFormula(f)}</span></span>`).join('');
      body = `<div class="act-eq">${parts}</div><div class="act-atoms" data-atoms="">${atomsHtml(spec, k.map((v) => v ?? 1))}</div>`;
      break;
    }
    case 'label': {
      const where = draft as Record<string, string>;
      const bankWords = shuffled([...spec.targets.map((t) => t.label), ...(spec.extra ?? [])], id).filter((w) => !Object.values(where).includes(w));
      const zones = spec.targets.map((t, i) => {
        const v = where[t.part];
        const cls = marks && v ? (v === t.label ? 'ok' : 'bad') : '';
        return `<div class="act-zone" data-zone="${escapeHtml(t.part)}" data-drop="z:${escapeHtml(t.part)}">${v ? chipHtml(v, `data-from="${escapeHtml(t.part)}"`, cls) : `<span class="act-dot">${i + 1}</span>`}</div>`;
      }).join('');
      body = `<div class="act-stage" data-label="" style="overflow:visible">${spec.svg}${zones}</div><div class="act-bank" data-drop="__bank" style="margin-top:12px">${bankWords.map((w) => chipHtml(w, '', picked.get(id) === w ? 'picked' : '')).join('')}</div>`;
      break;
    }
  }

  // Footer: feedback, hint, explanation, actions.
  let fb = '';
  if (example) {
    const line = shown ? `<b>Step ${shown}.</b> ${richText(describeStep(spec, shown - 1))}` : 'Watch: this one gets solved step by step.';
    fb = `<div class="act-fb ex"><div>${line}${exampleDone && c.explanation ? `<small>${richText(c.explanation)}</small>` : ''}</div></div>`;
  } else if (c.status === 'correct') fb = `<div class="act-fb good"><span>✓</span><div>${escapeHtml(c.feedback ?? 'Correct!')}${c.explanation ? `<small>${richText(c.explanation)}</small>` : ''}</div></div>`;
  else if (c.status === 'revealed') fb = `<div class="act-fb info"><span>👀</span><div>Here's the answer.${c.explanation ? `<small>${richText(c.explanation)}</small>` : ''}</div></div>`;
  else if (c.status === 'wrong') {
    const hint = c.hints?.length ? c.hints[Math.min(c.attempts - 1, c.hints.length - 1)] : undefined;
    fb = `<div class="act-fb bad"><span>↺</span><div>${escapeHtml(c.feedback ?? 'Not quite.')} Try again!${hint ? `<small>💡 ${richText(hint)}</small>` : ''}</div></div>`;
  }
  const canShow = c.status === 'wrong' && c.attempts >= 2;
  const actions = example ? (host && !exampleDone ? `<div class="act-actions"><button type="button" class="act-btn" data-act="next">${shown ? 'Next step' : 'Start'} ›</button></div>` : '') : locked ? '' : `<div class="act-actions">${canShow ? '<button type="button" class="act-btn" data-act="show">Show me</button>' : ''}${autoSubmit ? '' : `<button type="button" class="act-btn act-primary" data-act="check" ${ready(spec, draft) ? '' : 'disabled'}>Check</button>`}</div>`;
  node.innerHTML =
    `<div class="act-head">${c.step ? `<span class="act-step">${escapeHtml(c.step)}</span>` : ''}${example ? `<span>Worked example</span><span class="act-step">${shown}/${total}</span>` : `<span>${escapeHtml(spec.kind === 'choice' && spec.multiple ? 'Choose all that apply' : KIND_LABEL[spec.kind])}</span>`}</div>` +
    `<div class="act-prompt">${richText(c.prompt)}</div><div class="act-body">${body}</div>` +
    (fb || actions ? `<div class="act-foot">${fb}${actions}</div>` : '');

  // Map selection is marked before painting (theme conversion must run exactly once per element).
  if (spec.kind === 'map_click') {
    const sel = new Set(draft as string[]);
    node.querySelectorAll<SVGElement>('[data-map] [data-k^="c-"]').forEach((path) => {
      const s = path.getAttribute('data-k')!.slice(2);
      path.style.cursor = locked ? 'default' : 'pointer';
      if (sel.has(s)) {
        path.setAttribute('fill', marks ? (spec.answers.includes(s) ? '#4ade80' : '#fb7185') : '#a78bfa');
        path.setAttribute('stroke', '#7c3aed');
      }
    });
  }
  host?.paint(node);
  if (before) {
    if (spec.kind === 'label' && node.isConnected) placeZones(node, spec); // final spots first, so chips glide to them
    playFlip(node, before);
  }

  // Celebrate / shake on a fresh result (not on re-renders of an old one).
  const key = `${c.status}:${c.attempts}`;
  const prev = node.dataset.actState;
  node.dataset.actState = key;
  if (host && prev && prev !== key) {
    if (c.status === 'correct') { celebrate(node); playCorrect(); }
    else if (c.status === 'wrong') { shake(node); playWrong(); }
  }
  if (!host || locked) {
    if (spec.kind === 'label') requestAnimationFrame(() => placeZones(node, spec));
    // The student can step through an example themselves too.
    if (host && example) node.querySelector('[data-act="next"]')?.addEventListener('click', () => host.commit({ ...c, shown: shown + 1 }));
    return;
  }

  // ---- Interactions.
  function check(response: unknown = drafts.get(id) ?? draft) {
    const g = gradeActivity(spec, response);
    picked.delete(id);
    host!.commit({ ...c, status: g.correct ? 'correct' : 'wrong', attempts: c.attempts + 1, response, feedback: g.feedback });
  }
  function updateCheck() {
    const btn = node.querySelector<HTMLButtonElement>('[data-act="check"]');
    if (btn) btn.disabled = !ready(spec, drafts.get(id) ?? draft);
  }
  node.querySelector('[data-act="check"]')?.addEventListener('click', () => check());
  node.querySelector('[data-act="show"]')?.addEventListener('click', () => {
    picked.delete(id);
    drafts.delete(id);
    host!.commit({ ...c, status: 'revealed', response: solutionFor(spec), feedback: "Here's the answer." });
  });
  const pick = (v: string | number | null) => {
    picked.set(id, picked.get(id) === v ? null : v);
    playTap();
    renderActivity(node, el, host);
  };

  switch (spec.kind) {
    case 'choice':
      node.querySelectorAll<HTMLElement>('[data-i]').forEach((b) => b.addEventListener('click', () => {
        const i = Number(b.dataset.i);
        if (!spec.multiple) { drafts.set(id, [i]); check([i]); return; }
        const cur = new Set(draft as number[]);
        cur.has(i) ? cur.delete(i) : cur.add(i);
        setDraft([...cur].sort());
      }));
      break;
    case 'answer': {
      const input = node.querySelector<HTMLInputElement>('.act-input')!;
      input.addEventListener('pointerdown', (e) => e.stopPropagation());
      input.addEventListener('input', () => setDraft(input.value, false));
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && input.value.trim()) check(input.value);
      });
      break;
    }
    case 'order': {
      const move = (from: number, to: number) => {
        const cur = [...(drafts.get(id) as string[])];
        const [x] = cur.splice(from, 1);
        cur.splice(to, 0, x!);
        picked.delete(id);
        playTap();
        setDraft(cur);
      };
      node.querySelectorAll<HTMLElement>('[data-up]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); const i = Number(b.dataset.up); if (i > 0) move(i, i - 1); }));
      node.querySelectorAll<HTMLElement>('[data-down]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); const i = Number(b.dataset.down); if (i < spec.items.length - 1) move(i, i + 1); }));
      node.querySelectorAll<HTMLElement>('.act-order .act-chip').forEach((chip) => draggable(chip, (t) => move(Number(chip.dataset.i), Number(t.dataset.drop)), () => {
        const i = Number(chip.dataset.i), p = picked.get(id);
        if (typeof p === 'number' && p !== i) move(p, i);
        else pick(i);
      }));
      break;
    }
    case 'sort': {
      const place = (item: string, target: string) => {
        const cur = { ...(drafts.get(id) as Record<string, string> ?? draft as Record<string, string>) };
        if (target === '__bank') delete cur[item];
        else cur[item] = target;
        picked.delete(id);
        playTap();
        setDraft(cur);
      };
      node.querySelectorAll<HTMLElement>('.act-chip[data-v]').forEach((chip) => draggable(chip, (t) => place(chip.dataset.v!, t.dataset.drop!), () => pick(chip.dataset.v!)));
      node.querySelectorAll<HTMLElement>('[data-drop]').forEach((zone) => zone.addEventListener('click', (e) => {
        const p = picked.get(id);
        if (typeof p === 'string' && !(e.target as HTMLElement).closest('.act-chip')) place(p, zone.dataset.drop!);
      }));
      break;
    }
    case 'match':
      node.querySelectorAll<HTMLElement>('[data-l]').forEach((chip) => chip.addEventListener('click', () => pick(chip.dataset.l!)));
      node.querySelectorAll<HTMLElement>('[data-r]').forEach((chip) => chip.addEventListener('click', () => {
        const l = picked.get(id);
        if (typeof l !== 'string') return;
        const cur = { ...(draft as Record<string, string>) };
        for (const k of Object.keys(cur)) if (cur[k] === chip.dataset.r) delete cur[k];
        cur[l] = chip.dataset.r!;
        picked.delete(id);
        playTap();
        setDraft(cur);
      }));
      break;
    case 'cloze': {
      const vals = () => [...((drafts.get(id) as string[]) ?? (draft as string[]))];
      const fill = (word: string, blank?: number) => {
        const cur = vals();
        const i = blank ?? (typeof picked.get(id) === 'string' && String(picked.get(id)).startsWith('b') ? Number(String(picked.get(id)).slice(1)) : cur.findIndex((v) => !v));
        if (i < 0 || i >= cur.length) return;
        cur[i] = word;
        picked.delete(id);
        playTap();
        setDraft(cur);
      };
      if (spec.typed) {
        node.querySelectorAll<HTMLInputElement>('input[data-b]').forEach((inp) => {
          inp.addEventListener('pointerdown', (e) => e.stopPropagation());
          inp.addEventListener('keydown', (e) => e.stopPropagation());
          inp.addEventListener('input', () => { const cur = vals(); cur[Number(inp.dataset.b)] = inp.value; setDraft(cur, false); });
        });
        break;
      }
      node.querySelectorAll<HTMLElement>('.act-bank .act-chip').forEach((chip) => draggable(chip, (t) => { if (t.dataset.drop?.startsWith('b')) fill(chip.dataset.v!, Number(t.dataset.drop.slice(1))); }, () => fill(chip.dataset.v!)));
      node.querySelectorAll<HTMLElement>('.act-blank').forEach((b) => b.addEventListener('click', () => {
        const i = Number(b.dataset.b), cur = vals();
        if (cur[i]) { cur[i] = ''; playTap(); setDraft(cur); } // tap a filled blank to send its word back
        else pick(`b${i}`);
      }));
      break;
    }
    case 'select':
      node.querySelectorAll<HTMLElement>('[data-t]').forEach((t) => t.addEventListener('click', () => {
        const cur = new Set(draft as number[]), i = Number(t.dataset.t);
        cur.has(i) ? cur.delete(i) : cur.add(i);
        playTap();
        setDraft([...cur].sort((a, b) => a - b));
      }));
      break;
    case 'number_line': {
      const nl = spec;
      const svg = node.querySelector<SVGSVGElement>('[data-nl] svg')!;
      const W = 600, pad = 36;
      const valueAt = (e: PointerEvent) => {
        const { x } = svgPoint(svg, e);
        const raw = spec.min + ((x - pad) / (W - 2 * pad)) * (spec.max - spec.min);
        const snapped = Math.round((raw - spec.min) / spec.step) * spec.step + spec.min;
        return Math.min(spec.max, Math.max(spec.min, +snapped.toFixed(9)));
      };
      let dragging = false;
      svg.addEventListener('pointerdown', (e) => { e.stopPropagation(); dragging = true; svg.setPointerCapture(e.pointerId); drafts.set(id, valueAt(e)); renderLight(); });
      svg.addEventListener('pointermove', (e) => { if (dragging) { drafts.set(id, valueAt(e)); renderLight(); } });
      svg.addEventListener('pointerup', () => { if (dragging) { dragging = false; playTap(); renderActivity(node, el, host); } });
      // Move the marker without rebuilding the card (keeps the pointer capture alive while dragging).
      function renderLight() {
        const v = drafts.get(id) as number;
        const x = pad + ((v - nl.min) / (nl.max - nl.min)) * (W - 2 * pad);
        let g = svg.querySelector('[data-marker]');
        if (!g) {
          svg.insertAdjacentHTML('beforeend', `<g data-marker=""><line y1="40" y2="70" stroke="#7c3aed" stroke-width="3"/><circle cy="36" r="11" fill="#7c3aed" stroke="#ffffff" stroke-width="2.5"/></g>`);
          g = svg.querySelector('[data-marker]')!;
          host!.paint(g as unknown as HTMLElement);
        }
        g.querySelector('line')!.setAttribute('x1', String(x));
        g.querySelector('line')!.setAttribute('x2', String(x));
        g.querySelector('circle')!.setAttribute('cx', String(x));
        updateCheck();
      }
      break;
    }
    case 'fraction_shade':
      node.querySelectorAll<SVGElement>('[data-p]').forEach((p) => p.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const cur = new Set(draft as number[]), i = Number(p.dataset.p);
        cur.has(i) ? cur.delete(i) : cur.add(i);
        playTap();
        setDraft([...cur].sort((a, b) => a - b));
      }));
      break;
    case 'plot_point': {
      const svg = node.querySelector<SVGSVGElement>('[data-pp] svg')!;
      const [x0, x1] = spec.xRange, [y0, y1] = spec.yRange, S = 400, pad = 30;
      const snap = x1 - x0 <= 24 ? 1 : (x1 - x0) / 20;
      svg.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const { x, y } = svgPoint(svg, e);
        const vx = Math.round((x0 + ((x - pad) / (S - 2 * pad)) * (x1 - x0)) / snap) * snap;
        const vy = Math.round((y0 + ((S - pad - y) / (S - 2 * pad)) * (y1 - y0)) / snap) * snap;
        if (vx < x0 || vx > x1 || vy < y0 || vy > y1) return;
        let cur = [...(draft as { x: number; y: number }[])];
        const hit = cur.findIndex((p) => Math.abs(p.x - vx) < snap / 2 && Math.abs(p.y - vy) < snap / 2);
        if (hit >= 0) cur.splice(hit, 1);
        else {
          cur.push({ x: +vx.toFixed(6), y: +vy.toFixed(6) });
          if (cur.length > spec.points.length) cur = cur.slice(-spec.points.length);
        }
        playTap();
        setDraft(cur);
      });
      break;
    }
    case 'map_click': {
      const stage = node.querySelector<HTMLElement>('[data-map]')!;
      const sel = new Set(draft as string[]);
      stage.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const path = (e.target as Element).closest('[data-k^="c-"]');
        if (!path) return;
        const s = path.getAttribute('data-k')!.slice(2);
        sel.has(s) ? sel.delete(s) : sel.add(s);
        playTap();
        setDraft([...sel]);
      });
      break;
    }
    case 'chem_balance':
      node.querySelectorAll<HTMLInputElement>('.act-coef').forEach((inp) => {
        inp.addEventListener('pointerdown', (e) => e.stopPropagation());
        inp.addEventListener('keydown', (e) => e.stopPropagation());
        inp.addEventListener('input', () => {
          const cur = [...((drafts.get(id) as number[]) ?? (draft as number[]))];
          cur[Number(inp.dataset.c)] = Math.max(0, Math.round(Number(inp.value) || 0));
          drafts.set(id, cur);
          const box = node.querySelector<HTMLElement>('[data-atoms]');
          if (box) { box.innerHTML = atomsHtml(spec, cur); host!.paint(box); }
          updateCheck();
        });
      });
      break;
    case 'label': {
      requestAnimationFrame(() => placeZones(node, spec));
      const place = (word: string, part: string | null, from?: string) => {
        const cur = { ...(draft as Record<string, string>) };
        if (from) delete cur[from];
        for (const k of Object.keys(cur)) if (cur[k] === word) delete cur[k];
        if (part) cur[part] = word;
        picked.delete(id);
        playTap();
        setDraft(cur);
      };
      node.querySelectorAll<HTMLElement>('.act-chip[data-v]').forEach((chip) => draggable(chip, (t) => {
        const d = t.dataset.drop!;
        place(chip.dataset.v!, d.startsWith('z:') ? d.slice(2) : null, chip.dataset.from);
      }, () => (chip.dataset.from ? place(chip.dataset.v!, null, chip.dataset.from) : pick(chip.dataset.v!))));
      node.querySelectorAll<HTMLElement>('[data-zone]').forEach((z) => z.addEventListener('click', () => {
        const p = picked.get(id);
        if (typeof p === 'string') place(p, z.dataset.zone!);
      }));
      break;
    }
  }
}

/** Guided practice: the first steps are already done; undecided coefficients start at 1. */
function givenStart(spec: ActivitySpec, given: number, seed: string): unknown {
  const d = partialSolution(spec, given, seed);
  return spec.kind === 'chem_balance' ? (d as (number | null)[]).map((v) => v ?? 1) : d;
}

/** Screen boxes of everything with a motion key, taken before a re-render. */
function snapshot(node: HTMLElement): Map<string, DOMRect> {
  const m = new Map<string, DOMRect>();
  node.querySelectorAll('[data-flip]').forEach((e) => {
    const k = e.getAttribute('data-flip')!;
    if (!m.has(k)) m.set(k, e.getBoundingClientRect());
  });
  return m;
}

/** FLIP: things that moved glide from where they were; things that just appeared pop in. */
function playFlip(node: HTMLElement, before: Map<string, DOMRect>): void {
  if (!before.size || typeof Element.prototype.animate !== 'function') return;
  const r = node.getBoundingClientRect();
  const zoom = r.width / (node.offsetWidth || r.width || 1) || 1;
  const seen = new Set<string>();
  node.querySelectorAll<HTMLElement | SVGElement>('[data-flip]').forEach((e) => {
    const k = e.getAttribute('data-flip')!;
    if (seen.has(k)) return;
    seen.add(k);
    const old = before.get(k);
    const svg = e instanceof SVGElement ? (e as SVGGraphicsElement).ownerSVGElement : null;
    if (svg) Object.assign(e.style, { transformBox: 'fill-box', transformOrigin: 'center' });
    if (old) {
      const now = e.getBoundingClientRect();
      const dx = old.left - now.left, dy = old.top - now.top;
      if (Math.hypot(dx, dy) < 1) return;
      const s = svg ? svg.getBoundingClientRect().width / (svg.viewBox.baseVal.width || 1) || 1 : zoom;
      e.animate([{ transform: `translate(${dx / s}px, ${dy / s}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
    } else {
      e.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'ease-out' });
    }
  });
}

function atomsHtml(spec: Extract<ActivitySpec, { kind: 'chem_balance' }>, k: number[]): string {
  try {
    const { left, right } = checkBalance(spec.reactants, spec.products, k);
    const els = [...new Set([...spec.reactants, ...spec.products].flatMap((f) => Object.keys(parseFormula(f))))];
    return els.map((e) => `<span class="act-atom ${left[e] === right[e] ? 'act-eqok' : ''}">${e}: ${left[e] ?? 0} | ${right[e] ?? 0}${left[e] === right[e] ? ' ✓' : ''}</span>`).join('');
  } catch {
    return '';
  }
}

/**
 * Puts label drop zones on the sketch parts they name: the center for small parts, the upper-right
 * edge for big ones that enclose others (a membrane around a nucleus), then nudges overlapping zones apart.
 */
function placeZones(node: HTMLElement, spec: Extract<ActivitySpec, { kind: 'label' }>): void {
  const stage = node.querySelector<HTMLElement>('[data-label]');
  const svg = stage?.querySelector('svg');
  if (!stage || !svg) return;
  const vb = svg.viewBox.baseVal;
  const boxes = spec.targets.map((t) => {
    const part = svg.querySelector<SVGGraphicsElement>(`[data-k="${CSS.escape(t.part)}"]`);
    return part && typeof part.getBBox === 'function' ? part.getBBox() : null;
  });
  const centers = boxes.map((b) => (b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null));
  const spots = boxes.map((b, i) => {
    if (!b) return null;
    const area = (x: DOMRect) => x.width * x.height;
    const encloses = centers.some((c, j) => j !== i && c && boxes[j] && area(b) > 1.5 * area(boxes[j]!) && c.x > b.x && c.x < b.x + b.width && c.y > b.y && c.y < b.y + b.height);
    const big = b.width * b.height > 0.3 * vb.width * vb.height;
    // On an ellipse-like outline, the point at 45° is about 85% / 15% across its box.
    return encloses || big ? { x: b.x + b.width * 0.86, y: b.y + b.height * 0.15 } : centers[i]!;
  });
  const minGap = Math.min(vb.width, vb.height) * 0.12;
  for (let i = 0; i < spots.length; i++) for (let j = 0; j < i; j++) {
    const a = spots[i], b = spots[j];
    if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < minGap) a.y = Math.min(vb.y + vb.height * 0.95, b.y + minGap);
  }
  spec.targets.forEach((t, i) => {
    const zone = stage.querySelector<HTMLElement>(`[data-zone="${CSS.escape(t.part)}"]`);
    const p = spots[i];
    if (!zone || !p) return;
    zone.style.left = `${((p.x - vb.x) / vb.width) * 100}%`;
    zone.style.top = `${((p.y - vb.y) / vb.height) * 100}%`;
  });
}

/** Forget local drafts (e.g. when the board is cleared). */
export function clearActivityDrafts(): void {
  drafts.clear();
  picked.clear();
}
