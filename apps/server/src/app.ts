import { Hono } from 'hono';
import { createClientSecret, type RealtimeConfig } from './realtime.js';

export function createApp(config: RealtimeConfig | null, fetchImpl: typeof fetch = fetch) {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true, realtimeConfigured: config !== null }));

  app.post('/api/realtime/session', async (c) => {
    if (!config) return c.json({ error: 'OPENAI_API_KEY is not set on the server' }, 503);
    // Trial: no accounts yet, so the access code (or "anonymous") identifies the user to the provider.
    const safetyId = c.req.header('x-access-code') ?? 'anonymous';
    try {
      return c.json(await createClientSecret(config, safetyId, fetchImpl));
    } catch (err) {
      console.error(err);
      return c.json({ error: 'Failed to create realtime session' }, 502);
    }
  });

  return app;
}
