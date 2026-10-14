import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
// Runs a full tutor session against a fake Realtime peer (no API key needed).
// Usage: pnpm dev (in another terminal), then pnpm --filter @ai-tutor/web e2e
const S = 'e2e-results';
mkdirSync(S, { recursive: true });
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));

// Fake Realtime peer: records client events, replies with scripted server events.
const REJECT_REQUIRED = !!process.env.REJECT_REQUIRED;
if (REJECT_REQUIRED) await p.addInitScript(() => { window.__rejectRequired = true; });
await p.addInitScript(() => {
  window.__sent = [];
  let responses = 0;
  class FakeChannel {
    readyState = 'connecting'; listeners = {};
    addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
    emit(t, data) { for (const fn of this.listeners[t] ?? []) fn(data); }
    server(ev) { setTimeout(() => this.emit('message', { data: JSON.stringify(ev) }), 5); }
    close() { this.readyState = 'closed'; }
    send(raw) {
      const ev = JSON.parse(raw);
      ev.__t = performance.now();
      window.__sent.push(ev);
      // A long reply in progress gets cancelled like the real API does.
      if (ev.type === 'response.cancel' && this.active) {
        this.active = false;
        this.server({ type: 'output_audio_buffer.cleared' });
        this.server({ type: 'response.done', response: { id: 'long', status: 'cancelled', output: [] } });
        return;
      }
      if (ev.type === 'conversation.item.create' && ev.item.content?.[0]?.text === 'LONG') this.nextLong = true;
      if (ev.type === 'conversation.item.create' && ev.item.content?.[0]?.text === 'WAIT') this.nextWait = true;
      if (ev.type === 'conversation.item.create' && ev.item.content?.[0]?.text === 'SHOW') this.nextShow = true;
      if (ev.type !== 'response.create') return;
      if (ev.response?.tool_choice === 'required' && window.__rejectRequired) {
        // Simulates an API that doesn't accept a forced tool on response.create.
        this.server({ type: 'error', error: { type: 'invalid_request_error', message: "Invalid value for 'response.tool_choice'", param: 'response.tool_choice' } });
        return;
      }
      const n = ++responses;
      const rid = 'resp' + n, item = 'item' + n;
      if (this.nextLong) {
        // Starts speaking and keeps going until cancelled.
        this.nextLong = false;
        this.active = true;
        this.server({ type: 'response.created', response: { id: 'long' } });
        this.server({ type: 'output_audio_buffer.started' });
        this.server({ type: 'response.output_audio_transcript.delta', item_id: 'long', delta: 'This is a long explanation…' });
        return;
      }
      if (this.nextShow) {
        this.nextShow = false;
        this.server({ type: 'response.function_call_arguments.done', call_id: 'call5', name: 'draw_geometry', arguments: JSON.stringify({ points: [{ name: 'A', x: 0, y: 0 }, { name: 'B', x: 5, y: 0 }, { name: 'C', x: 1, y: 3 }], polygons: ['ABC'], angles: [{ at: 'B', from: 'A', to: 'C', label: 'θ' }], placement: 'new section' }) });
        this.server({ type: 'response.function_call_arguments.done', call_id: 'call6', name: 'show_stroke_order', arguments: JSON.stringify({ text: '二', reveal: 1, placement: 'new section' }) });
        this.server({ type: 'response.done', response: { id: rid, output: [] } });
        return;
      }
      if (this.nextWait) {
        // The tutor finishes and hands the turn to the student.
        this.nextWait = false;
        this.server({ type: 'response.output_audio_transcript.done', item_id: item, transcript: 'That is how it works.' });
        this.server({ type: 'response.function_call_arguments.done', call_id: 'wait' + n, name: 'wait_for_student', arguments: '{}' });
        this.server({ type: 'response.done', response: { id: rid, output: [] } });
        return;
      }
      if (n === 1) {
        // Voice keeps playing for 1.5 s after the response is generated.
        this.server({ type: 'response.created', response: { id: rid } });
        this.server({ type: 'output_audio_buffer.started' });
        setTimeout(() => { window.__stoppedAt = performance.now(); this.emit('message', { data: JSON.stringify({ type: 'output_audio_buffer.stopped' }) }); }, 1500);
        this.server({ type: 'response.output_audio_transcript.delta', item_id: item, delta: 'Hi! What would you like ' });
        this.server({ type: 'response.output_audio_transcript.delta', item_id: item, delta: 'to learn today?' });
        this.server({ type: 'response.output_audio_transcript.done', item_id: item, transcript: 'Hi! What would you like to learn today? Let me write an example.' });
        this.server({ type: 'response.function_call_arguments.done', call_id: 'call1', name: 'write_math', arguments: JSON.stringify({ latex: '3x + 2 = 14' }) });
        this.server({ type: 'response.function_call_arguments.done', call_id: 'call2', name: 'ask_question', arguments: JSON.stringify({ kind: 'write', question: 'Solve for x', placement: 'right of #1' }) });
        this.server({ type: 'response.function_call_arguments.done', call_id: 'call4', name: 'draw_sketch', arguments: JSON.stringify({ svg: '<svg viewBox="0 0 200 100"><script>window.__pwned=1</script><circle id="coil" cx="50" cy="50" r="30" onclick="window.__pwned=1"/><line id="wire" x1="80" y1="50" x2="190" y2="50" marker-end="url(#arrow)"/></svg>', placement: 'new section' }) });
        this.server({ type: 'response.function_call_arguments.done', call_id: 'call3', name: 'ask_question', arguments: JSON.stringify({ kind: 'choice', question: 'What is 2 + 2?', choices: ['3', '4', '5'], placement: 'right of #3' }) });
        this.server({ type: 'response.done', response: { id: rid, output: [{ type: 'function_call', call_id: 'call1', name: 'write_math', arguments: '{}' }], usage: { input_token_details: { audio_tokens: 100, text_tokens: 50 }, output_token_details: { audio_tokens: 300, text_tokens: 20 } } } });
      } else {
        this.server({ type: 'response.output_audio_transcript.done', item_id: item, transcript: 'Reply ' + n });
        this.server({ type: 'response.done', response: { id: rid, output: [], usage: { input_token_details: { audio_tokens: 10 }, output_token_details: { audio_tokens: 30 } } } });
      }
    }
  }
  window.RTCPeerConnection = class {
    ontrack = null;
    createDataChannel() { return (this.dc = new FakeChannel()); }
    connectionState = 'new';
    addEventListener() {}
    addTrack() {} addTransceiver() {}
    async createOffer() { return { type: 'offer', sdp: 'fake-offer' }; }
    async setLocalDescription() {}
    async setRemoteDescription() { setTimeout(() => { this.dc.readyState = 'open'; this.dc.emit('open'); }, 10); }
    close() {}
  };
});
await p.route('**/api/realtime/session', (r) => r.fulfill({ json: { value: 'ek_test', expires_at: 0 } }));
await p.route('https://api.openai.com/v1/realtime/calls', (r) => r.fulfill({ body: 'fake-answer', contentType: 'application/sdp' }));
await p.route('**/api/recognize', (r) => r.fulfill({ json: { text: '3x = 12', ms: 300 } }));
await p.route('**/api/strokes/**', (r) => r.fulfill({ json: { credit: 'Stroke order data: KanjiVG (CC BY-SA 3.0)', chars: [{ char: '二', strokes: [{ d: 'M28 30c3 0 6 0 9 0', type: '㇐' }, { d: 'M14 79c4 1 8 1 12 0', type: '㇐' }], numbers: [{ x: 22, y: 30 }, { x: 8, y: 79 }] }] } }));

