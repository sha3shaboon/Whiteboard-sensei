import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

const realtime = { apiKey: 'sk-test', model: 'gpt-realtime-2.1', voice: 'marin', transcribeModel: 'whisper-x' };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('server', () => {
  it('reports health', async () => {
    const res = await createApp({ realtime: null, recognizer: null }).request('/api/health');
    expect(await res.json()).toEqual({ ok: true, realtimeConfigured: false, recognitionConfigured: false, accessCodeRequired: false });
  });

  it('requires a valid access code on /api calls when codes are configured', async () => {
    const recognizer = vi.fn(async () => 'x');
    const app = createApp({ realtime: null, recognizer, accessCodes: ['alpha', 'beta'] });
    const post = (code?: string) =>
      app.request('/api/recognize', { method: 'POST', body: JSON.stringify({ image: 'a' }), headers: { 'content-type': 'application/json', ...(code ? { 'x-access-code': code } : {}) } });
    expect((await post()).status).toBe(401);
    expect((await post('nope')).status).toBe(401);
    expect((await post('beta')).status).toBe(200);
    expect(await (await app.request('/api/health')).json()).toMatchObject({ accessCodeRequired: true });
  });

  describe('POST /api/realtime/session', () => {
    it('returns 503 when no API key is configured', async () => {
      const res = await createApp({ realtime: null, recognizer: null }).request('/api/realtime/session', { method: 'POST' });
      expect(res.status).toBe(503);
    });

    it('mints a client secret without exposing the server key', async () => {
      const fetchMock = vi.fn(async () => ok({ value: 'ek_123', expires_at: 999 }));
      const app = createApp({ realtime, recognizer: null, fetchImpl: fetchMock as unknown as typeof fetch });
      const res = await app.request('/api/realtime/session', { method: 'POST', headers: { 'x-access-code': 'trial-01' } });
      expect(await res.json()).toEqual({ value: 'ek_123', expires_at: 999 });

      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('https://api.openai.com/v1/realtime/client_secrets');
      expect((init.headers as Record<string, string>)['OpenAI-Safety-Identifier']).toBe('trial-01');
      const session = JSON.parse(init.body as string).session;
      expect(session.model).toBe('gpt-realtime-2.1');
      expect(session.audio.input.transcription).toEqual({ model: 'whisper-x' });
    });

    it('retries without transcription when the API rejects that config', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response('bad transcription model', { status: 400 }))
        .mockResolvedValueOnce(ok({ value: 'ek_2', expires_at: 1 }));
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const app = createApp({ realtime, recognizer: null, fetchImpl: fetchMock as unknown as typeof fetch });
      const res = await app.request('/api/realtime/session', { method: 'POST' });
      expect(await res.json()).toEqual({ value: 'ek_2', expires_at: 1 });
      const retryBody = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
      expect(retryBody.session.audio.input.transcription).toBeUndefined();
    });

    it('returns 502 when the provider call fails', async () => {
      const fetchMock = vi.fn(async () => new Response('nope', { status: 401 }));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const app = createApp({ realtime, recognizer: null, fetchImpl: fetchMock as unknown as typeof fetch });
      expect((await app.request('/api/realtime/session', { method: 'POST' })).status).toBe(502);
    });
  });

  describe('POST /api/recognize', () => {
    const post = (app: ReturnType<typeof createApp>, body: unknown) =>
      app.request('/api/recognize', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

    it('tells the client to fall back to images when no recognizer is configured', async () => {
      const res = await post(createApp({ realtime: null, recognizer: null }), { image: 'abc' });
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ fallback: 'image' });
    });

    it('returns the recognized text', async () => {
      const recognizer = vi.fn(async () => '2x+4=10');
      const res = await post(createApp({ realtime: null, recognizer }), { image: 'abc' });
      expect(await res.json()).toMatchObject({ text: '2x+4=10' });
      expect(recognizer).toHaveBeenCalledWith('abc');
    });

    it('rejects a missing image', async () => {
      const res = await post(createApp({ realtime: null, recognizer: vi.fn() }), {});
      expect(res.status).toBe(400);
    });
  });
});
