// Physics simulations computed exactly (or by RK4 where there is no closed form) as a pure
// function of time, plus an SVG frame renderer. The board view animates them and lets the
// student change parameters with sliders.

export type SimulationKind = 'projectile' | 'pendulum' | 'spring' | 'wave';

export interface SimParam { key: string; label: string; min: number; max: number; step: number; unit: string }

export const SIM_PARAMS: Record<SimulationKind, SimParam[]> = {
  projectile: [
    { key: 'speed', label: 'Launch speed', min: 5, max: 40, step: 1, unit: 'm/s' },
    { key: 'angle', label: 'Angle', min: 5, max: 85, step: 1, unit: '°' },
    { key: 'height', label: 'Launch height', min: 0, max: 30, step: 1, unit: 'm' },
    { key: 'gravity', label: 'Gravity', min: 1.6, max: 25, step: 0.1, unit: 'm/s²' },
  ],
  pendulum: [
    { key: 'length', label: 'Length', min: 0.2, max: 3, step: 0.1, unit: 'm' },
    { key: 'angle', label: 'Start angle', min: 5, max: 80, step: 1, unit: '°' },
    { key: 'gravity', label: 'Gravity', min: 1.6, max: 25, step: 0.1, unit: 'm/s²' },
    { key: 'damping', label: 'Damping', min: 0, max: 1, step: 0.05, unit: '' },
  ],
  spring: [
    { key: 'mass', label: 'Mass', min: 0.1, max: 5, step: 0.1, unit: 'kg' },
    { key: 'stiffness', label: 'Spring constant', min: 1, max: 100, step: 1, unit: 'N/m' },
    { key: 'amplitude', label: 'Pull', min: 0.05, max: 0.5, step: 0.01, unit: 'm' },
    { key: 'damping', label: 'Damping', min: 0, max: 2, step: 0.05, unit: 'kg/s' },
  ],
  wave: [
    { key: 'amplitude', label: 'Amplitude', min: 0.1, max: 1, step: 0.05, unit: 'm' },
    { key: 'wavelength', label: 'Wavelength', min: 0.5, max: 4, step: 0.1, unit: 'm' },
    { key: 'frequency', label: 'Frequency', min: 0.1, max: 2, step: 0.05, unit: 'Hz' },
    { key: 'amplitude2', label: 'Second wave', min: 0, max: 1, step: 0.05, unit: 'm' },
  ],
};

export const SIM_DEFAULTS: Record<SimulationKind, Record<string, number>> = {
  projectile: { speed: 20, angle: 45, height: 0, gravity: 9.8 },
  pendulum: { length: 1, angle: 30, gravity: 9.8, damping: 0 },
  spring: { mass: 1, stiffness: 20, amplitude: 0.3, damping: 0 },
  wave: { amplitude: 0.5, wavelength: 2, frequency: 0.5, amplitude2: 0 },
};

export function simParams(kind: SimulationKind, given: Record<string, unknown> = {}): Record<string, number> {
  const out = { ...SIM_DEFAULTS[kind] };
  for (const p of SIM_PARAMS[kind]) {
    const v = Number(given[p.key]);
    if (Number.isFinite(v)) out[p.key] = Math.min(p.max, Math.max(p.min, v));
  }
  return out;
}

/** Facts worth narrating (range, period, ...), computed from the parameters. */
export function simFacts(kind: SimulationKind, p: Record<string, number>): Record<string, number> {
  switch (kind) {
    case 'projectile': {
      const a = (p.angle! * Math.PI) / 180, vx = p.speed! * Math.cos(a), vy = p.speed! * Math.sin(a), g = p.gravity!;
      const flight = (vy + Math.sqrt(vy * vy + 2 * g * p.height!)) / g;
      return { flightTime: flight, range: vx * flight, maxHeight: p.height! + (vy * vy) / (2 * g) };
    }
    case 'pendulum': return { period: 2 * Math.PI * Math.sqrt(p.length! / p.gravity!) };
    case 'spring': {
      const w = Math.sqrt(p.stiffness! / p.mass!);
      return { period: (2 * Math.PI) / w, maxSpeed: w * p.amplitude! };
    }
    case 'wave': return { speed: p.wavelength! * p.frequency!, period: 1 / p.frequency! };
  }
}