await p.goto(BASE + '/');
await p.getByRole('button', { name: 'Start session' }).click();
await p.getByText('Listening').waitFor();
await p.getByText('Let me write an example.').waitFor();
await p.waitForTimeout(300);

// Student writes "3x = 12"-ish strokes with the pen (mouse), below the AI's equation.
const stroke = async (pts) => { await p.mouse.move(...pts[0]); await p.mouse.down(); for (const q of pts.slice(1)) await p.mouse.move(...q, { steps: 4 }); await p.mouse.up(); };
await stroke([[80, 200], [95, 190], [100, 205], [90, 212], [100, 220], [80, 230]]);
await stroke([[115, 200], [135, 230]]); await stroke([[135, 200], [115, 230]]);
await stroke([[150, 210], [175, 210]]); await stroke([[150, 220], [175, 220]]);
await stroke([[190, 198], [190, 232]]); await stroke([[200, 200], [215, 198], [218, 210], [200, 232], [222, 232]]);
await p.waitForTimeout(2200); // pen idle -> grouped event -> recognition -> context

// Answer the "write" question: write inside the answer box, then press Done.
const done = await p.locator('[data-done]').boundingBox();
const ax = done.x - 200, ay = done.y - 70;
await stroke([[ax, ay], [ax + 10, ay - 12], [ax + 14, ay + 10], [ax + 2, ay + 24]]);
await stroke([[ax + 30, ay + 6], [ax + 50, ay + 6]]); await stroke([[ax + 30, ay + 14], [ax + 50, ay + 14]]);
await stroke([[ax + 64, ay - 10], [ax + 78, ay - 10], [ax + 70, ay + 4], [ax + 80, ay + 16], [ax + 64, ay + 24]]);
await p.locator('[data-done]').click();
await p.waitForTimeout(800);
// Answer the multiple-choice question.
await p.getByRole('button', { name: /^B\s*4$/ }).click();
await p.waitForTimeout(500);

