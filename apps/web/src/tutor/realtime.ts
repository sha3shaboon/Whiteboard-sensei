// Thin adapter over the OpenAI Realtime API (WebRTC). The rest of the app talks to this class only,
// so the provider can be swapped later. Voice, typed chat and board context share one session.

import { apiFetch } from '../api';

export type Status = 'idle' | 'connecting' | 'connected' | 'error';

export interface ToolDefinition {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface Usage {
  audioIn: number;
  audioOut: number;
  textIn: number;
  textOut: number;
  cachedIn: number;
}

export interface RealtimeHandlers {
  onStatus(status: Status, detail?: string): void;
  /** A transcript line: created empty, then filled by deltas, then marked final. */
  onTranscript(id: string, role: 'user' | 'assistant', text: string, final: boolean): void;
  onToolCall(name: string, args: Record<string, unknown>): Promise<unknown> | unknown;
  onUsage(usage: Usage): void;
  onSpeaking?(speaking: boolean): void;
  /** After each AI response that wasn't interrupted: whether it called any tools. */
  onResponseDone?(usedTools: boolean): void;
  onPaused?(paused: boolean): void;
}

type ServerEvent = { type: string; [key: string]: any };

class AccessCodeError extends Error {}

const CONNECT_TIMEOUT_MS = 20_000;
const LINK_FAILED =
  "Couldn't open the audio connection to the tutor. Your network may block voice calls (WebRTC); try another network or turn off a VPN.";

/** Sends the WebRTC offer; retries OpenAI's occasional 5xx errors up to twice. */
async function postOffer(key: string, sdp: string): Promise<Response> {
  let res!: Response;
  for (const delay of [0, 600, 1800]) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    res = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      body: sdp,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/sdp' },
    });
    if (res.status < 500) return res;
    console.warn(`Realtime connect returned ${res.status}, retrying`);
  }
  return res;
}

/** Turns an OpenAI error response into a message a student (or the site owner) can act on. */
async function describeOpenAIError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; type?: string; message?: string } } | null;
  const e = body?.error;
  if (e?.type === 'insufficient_quota' || e?.code === 'credit_balance_exhausted') {
    return "The tutor is unavailable: this site's OpenAI account is out of credits. (Site owner: add credits in the OpenAI billing settings.)";
  }
  if (res.status === 401) return "The tutor is unavailable: the voice session key was rejected. Try again; if it keeps failing, the site's OpenAI key needs checking.";
  if (res.status === 429) return 'The tutor is busy right now (rate limited). Please try again in a minute.';
  if (res.status >= 500) return 'OpenAI\'s voice service had a temporary problem. Please press Start again in a moment.';
  return `Couldn't connect to the voice tutor (${res.status})${e?.message ? `: ${e.message}` : ''}`;
}

