import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

const config = { apiKey: 'sk-test', model: 'gpt-realtime-2.1', voice: 'marin' };

describe('server', () => {
  it('reports health', async () => {
    const res = await createApp(null).request('/api/health');
    expect(await res.json()).toEqual({ ok: true, realtimeConfigured: false });
  });

  it('returns 503 when no API key is configured', async () => {
    const res = await createApp(null).request('/api/realtime/session', { method: 'POST' });
    expect(res.status).toBe(503);
  });

  it('mints a client secret without exposing the server key', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ value: 'ek_123', expires_at: 999 }), { status: 200 }),
    );
    const res = await createApp(config, fetchMock as unknown as typeof fetch).request('/api/realtime/session', {
      method: 'POST',
      headers: { 'x-access-code': 'trial-01' },
    });
    expect(await res.json()).toEqual({ value: 'ek_123', expires_at: 999 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/realtime/client_secrets');
    expect((init.headers as Record<string, string>)['OpenAI-Safety-Identifier']).toBe('trial-01');
    expect(JSON.parse(init.body as string).session.model).toBe('gpt-realtime-2.1');
  });

  it('returns 502 when the provider call fails', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 401 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await createApp(config, fetchMock as unknown as typeof fetch).request('/api/realtime/session', {
      method: 'POST',
    });
    expect(res.status).toBe(502);
  });
});