// Interruptions: a long reply in progress is cancelled by typing, and by the Pause button.
await p.getByPlaceholder('Type a message…').fill('LONG');
await p.keyboard.press('Enter');
await p.waitForTimeout(200);
await p.getByPlaceholder('Type a message…').fill('wait, why?');
await p.keyboard.press('Enter');
await p.waitForTimeout(300);
await p.getByPlaceholder('Type a message…').fill('LONG');
await p.keyboard.press('Enter');
await p.waitForTimeout(200);
await p.getByRole('button', { name: 'Pause' }).click();
await p.waitForTimeout(200);
const pausedLabel = await p.locator('.chat-status').textContent();
await p.getByRole('button', { name: 'Continue' }).click();
await p.waitForTimeout(300);

// wait_for_student: no automatic follow-up afterwards.
const beforeWait = await p.evaluate(() => window.__sent.length);
await p.getByPlaceholder('Type a message…').fill('WAIT');
await p.keyboard.press('Enter');
await p.waitForTimeout(1500);
const afterWait = await p.evaluate((n) => window.__sent.slice(n).map((e) => e.type), beforeWait);

await p.getByPlaceholder('Type a message…').fill('Is that right?');
await p.keyboard.press('Enter');
await p.waitForTimeout(300);
await p.getByRole('button', { name: 'Check my work' }).click();
await p.waitForTimeout(500);
await p.screenshot({ path: S + '/3-e2e.png' });