/** Pendulum angle over time by RK4 on θ'' = −(g/L)·sin θ − c·θ' (large angles included). */
function pendulumAngle(p: Record<string, number>, t: number): { theta: number; omega: number } {
  let th = (p.angle! * Math.PI) / 180, om = 0;
  const dt = 1 / 240, steps = Math.min(240 * 60, Math.floor(t / dt));
  const f = (a: number, w: number) => -(p.gravity! / p.length!) * Math.sin(a) - p.damping! * w;
  for (let i = 0; i < steps; i++) {
    const k1a = om, k1w = f(th, om);
    const k2a = om + (dt / 2) * k1w, k2w = f(th + (dt / 2) * k1a, om + (dt / 2) * k1w);
    const k3a = om + (dt / 2) * k2w, k3w = f(th + (dt / 2) * k2a, om + (dt / 2) * k2w);
    const k4a = om + dt * k3w, k4w = f(th + dt * k3a, om + dt * k3w);
    th += (dt / 6) * (k1a + 2 * k2a + 2 * k3a + k4a);
    om += (dt / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
  }
  return { theta: th, omega: om };
}

/** Spring-mass displacement (exact damped harmonic oscillator). */
function springX(p: Record<string, number>, t: number): number {
  const w0 = Math.sqrt(p.stiffness! / p.mass!), gamma = p.damping! / (2 * p.mass!);
  if (gamma < w0) {
    const wd = Math.sqrt(w0 * w0 - gamma * gamma);
    return p.amplitude! * Math.exp(-gamma * t) * (Math.cos(wd * t) + (gamma / wd) * Math.sin(wd * t));
  }
  return p.amplitude! * Math.exp(-w0 * t) * (1 + w0 * t); // critically/over-damped approximation
}

const f1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number, d = 2) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(d));

