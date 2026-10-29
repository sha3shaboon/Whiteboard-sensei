// Live physics simulation cards: the motion plays on its own, and the student can pause, replay
// and drag sliders to explore ("what if the angle were 60°?"). Slider changes are saved as student
// changes, so the tutor hears what the student tried.

import { SIM_PARAMS, simDuration, simFrame, type SimulationKind } from '../simulation';
import type { SimulationElement } from '../elements';
import { escapeHtml } from './overlay';
import { themeText, type Theme } from './theme';

export interface SimulationHost {
  commit(params: Record<string, number>): void;
  theme(): Theme;
}

interface Run { start: number; playing: boolean; t: number; params: Record<string, number>; run: number; raf: number }
const runs = new WeakMap<HTMLElement, Run>();

let styled = false;
function injectStyles(): void {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
.sim { --c-bg:#ffffff; --c-line:#e7e5e4; --c-text:#1c1c1a; --c-muted:#78716c; --c-acc:#6d28d9; --c-soft:#fafaf9;
  font-family:'Inter',system-ui,sans-serif; color:var(--c-text); background:var(--c-bg); border:1.5px solid var(--c-line); border-radius:22px; padding:16px 18px; box-shadow:0 10px 30px rgba(30,27,75,.10); user-select:none; }
.board-root[data-theme="dark"] .sim { --c-bg:#14162a; --c-line:rgba(255,255,255,.11); --c-text:#eef0f8; --c-muted:#8b90a7; --c-acc:#a78bfa; --c-soft:rgba(255,255,255,.04); box-shadow:0 18px 50px rgba(0,0,0,.5); }
.sim-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
.sim-title { font-size:17px; font-weight:700; }
.sim-tag { font-size:11px; font-weight:700; letter-spacing:.09em; text-transform:uppercase; color:var(--c-acc); }
.sim-stage { border-radius:14px; overflow:hidden; background:var(--c-soft); border:1.5px solid var(--c-line); }
.sim-stage svg { display:block; width:100%; height:auto; }
.sim-bar { display:flex; align-items:center; gap:8px; margin-top:10px; }
.sim-btn { font:inherit; font-weight:650; font-size:14px; padding:8px 14px; border-radius:12px; border:1.5px solid var(--c-line); background:var(--c-soft); color:var(--c-text); cursor:pointer; }
.sim-btn.sim-primary { border:0; color:#fff; background:linear-gradient(135deg,#8b5cf6,#3b82f6); }
.sim-sliders { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:8px 18px; margin-top:12px; }
.sim-sl label { display:flex; justify-content:space-between; font-size:13px; color:var(--c-muted); font-weight:600; }
.sim-sl label b { color:var(--c-text); }
.sim-sl input { width:100%; accent-color:#7c3aed; }
`;
  document.head.appendChild(s);
}

const W = 640, H = 360;
const TITLES: Record<SimulationKind, string> = { projectile: 'Projectile motion', pendulum: 'Pendulum', spring: 'Mass on a spring', wave: 'Traveling wave' };

export function renderSimulation(node: HTMLElement, el: SimulationElement, host?: SimulationHost): void {
  injectStyles();
  const c = el.content;
  let run = runs.get(node);
  if (!run || run.run !== c.run || JSON.stringify(run.params) !== JSON.stringify(c.params)) {
    if (run) cancelAnimationFrame(run.raf);
    run = { start: performance.now(), playing: true, t: 0, params: { ...c.params }, run: c.run, raf: 0 };
    runs.set(node, run);
  }
  const r = run;
  const sliders = c.controls.map((key) => SIM_PARAMS[c.kind].find((p) => p.key === key)).filter((p): p is NonNullable<typeof p> => !!p);
  node.className = 'sim';
  node.style.position = 'absolute';
  node.style.boxSizing = 'border-box';
  node.innerHTML =
    `<div class="sim-head"><div><div class="sim-tag">Simulation</div><div class="sim-title">${escapeHtml(c.title ?? TITLES[c.kind])}</div></div></div>` +
    `<div class="sim-stage"><svg viewBox="0 0 ${W} ${H}"><defs>${['orange:#ea580c', 'green:#16a34a'].map((m) => { const [n, col] = m.split(':'); return `<marker id="arrow-${n}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${themeText(col!, host?.theme() ?? 'light')}" stroke="none"/></marker>`; }).join('')}</defs><g data-frame=""></g></svg></div>` +
    `<div class="sim-bar"><button type="button" class="sim-btn sim-primary" data-play="">${r.playing ? 'Pause' : 'Play'}</button><button type="button" class="sim-btn" data-replay="">Replay</button></div>` +
    (sliders.length ? `<div class="sim-sliders">${sliders.map((p) => `<div class="sim-sl"><label>${escapeHtml(p.label)} <b data-v="${p.key}">${r.params[p.key]} ${p.unit}</b></label><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${r.params[p.key]}" data-k="${p.key}"/></div>`).join('')}</div>` : '');
  const frame = node.querySelector<SVGGElement>('[data-frame]')!;
  const draw = () => {
    frame.innerHTML = themeText(simFrame(c.kind, r.params, r.t, W, H), host?.theme() ?? 'light');
  };
  const tick = (now: number) => {
    if (!node.isConnected) return;
    if (r.playing) {
      r.t = (now - r.start) / 1000;
      const end = simDuration(c.kind, r.params);
      if (r.t >= end) {
        r.t = end;
        r.playing = false;
        const b = node.querySelector('[data-play]');
        if (b) b.textContent = 'Play';
      }
      draw();
    }
    r.raf = requestAnimationFrame(tick);
  };
  draw();
  cancelAnimationFrame(r.raf);
  r.raf = requestAnimationFrame(tick);
  if (!host) return;

  const restart = () => {
    r.start = performance.now();
    r.t = 0;
    r.playing = true;
    node.querySelector('[data-play]')!.textContent = 'Pause';
  };
  const stop = (e: Event) => e.stopPropagation();
  node.querySelector('[data-play]')!.addEventListener('click', () => {
    if (r.playing) {
      r.playing = false;
    } else {
      if (r.t >= simDuration(c.kind, r.params) - 1e-6) r.t = 0;
      r.start = performance.now() - r.t * 1000;
      r.playing = true;
    }
    node.querySelector('[data-play]')!.textContent = r.playing ? 'Pause' : 'Play';
  });
  node.querySelector('[data-replay]')!.addEventListener('click', restart);
  node.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) => {
    inp.addEventListener('pointerdown', stop);
    inp.addEventListener('input', () => {
      r.params = { ...r.params, [inp.dataset.k!]: Number(inp.value) };
      const p = sliders.find((s) => s.key === inp.dataset.k)!;
      node.querySelector(`[data-v="${p.key}"]`)!.textContent = `${inp.value} ${p.unit}`;
      restart();
      draw();
    });
    // Saved on release, so the tutor hears one change, not every pixel of the drag.
    inp.addEventListener('change', () => host.commit({ ...r.params }));
  });
}
