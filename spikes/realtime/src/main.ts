// Stage 0 spike: is the Realtime API fast and natural enough, and do tool calls + typed input work in one session?
// Measures: time from end of student speech to first AI audio, per-response token usage (for cost per minute).
// Flow per developers.openai.com/api/docs/guides/realtime-webrtc: backend mints a client secret,
// browser POSTs its SDP offer to /v1/realtime/calls, events flow over the "oai-events" data channel.

type ServerEvent = { type: string; [key: string]: any };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const logEl = $<HTMLDivElement>('log');
const metricsEl = $<HTMLDivElement>('metrics');
const boardEl = $<HTMLDivElement>('board');
const textEl = $<HTMLInputElement>('text');

let pc: RTCPeerConnection | null = null;
let dc: RTCDataChannel | null = null;
let mic: MediaStream | null = null;
let sessionStart = 0;

// Latency: speech_stopped -> output_audio_buffer.started (first AI audio playing)
let speechStoppedAt: number | null = null;
const latencies: number[] = [];

// Usage totals from response.done
const usage = { audioIn: 0, audioOut: 0, textIn: 0, textOut: 0, cachedIn: 0 };

const INSTRUCTIONS = `You are a friendly tutor. Speak naturally and briefly.
When you write an equation or formula for the student, call write_math with the LaTeX while you explain it.`;

const TOOLS = [
  {
    type: 'function',
    name: 'write_math',
    description: 'Write a math expression on the shared whiteboard.',
    parameters: {
      type: 'object',
      properties: {
        latex: { type: 'string', description: 'LaTeX for the expression' },
        placement: { type: 'string', description: 'Where to place it, e.g. "new section" or "below #3"' },
      },
      required: ['latex'],
    },
  },
];

function log(msg: string) {
  const t = ((performance.now() - sessionStart) / 1000).toFixed(2).padStart(7);
  const line = document.createElement('div');
  line.textContent = `${t}s  ${msg}`;
  logEl.append(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function median(xs: number[]) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function renderMetrics() {
  const minutes = (performance.now() - sessionStart) / 60000;
  metricsEl.textContent = [
    `session: ${minutes.toFixed(1)} min`,
    `latency (speech end -> AI audio): last ${latencies.at(-1)?.toFixed(0) ?? '-'} ms, median ${median(latencies).toFixed(0)} ms, n=${latencies.length}`,
    `tokens: audio in ${usage.audioIn}, audio out ${usage.audioOut}, text in ${usage.textIn}, text out ${usage.textOut}, cached in ${usage.cachedIn}`,
    `audio tokens per session-minute: in ${(usage.audioIn / Math.max(minutes, 0.01)).toFixed(0)}, out ${(usage.audioOut / Math.max(minutes, 0.01)).toFixed(0)}`,
    `-> multiply by current per-token prices to get cost per minute (prices change; check the pricing page)`,
  ].join('\n');
}

function send(event: object) {
  dc?.send(JSON.stringify(event));
}

function handle(ev: ServerEvent) {
  switch (ev.type) {
    case 'input_audio_buffer.speech_stopped':
      speechStoppedAt = performance.now();
      break;
    case 'output_audio_buffer.started':
      if (speechStoppedAt !== null) {
        latencies.push(performance.now() - speechStoppedAt);
        speechStoppedAt = null;
      }
      break;
    case 'response.function_call_arguments.done': {
      const args = JSON.parse(ev.arguments ?? '{}');
      const item = document.createElement('div');
      item.textContent = `write_math: ${args.latex}${args.placement ? `  (${args.placement})` : ''}`;
      if (boardEl.querySelector('em')) boardEl.innerHTML = '';
      boardEl.append(item);
      // Return the tool result, then let the model continue speaking.
      send({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: ev.call_id, output: JSON.stringify({ ok: true, elementId: `#${boardEl.children.length}` }) },
      });
      send({ type: 'response.create' });
      break;
    }
    case 'response.done': {
      const u = ev.response?.usage;
      if (u) {
        usage.audioIn += u.input_token_details?.audio_tokens ?? 0;
        usage.textIn += u.input_token_details?.text_tokens ?? 0;
        usage.cachedIn += u.input_token_details?.cached_tokens ?? 0;
        usage.audioOut += u.output_token_details?.audio_tokens ?? 0;
        usage.textOut += u.output_token_details?.text_tokens ?? 0;
      }
      break;
    }
    case 'error':
      log(`ERROR ${JSON.stringify(ev.error)}`);
      break;
  }
  if (!ev.type.endsWith('.delta')) log(ev.type);
  renderMetrics();
}

async function connect() {
  $<HTMLButtonElement>('connect').disabled = true;
  sessionStart = performance.now();
  try {
    const tokenRes = await fetch('/api/realtime/session', { method: 'POST' });
    if (!tokenRes.ok) throw new Error(`token: ${tokenRes.status} ${await tokenRes.text()}`);
    const { value: ephemeralKey } = await tokenRes.json();

    pc = new RTCPeerConnection();
    const audio = new Audio();
    audio.autoplay = true;
    pc.ontrack = (e) => (audio.srcObject = e.streams[0]!);

    mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    pc.addTrack(mic.getTracks()[0]!, mic);

    dc = pc.createDataChannel('oai-events');
    dc.addEventListener('message', (e) => handle(JSON.parse(e.data)));
    dc.addEventListener('open', () => {
      send({ type: 'session.update', session: { type: 'realtime', instructions: INSTRUCTIONS, tools: TOOLS } });
      textEl.disabled = false;
      $<HTMLButtonElement>('send').disabled = false;
      $<HTMLButtonElement>('disconnect').disabled = false;
      log('connected');
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdpRes = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      body: offer.sdp,
      headers: { Authorization: `Bearer ${ephemeralKey}`, 'Content-Type': 'application/sdp' },
    });
    if (!sdpRes.ok) throw new Error(`sdp: ${sdpRes.status} ${await sdpRes.text()}`);
    await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() });
  } catch (err) {
    log(`connect failed: ${(err as Error).message}`);
    disconnect();
  }
}

function disconnect() {
  dc?.close();
  pc?.close();
  mic?.getTracks().forEach((t) => t.stop());
  dc = null;
  pc = null;
  mic = null;
  $<HTMLButtonElement>('connect').disabled = false;
  $<HTMLButtonElement>('disconnect').disabled = true;
  $<HTMLButtonElement>('send').disabled = true;
  textEl.disabled = true;
}

function sendText() {
  const text = textEl.value.trim();
  if (!text) return;
  send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
  send({ type: 'response.create' });
  textEl.value = '';
}

$('connect').addEventListener('click', connect);
$('disconnect').addEventListener('click', disconnect);
$('send').addEventListener('click', sendText);
textEl.addEventListener('keydown', (e) => e.key === 'Enter' && sendText());