/** One frame of the simulation at time t, as SVG (light-theme colors; the board converts them). */
export function simFrame(kind: SimulationKind, p: Record<string, number>, t: number, W = 640, H = 360): string {
  const out: string[] = [];
  const readout = (lines: string[]) => `<g font-size="14" fill="#44403c">${lines.map((l, i) => `<text x="${W - 16}" y="${24 + i * 20}" text-anchor="end">${l}</text>`).join('')}</g>`;
  switch (kind) {
    case 'projectile': {
      const facts = simFacts(kind, p);
      const a = (p.angle! * Math.PI) / 180, vx = p.speed! * Math.cos(a), vy = p.speed! * Math.sin(a), g = p.gravity!;
      // Fixed world box sized for the defaults' extremes, so changing a slider visibly changes the arc.
      const worldW = Math.max(45, facts.range! * 1.08), worldH = Math.max(25, facts.maxHeight! * 1.15);
      const s = Math.min((W - 60) / worldW, (H - 70) / worldH);
      const X = (x: number) => 40 + x * s, Y = (y: number) => H - 40 - y * s;
      const tt = Math.min(t, facts.flightTime!);
      out.push(`<line x1="20" y1="${H - 40}" x2="${W - 10}" y2="${H - 40}" stroke="#57534e" stroke-width="2"/>`);
      for (let m = 0; m <= worldW; m += worldW > 120 ? 20 : 10) out.push(`<text x="${f1(X(m))}" y="${H - 20}" text-anchor="middle" font-size="11" fill="#a8a29e">${m} m</text>`);
      if (p.height! > 0) out.push(`<rect x="${f1(X(0) - 14)}" y="${f1(Y(p.height!))}" width="14" height="${f1(p.height! * s)}" fill="#e7e5e4" stroke="#a8a29e"/>`);
      // Full predicted path (faint) and the traced part.
      const path = (t1: number) => Array.from({ length: 61 }, (_, i) => { const ti = (t1 * i) / 60; return `${i ? 'L' : 'M'}${f1(X(vx * ti))} ${f1(Y(p.height! + vy * ti - 0.5 * g * ti * ti))}`; }).join('');
      out.push(`<path d="${path(facts.flightTime!)}" stroke="#93c5fd" stroke-width="1.5" stroke-dasharray="5 5" fill="none"/>`);
      out.push(`<path d="${path(tt)}" stroke="#2563eb" stroke-width="3" fill="none"/>`);
      const bx = X(vx * tt), by = Y(p.height! + vy * tt - 0.5 * g * tt * tt), cvy = vy - g * tt;
      // Velocity vector.
      const vs = 1.6;
      out.push(`<line x1="${f1(bx)}" y1="${f1(by)}" x2="${f1(bx + vx * vs)}" y2="${f1(by - cvy * vs)}" stroke="#ea580c" stroke-width="2.5" marker-end="url(#arrow-orange)"/>`);
      out.push(`<circle cx="${f1(bx)}" cy="${f1(by)}" r="9" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>`);
      out.push(readout([`t = ${fmt(tt)} s`, `range ${fmt(facts.range!, 1)} m`, `max height ${fmt(facts.maxHeight!, 1)} m`, `flight ${fmt(facts.flightTime!)} s`]));
      break;
    }
    case 'pendulum': {
      const { theta } = pendulumAngle(p, t);
      const px = W / 2 - 60, py = 40, len = Math.min(H - 90, 90 + p.length! * 80);
      const bx = px + len * Math.sin(theta), by = py + len * Math.cos(theta);
      out.push(`<line x1="${px - 80}" y1="${py}" x2="${px + 80}" y2="${py}" stroke="#57534e" stroke-width="4"/>`);
      const a0 = (p.angle! * Math.PI) / 180;
      out.push(`<path d="M${f1(px + len * Math.sin(-a0))} ${f1(py + len * Math.cos(a0))} A${len} ${len} 0 0 0 ${f1(px + len * Math.sin(a0))} ${f1(py + len * Math.cos(a0))}" stroke="#d6d3d1" stroke-width="1.5" stroke-dasharray="4 4" fill="none"/>`);
      out.push(`<line x1="${px}" y1="${py}" x2="${px}" y2="${py + len + 20}" stroke="#d6d3d1" stroke-width="1" stroke-dasharray="3 5"/>`);
      out.push(`<line x1="${px}" y1="${py}" x2="${f1(bx)}" y2="${f1(by)}" stroke="#1c1c1a" stroke-width="2.5"/>`);
      out.push(`<circle cx="${f1(bx)}" cy="${f1(by)}" r="18" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>`);
      out.push(readout([`t = ${fmt(t)} s`, `angle ${fmt((theta * 180) / Math.PI, 1)}°`, `period ≈ ${fmt(simFacts(kind, p).period!)} s`]));
      break;
    }
    case 'spring': {
      const x = springX(p, t);
      const wallX = 40, rest = W / 2 - 40, scale = 260, cy = H / 2 + 20;
      const mx = rest + x * scale;
      out.push(`<rect x="${wallX - 20}" y="${cy - 70}" width="20" height="140" fill="#e7e5e4" stroke="#a8a29e"/>`);
      out.push(`<line x1="${wallX}" y1="${cy + 40}" x2="${W - 20}" y2="${cy + 40}" stroke="#a8a29e" stroke-width="2"/>`);
      out.push(`<line x1="${rest}" y1="${cy - 60}" x2="${rest}" y2="${cy + 52}" stroke="#d6d3d1" stroke-dasharray="4 4"/><text x="${rest}" y="${cy + 70}" text-anchor="middle" font-size="12" fill="#a8a29e">rest</text>`);
      const coils = 12, sx = wallX, ex = mx - 40;
      const pts = Array.from({ length: coils * 2 + 1 }, (_, i) => `${f1(sx + ((ex - sx) * i) / (coils * 2))} ${i === 0 || i === coils * 2 ? cy : cy + (i % 2 ? -16 : 16)}`);
      out.push(`<polyline points="${pts.join(' ')}" stroke="#57534e" stroke-width="2.5" fill="none"/>`);
      out.push(`<rect x="${f1(mx - 40)}" y="${cy - 40}" width="80" height="80" rx="8" fill="#2563eb" stroke="#1e3a8a" stroke-width="2"/><text x="${f1(mx)}" y="${cy + 6}" text-anchor="middle" font-size="15" font-weight="700" fill="#ffffff">${fmt(p.mass!, 1)} kg</text>`);
      out.push(readout([`t = ${fmt(t)} s`, `x = ${fmt(x * 100, 1)} cm`, `period ${fmt(simFacts(kind, p).period!)} s`]));
      break;
    }
    case 'wave': {
      const k = (2 * Math.PI) / p.wavelength!, w = 2 * Math.PI * p.frequency!;
      const sX = (W - 40) / 8, sY = 90, cy = H / 2 + 10;
      const y1 = (x: number) => p.amplitude! * Math.sin(k * x - w * t);
      const y2 = (x: number) => p.amplitude2! * Math.sin(k * 1.5 * x + w * 1.3 * t);
      const line = (fn: (x: number) => number) => Array.from({ length: 241 }, (_, i) => { const x = (8 * i) / 240; return `${i ? 'L' : 'M'}${f1(20 + x * sX)} ${f1(cy - fn(x) * sY)}`; }).join('');
      out.push(`<line x1="20" y1="${cy}" x2="${W - 20}" y2="${cy}" stroke="#d6d3d1" stroke-dasharray="4 4"/>`);
      if (p.amplitude2! > 0) {
        out.push(`<path d="${line(y1)}" stroke="#93c5fd" stroke-width="1.5" fill="none"/><path d="${line(y2)}" stroke="#fdba74" stroke-width="1.5" fill="none"/>`);
        out.push(`<path d="${line((x) => y1(x) + y2(x))}" stroke="#9333ea" stroke-width="3" fill="none"/>`);
      } else out.push(`<path d="${line(y1)}" stroke="#2563eb" stroke-width="3" fill="none"/>`);
      // A marked particle bobbing in place (the medium doesn't travel; the wave does).
      out.push(`<circle cx="${f1(20 + 2 * sX)}" cy="${f1(cy - (y1(2) + (p.amplitude2! > 0 ? y2(2) : 0)) * sY)}" r="7" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>`);
      out.push(`<line x1="${f1(20 + 1 * sX)}" y1="${cy + sY + 30}" x2="${f1(20 + (1 + p.wavelength!) * sX)}" y2="${cy + sY + 30}" stroke="#16a34a" stroke-width="2" marker-start="url(#arrow-green)" marker-end="url(#arrow-green)"/><text x="${f1(20 + (1 + p.wavelength! / 2) * sX)}" y="${cy + sY + 22}" text-anchor="middle" font-size="13" fill="#16a34a">λ = ${fmt(p.wavelength!, 1)} m</text>`);
      out.push(readout([`t = ${fmt(t)} s`, `speed ${fmt(simFacts(kind, p).speed!)} m/s`, `period ${fmt(simFacts(kind, p).period!)} s`]));
      break;
    }
  }
  return out.join('');
}

/** How long one run lasts before it stops (projectile lands; others run a few periods). */
export function simDuration(kind: SimulationKind, p: Record<string, number>): number {
  const f = simFacts(kind, p);
  if (kind === 'projectile') return f.flightTime!;
  return Math.min(30, Math.max(6, (f.period ?? 2) * 4));
}
