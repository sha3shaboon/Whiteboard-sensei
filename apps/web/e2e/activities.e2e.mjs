// Activities end to end against the dev server with ?demo: label by dragging, order by dragging, click a country.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'e2e-results';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto('http://localhost:5173/?demo');
await p.waitForFunction(() => window.__tutor);
const run = (name, args) => p.evaluate(([n, a]) => window.__tutor.run(n, a), [name, args]);
const focus = (id) => p.evaluate((id) => { const t = window.__tutor; t.view.ensureVisible(t.board.get(id.replace('#', '')).bounds, 60); }, id);
const state = (id) => p.evaluate((id) => { const e = window.__tutor.board.get(id.replace('#', '')); return `${e.content.status}:${e.content.attempts}:${e.content.feedback ?? ''}`; }, id);
const drag = async (from, to) => {
  const a = await from.boundingBox(), c = await to.boundingBox();
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await p.mouse.down();
  await p.mouse.move(a.x + a.width / 2 + 15, a.y + a.height / 2 + 10, { steps: 3 });
  await p.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 10 }); await p.mouse.up();
  await p.waitForTimeout(200);
};
// A labeled cell sketch, then a label activity on its parts.
const cell = await run('draw_sketch', { svg: '<svg viewBox="0 0 400 260"><ellipse id="membrane" cx="200" cy="130" rx="180" ry="110" fill="#dcfce7" stroke="#16a34a"/><circle id="nucleus" cx="170" cy="120" r="44" fill="#e9d5ff" stroke="#7c3aed"/><ellipse id="mitochondrion" cx="300" cy="170" rx="34" ry="16" fill="#fed7aa" stroke="#ea580c"/></svg>', title: 'Animal cell', placement: 'new section' });
const lab = await run('ask_activity', { kind: 'label', prompt: 'Label the cell.', sketch_id: cell.id, targets: [{ part: 'nucleus', label: 'Nucleus' }, { part: 'mitochondrion', label: 'Mitochondrion' }, { part: 'membrane', label: 'Cell membrane' }], extra: ['Chloroplast'] });
console.log('label', lab.ok, lab.error ?? '');
await focus(lab.id); await p.waitForTimeout(500);
const L = p.locator(`[data-id="${lab.id.slice(1)}"]`);
for (const [word, part] of [['Nucleus', 'nucleus'], ['Mitochondrion', 'mitochondrion'], ['Cell membrane', 'membrane']]) {
  await drag(L.locator(`.act-bank .act-chip[data-v="${word}"]`), L.locator(`[data-zone="${part}"]`));
}
await L.locator('[data-act="check"]').click();
await p.waitForTimeout(500);
const labelState = await state(lab.id);
console.log('label state', labelState);
await L.screenshot({ path: `${OUT}/label.png` });
// Order by dragging.
const ord = await run('ask_activity', { kind: 'order', prompt: 'Smallest to largest', items: ['1/8', '1/4', '1/2', '1'], placement: 'new section' });
await focus(ord.id); await p.waitForTimeout(400);
const O = p.locator(`[data-id="${ord.id.slice(1)}"]`);
for (let pass = 0; pass < 4; pass++) {
  const cur = await p.evaluate((id) => [...document.querySelectorAll(`[data-id="${id}"] .act-order .act-chip`)].map((c) => c.dataset.v), ord.id.slice(1));
  const want = ['1/8', '1/4', '1/2', '1'];
  const i = cur.findIndex((v, k) => v !== want[k]);
  if (i < 0) break;
  const j = cur.indexOf(want[i]);
  await drag(O.locator(`.act-chip[data-i="${j}"]`), O.locator(`.act-chip[data-i="${i}"]`));
}
await O.locator('[data-act="check"]').click();
await p.waitForTimeout(400);
const orderState = await state(ord.id);
console.log('order state', orderState);
// Map click on Kenya.
const mc = await run('ask_activity', { kind: 'map_click', prompt: 'Find Kenya', answers: ['Kenya'], focus: ['Kenya', 'Tanzania', 'Ethiopia'], placement: 'new section' });
await focus(mc.id); await p.waitForTimeout(600);
const M = p.locator(`[data-id="${mc.id.slice(1)}"]`);
await M.locator('[data-k="c-kenya"]').dispatchEvent('pointerdown');
await p.waitForTimeout(200);
await M.locator('[data-act="check"]').click();
await p.waitForTimeout(500);
const mapState = await state(mc.id);
console.log('map state', mapState);
await M.screenshot({ path: `${OUT}/mapclick-correct.png` });
console.log('errors', errors);
await b.close();
const ok = [labelState, orderState, mapState].every((s) => s.startsWith('correct:1')) && !errors.length;
console.log(ok ? 'PASS activities' : 'FAIL activities');
process.exit(ok ? 0 : 1);