export class RealtimeClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audio: HTMLAudioElement | null = null;
  private transcripts = new Map<string, string>();
  private handledCalls = new Set<string>();
  private pendingToolOutputs = false;
  // Pacing: the AI teaches one step per response. After a step that used the board, we hand it the
  // turn again only once its voice has finished playing, so the board never runs ahead of the narration.
  private responseActive = false;
  private speaking = false;
  private userSpeaking = false;
  private continuePending = false;
  private paused = false;
  private continueTimer: ReturnType<typeof setTimeout> | undefined;
  private usage: Usage = { audioIn: 0, audioOut: 0, textIn: 0, textOut: 0, cachedIn: 0 };
  private localId = 0;

  constructor(private h: RealtimeHandlers) {}

  get connected(): boolean {
    return this.dc?.readyState === 'open';
  }

  async connect(opts: { instructions: string; tools: ToolDefinition[]; onOpen?: () => void }): Promise<void> {
    this.h.onStatus('connecting');
    try {
      const tokenRes = await apiFetch('/api/realtime/session', { method: 'POST' });
      if (tokenRes.status === 401) throw new AccessCodeError();
      if (!tokenRes.ok) throw new Error((await tokenRes.json().catch(() => null))?.error ?? `Server error ${tokenRes.status}`);
      const { value: key } = (await tokenRes.json()) as { value: string };

      const pc = (this.pc = new RTCPeerConnection());
      this.audio = new Audio();
      this.audio.autoplay = true;
      pc.ontrack = (e) => {
        if (this.audio) this.audio.srcObject = e.streams[0] ?? null;
      };

      try {
        this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        pc.addTrack(this.mic.getAudioTracks()[0]!, this.mic);
      } catch {
        // No mic (denied or unavailable): still receive the AI's voice; the student types.
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }

      const dc = (this.dc = pc.createDataChannel('oai-events'));
      dc.addEventListener('message', (e) => this.handle(JSON.parse(e.data)));
      // If the audio link never opens (e.g. a network that blocks WebRTC), fail clearly instead of spinning forever.
      const openTimer = setTimeout(() => this.fail(dc, LINK_FAILED), CONNECT_TIMEOUT_MS);
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'failed') this.fail(dc, LINK_FAILED);
      });
      dc.addEventListener('open', () => {
        clearTimeout(openTimer);
        this.send({ type: 'session.update', session: { type: 'realtime', instructions: opts.instructions, tools: opts.tools, tool_choice: 'auto' } });
        this.h.onStatus('connected', this.mic ? undefined : 'Microphone unavailable: type to talk');
        opts.onOpen?.();
      });
      // Only report a drop of the live channel, not the close we trigger ourselves in disconnect().
      dc.addEventListener('close', () => {
        clearTimeout(openTimer);
        if (this.dc === dc) this.disconnect();
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpRes = await postOffer(key, offer.sdp ?? '');
      if (!sdpRes.ok) throw new Error(await describeOpenAIError(sdpRes));
      if (this.dc !== dc) return; // disconnected while waiting
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() });
    } catch (err) {
      this.teardown();
      this.h.onStatus('error', err instanceof AccessCodeError ? 'access-code' : (err as Error).message);
    }
  }

  /** Ends a connection attempt with an error, if it's still the current one. */
  private fail(dc: RTCDataChannel, message: string): void {
    if (this.dc !== dc) return;
    this.teardown();
    this.h.onStatus('error', message);
  }

  disconnect(): void {
    this.teardown();
    this.h.onStatus('idle');
  }

  private teardown(): void {
    this.cancelContinue();
    this.responseActive = this.speaking = this.userSpeaking = false;
    this.setPaused(false);
    const { dc, pc, mic, audio } = this;
    this.dc = this.pc = this.mic = this.audio = null;
    dc?.close();
    pc?.close();
    mic?.getTracks().forEach((t) => t.stop());
    if (audio) audio.srcObject = null;
  }

  get hasMic(): boolean {
    return !!this.mic;
  }

  setMicEnabled(enabled: boolean): void {
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = enabled));
  }

  /** A typed student message; the AI answers it. */
  sendText(text: string): void {
    const id = `local-${++this.localId}`;
    this.h.onTranscript(id, 'user', text, true);
    // Typing mid-explanation interrupts, exactly like speaking does.
    this.interrupt();
    this.setPaused(false);
    this.send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
    this.send({ type: 'response.create' });
  }

  /** Stops the AI right now: cancels the response, drops unplayed audio, and doesn't continue. */
  interrupt(): void {
    this.cancelContinue();
    if (this.responseActive) this.send({ type: 'response.cancel' });
    if (this.speaking) this.send({ type: 'output_audio_buffer.clear' });
  }

  /** Pause button: stop and stay quiet until resumed (or until the student speaks/types). */
  pause(): void {
    this.interrupt();
    this.setPaused(true);
  }

  resume(): void {
    this.setPaused(false);
    this.addContext('[Student] Please continue from where you stopped.');
    this.send({ type: 'response.create' });
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Adds context (board events) without making the AI speak. Optionally with a small image. */
  addContext(text: string, imagePngBase64?: string): void {
    const content: unknown[] = [{ type: 'input_text', text }];
    if (imagePngBase64) content.push({ type: 'input_image', image_url: `data:image/png;base64,${imagePngBase64}` });
    this.send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content } });
  }

  /** Asks the AI to respond now (e.g. after "Check my work"), interrupting whatever it was saying. */
  respond(): void {
    this.interrupt();
    this.setPaused(false);
    this.send({ type: 'response.create' });
  }

  private setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.h.onPaused?.(paused);
  }

  private cancelContinue(): void {
    this.continuePending = false;
    clearTimeout(this.continueTimer);
  }

  private scheduleContinue(): void {
    this.continuePending = true;
    clearTimeout(this.continueTimer);
    // Safety net in case the "audio stopped" event never arrives.
    this.continueTimer = setTimeout(() => this.tryContinue(true), 20_000);
    this.tryContinue();
  }

  private tryContinue(force = false): void {
    if (!this.continuePending || this.paused || this.userSpeaking || this.responseActive) return;
    if (this.speaking && !force) return;
    this.cancelContinue();
    // A short, natural pause between steps (also a window for the student to jump in).
    setTimeout(() => {
      if (!this.paused && !this.userSpeaking && !this.responseActive) this.send({ type: 'response.create' });
    }, 400);
  }

  private send(event: object): void {
    if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify(event));
  }

  private transcript(id: string, role: 'user' | 'assistant', delta: string | null, full: string | null, final: boolean) {
    const text = full ?? (this.transcripts.get(id) ?? '') + (delta ?? '');
    this.transcripts.set(id, text);
    this.h.onTranscript(id, role, text, final);
  }

  private async runToolCall(callId: string, name: string, rawArgs: string) {
    if (this.handledCalls.has(callId)) return;
    this.handledCalls.add(callId);
    let output: unknown;
    try {
      output = await this.h.onToolCall(name, JSON.parse(rawArgs || '{}'));
    } catch (err) {
      output = { ok: false, error: (err as Error).message };
    }
    this.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) } });
    this.pendingToolOutputs = true;
  }

  private async handle(ev: ServerEvent): Promise<void> {
    const t = ev.type;
    if (t === 'input_audio_buffer.committed' && ev.item_id) {
      // Placeholder so the student's spoken line appears in order, before the AI's reply.
      this.transcript(ev.item_id, 'user', null, '…', false);
    } else if (t.includes('input_audio_transcription')) {
      if (t.endsWith('.delta')) {
        const prev = this.transcripts.get(ev.item_id);
        this.transcript(ev.item_id, 'user', null, (prev === '…' ? '' : (prev ?? '')) + (ev.delta ?? ''), false);
      } else if (t.endsWith('.completed')) this.transcript(ev.item_id, 'user', null, ev.transcript?.trim() || '(voice message)', true);
      else if (t.endsWith('.failed')) this.transcript(ev.item_id, 'user', null, '(voice message)', true);
    } else if (t === 'response.output_audio_transcript.delta' || t === 'response.output_text.delta') {
      this.transcript(ev.item_id, 'assistant', ev.delta, null, false);
    } else if (t === 'response.output_audio_transcript.done' || t === 'response.output_text.done') {
      this.transcript(ev.item_id, 'assistant', null, ev.transcript ?? ev.text ?? this.transcripts.get(ev.item_id) ?? '', true);
    } else if (t === 'response.function_call_arguments.done') {
      await this.runToolCall(ev.call_id, ev.name, ev.arguments);
    } else if (t === 'output_audio_buffer.started') {
      this.speaking = true;
      this.h.onSpeaking?.(true);
    } else if (t === 'output_audio_buffer.stopped' || t === 'output_audio_buffer.cleared') {
      this.speaking = false;
      this.h.onSpeaking?.(false);
      this.tryContinue();
    } else if (t === 'input_audio_buffer.speech_started') {
      // The student started talking: they have the floor. The server cancels the AI's reply itself.
      this.userSpeaking = true;
      this.cancelContinue();
      this.setPaused(false);
    } else if (t === 'input_audio_buffer.speech_stopped') {
      this.userSpeaking = false;
    } else if (t === 'response.created') {
      this.responseActive = true;
    } else if (t === 'response.done') {
      this.responseActive = false;
      const r = ev.response ?? {};
      const interrupted = r.status === 'cancelled';
      // Catch any function calls we didn't see as separate events.
      for (const item of r.output ?? []) if (item.type === 'function_call') await this.runToolCall(item.call_id, item.name, item.arguments);
      const u = r.usage;
      if (u) {
        this.usage.audioIn += u.input_token_details?.audio_tokens ?? 0;
        this.usage.textIn += u.input_token_details?.text_tokens ?? 0;
        this.usage.cachedIn += u.input_token_details?.cached_tokens ?? 0;
        this.usage.audioOut += u.output_token_details?.audio_tokens ?? 0;
        this.usage.textOut += u.output_token_details?.text_tokens ?? 0;
        this.h.onUsage({ ...this.usage });
      }
      const usedTools = this.pendingToolOutputs || (r.output ?? []).some((i: { type?: string }) => i.type === 'function_call');
      if (!interrupted) this.h.onResponseDone?.(usedTools);
      // A step that used the board: continue with the next step once this one has been heard.
      // Interrupted replies don't continue; the student's question comes first.
      if (this.pendingToolOutputs && !interrupted) this.scheduleContinue();
      this.pendingToolOutputs = false;
    } else if (t === 'error') {
      console.warn('Realtime error', ev.error);
    }
  }
}