await p.getByPlaceholder('Type a message…').fill('SHOW');
await p.keyboard.press('Enter');
await p.waitForTimeout(1500);
const sent = await p.evaluate(() => window.__sent);
const window_stoppedAt = await p.evaluate(() => window.__stoppedAt);
const texts = sent.filter((e) => e.type === 'conversation.item.create').map((e) => e.item.type === 'message' ? e.item.content.map((c) => c.text ?? '[image]').join(' ') : 'TOOL_OUTPUT ' + e.item.output);
let failed = 0;
const check = (name, ok) => { if (!ok) failed++; console.log((ok ? 'PASS ' : 'FAIL ') + name); };
check('session.update sends tools + instructions', sent[0]?.type === 'session.update' && sent[0].session.tools.length >= 12 && sent[0].session.instructions.includes('tutor'));
check('initial board summary sent on connect', texts[0]?.startsWith('[Board] Current board state.'));
check('tutor greets first (response.create after connect)', sent[2]?.type === 'response.create');
check('tool output returned for write_math', texts.some((t) => t.startsWith('TOOL_OUTPUT') && t.includes('"ok":true')));
check('one follow-up response.create after tool output', sent.filter((e) => e.type === 'response.create').length >= 2);
check('handwriting event with recognized text', texts.some((t) => t.includes('[Board] Student wrote by hand') && t.includes('"3x = 12"') && t.includes('near #')));
check('session.update includes the new board tools', ['write_steps', 'draw_diagram', 'make_table', 'plot', 'ask_question'].every((n) => sent[0].session.tools.some((t) => t.name === n)));
check('answer box submitted with handwriting, AI asked to respond', (() => { const i = sent.findIndex((e) => e.type === 'conversation.item.create' && e.item.content?.[0]?.text?.startsWith('[Answer] The student submitted their answer')); return i > 0 && sent[i].item.content[0].text.includes('handwriting') && sent[i + 1]?.type === 'response.create'; })());
check('choice pick sent, AI asked to respond', (() => { const i = sent.findIndex((e) => e.type === 'conversation.item.create' && e.item.content?.[0]?.text?.includes('the student picked B) 4')); return i > 0 && sent[i + 1]?.type === 'response.create'; })());
check('handwriting inside the box is reported as such', texts.some((t) => t.includes('inside answer box #3')));
check('board nudge after two voice-only replies', texts.some((t) => t.startsWith('[Coach]')));
check('next step waits until the voice has finished', (() => {
  const creates = sent.filter((e) => e.type === 'response.create');
  return creates.length >= 2 && creates[1].__t >= (window_stoppedAt ?? Infinity);
})());
check('typing during a reply cancels it first', (() => {
  const i = sent.findIndex((e) => e.type === 'conversation.item.create' && e.item.content?.[0]?.text === 'wait, why?');
  return i > 0 && sent.slice(0, i).some((e, k) => e.type === 'response.cancel' && k > sent.findIndex((x) => x.item?.content?.[0]?.text === 'LONG'));
})());
check('pause stops the reply and shows Paused', pausedLabel?.includes('Paused'));
check('continue asks the tutor to go on', texts.some((t) => t.startsWith('[Student] Please continue')));
const beforeStudent = (() => {
  const firstStudent = sent.findIndex((e) => e.type === 'conversation.item.create' && e.item.content?.[0]?.text?.startsWith('[Board] Student'));
  return sent.slice(0, firstStudent === -1 ? undefined : firstStudent);
})();
if (REJECT_REQUIRED) check('falls back to a normal reply when forced tools are rejected', (() => {
  const i = beforeStudent.findIndex((e) => e.response?.tool_choice === 'required');
  return i > 0 && beforeStudent.slice(i + 1).some((e) => e.type === 'response.create' && !e.response);
})());
else check('after talk-only replies the next step must use the board, then the student gets the turn', (() => {
  // greeting+tools -> resp2 (talk) -> forced resp3 (talk) -> forced resp4 (talk) -> stop
  const creates = beforeStudent.filter((e) => e.type === 'response.create');
  return creates.length === 4 && creates.slice(2).every((e) => e.response?.tool_choice === 'required') && !creates[1].response;
})());
check('coach notes use the system role', beforeStudent.some((e) => e.type === 'conversation.item.create' && e.item.role === 'system' && e.item.content[0].text.startsWith('[Coach]')));
check('sketch rendered, sanitized and namespaced', await p.evaluate(() => {
  const svg = document.querySelector('.board-sketch svg');
  return !!svg && !svg.querySelector('script') && !svg.querySelector('[onclick]') && !window.__pwned && !!svg.querySelector('[data-k="coil"]') && /url\(#sk[a-z0-9]+-arrow\)/.test(svg.innerHTML);
}));
check('wait_for_student stops the flow', afterWait.filter((t) => t === 'response.create').length === 1);
check('session.update includes structure tools', ['draw_structure', 'structure_op', 'update_item', 'wait_for_student'].every((n) => sent[0].session.tools.some((t) => t.name === n)));
check('geometry figure drawn with a computed angle mark', await p.evaluate(() => !!document.querySelector('.board-sketch [data-k="angle-B"]') && !!document.querySelector('.board-sketch [data-k="angle-label-B"]')));
check('stroke order shows real strokes, revealed gradually, with credit', await p.evaluate(() => {
  const el = [...document.querySelectorAll('.board-sketch')].find((n) => n.textContent.includes('KanjiVG'));
  return !!el && !!el.querySelector('[data-k="c0s1"]') && !el.querySelector('[data-k="c0s2"]');
}));
check('stroke order result lists stroke types for narration', texts.some((t) => t.startsWith('TOOL_OUTPUT') && t.includes('二 stroke 1: horizontal')));
check('typed message sent', texts.some((t) => t === 'Is that right?'));
check('check my work sent with summary', texts.some((t) => t.startsWith('[Check my work]') && t.includes('handwriting "3x = 12"') && t.includes('ai math "3x + 2 = 14"')));
check('math rendered on board', (await p.locator('.board-math').count()) === 1);
check('no page errors', errors.length === 0);
console.log(texts.map((t) => '  > ' + t.slice(0, 160).replace(/\n/g, ' | ')).join('\n'));
if (errors.length) console.log(errors);
await b.close();
process.exit(failed ? 1 : 0);
