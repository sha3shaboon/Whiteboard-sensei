// Stage 0 spike: does pressure-sensitive pen input work well enough in the browser (esp. iPad Safari + Apple Pencil)?
// Also exports handwriting samples (PNG + expected LaTeX) for the handwriting-recognition benchmark.

interface Pt { x: number; y: number; p: number }

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const statsEl = document.getElementById('stats')!;
const palmEl = document.getElementById('palm') as HTMLInputElement;
const countEl = document.getElementById('count')!;

const strokes: Pt[][] = [];
let current: Pt[] | null = null;
let activePointer: number | null = null;
let lastPenTime = 0;

// Stats for the current stroke
let eventCount = 0;
let sampleCount = 0;
let strokeStart = 0;
let lastEvent: PointerEvent | null = null;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redraw();
}

function widthFor(p: number) {
  return 1 + p * 4;
}

function drawSegment(a: Pt, b: Pt) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1c1c1a';
  ctx.lineWidth = widthFor((a.p + b.p) / 2);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function redraw() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  for (const s of strokes) for (let i = 1; i < s.length; i++) drawSegment(s[i - 1]!, s[i]!);
}

function toPt(e: PointerEvent): Pt {
  const rect = canvas.getBoundingClientRect();
  // Mouse reports 0.5 while pressed; pens report real pressure.
  return { x: e.clientX - rect.left, y: e.clientY - rect.top, p: e.pressure || 0.5 };
}

function shouldIgnore(e: PointerEvent) {
  if (!palmEl.checked) return false;
  // Ignore touches while a pen was used in the last 2 s (palm resting on the screen).
  return e.pointerType === 'touch' && performance.now() - lastPenTime < 2000;
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'pen') lastPenTime = performance.now();
  if (activePointer !== null || shouldIgnore(e)) return;
  activePointer = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  current = [toPt(e)];
  strokes.push(current);
  eventCount = 1;
  sampleCount = 1;
  strokeStart = performance.now();
  lastEvent = e;
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'pen') lastPenTime = performance.now();
  if (e.pointerId !== activePointer || !current) return;
  // Coalesced events give the full-rate samples between animation frames (Apple Pencil: up to 240 Hz).
  const coalesced = e.getCoalescedEvents?.() ?? [];
  const samples = coalesced.length ? coalesced : [e];
  eventCount++;
  for (const s of samples) {
    const pt = toPt(s);
    drawSegment(current[current.length - 1]!, pt);
    current.push(pt);
    sampleCount++;
  }
  lastEvent = e;
  renderStats();
});

function endStroke(e: PointerEvent) {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  current = null;
  renderStats();
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

function renderStats() {
  if (!lastEvent) return;
  const secs = Math.max((performance.now() - strokeStart) / 1000, 0.001);
  statsEl.textContent = [
    `pointerType: ${lastEvent.pointerType}   pressure: ${lastEvent.pressure.toFixed(3)}   tiltX/Y: ${lastEvent.tiltX}/${lastEvent.tiltY}`,
    `samples/s: ${(sampleCount / secs).toFixed(0)}   move events/s: ${(eventCount / secs).toFixed(0)}   samples per event: ${(sampleCount / eventCount).toFixed(1)}`,
    `coalesced events supported: ${'getCoalescedEvents' in PointerEvent.prototype}   strokes: ${strokes.length}`,
  ].join('\n');
}

// --- Sample export for the handwriting benchmark ---

const labels: { file: string; latex: string }[] = [];

function bbox() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) for (const p of s) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function download(name: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

document.getElementById('save')!.addEventListener('click', () => {
  if (!strokes.length) return;
  const latex = prompt('Expected LaTeX for what you wrote (e.g. 2x+4=10):');
  if (latex === null) return;
  const { minX, minY, maxX, maxY } = bbox();
  const pad = 16;
  const out = document.createElement('canvas');
  out.width = Math.ceil(maxX - minX + pad * 2);
  out.height = Math.ceil(maxY - minY + pad * 2);
  const o = out.getContext('2d')!;
  o.fillStyle = '#fff';
  o.fillRect(0, 0, out.width, out.height);
  o.translate(pad - minX, pad - minY);
  o.lineCap = 'round';
  o.strokeStyle = '#000';
  for (const s of strokes) for (let i = 1; i < s.length; i++) {
    o.lineWidth = widthFor((s[i - 1]!.p + s[i]!.p) / 2);
    o.beginPath(); o.moveTo(s[i - 1]!.x, s[i - 1]!.y); o.lineTo(s[i]!.x, s[i]!.y); o.stroke();
  }
  const file = `sample-${String(labels.length + 1).padStart(3, '0')}.png`;
  download(file, out.toDataURL('image/png'));
  labels.push({ file, latex });
  countEl.textContent = `${labels.length} sample(s) saved`;
  strokes.length = 0;
  redraw();
});

document.getElementById('labels')!.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(labels, null, 2)], { type: 'application/json' });
  download('labels.json', URL.createObjectURL(blob));
});

document.getElementById('clear')!.addEventListener('click', () => {
  strokes.length = 0;
  redraw();
});

window.addEventListener('resize', resize);
resize();
