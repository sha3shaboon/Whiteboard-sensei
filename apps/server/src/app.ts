import { Hono } from 'hono';
import { createClientSecret, type RealtimeConfig } from './realtime.js';
import type { Recognizer } from './recognize.js';

export interface AppDeps {
  realtime: RealtimeConfig | null;
  recognizer: Recognizer | null;
  /** Trial access codes. When non-empty, every /api call except health needs one in `x-access-code`. */
  accessCodes?: string[];
  fetchImpl?: typeof fetch;
}

export function createApp({ realtime, recognizer, accessCodes = [], fetchImpl = fetch }: AppDeps) {
  const app = new Hono();
  const codes = new Set(accessCodes.map((c) => c.trim()).filter(Boolean));

  app.get('/api/health', (c) =>
    c.json({ ok: true, realtimeConfigured: realtime !== null, recognitionConfigured: recognizer !== null, accessCodeRequired: codes.size > 0 }),
  );

  app.use('/api/*', async (c, next) => {
    if (codes.size && !codes.has(c.req.header('x-access-code') ?? '')) return c.json({ error: 'A valid access code is required' }, 401);
    await next();
  });

  app.post('/api/realtime/session', async (c) => {
    if (!realtime) return c.json({ error: 'OPENAI_API_KEY is not set on the server' }, 503);
    // Trial: no accounts yet, so the access code (or "anonymous") identifies the user to the provider.
    const safetyId = c.req.header('x-access-code') ?? 'anonymous';
    try {
      return c.json(await createClientSecret(realtime, safetyId, fetchImpl));
    } catch (err) {
      console.error(err);
      return c.json({ error: 'Failed to create realtime session' }, 502);
    }
  });

  app.post('/api/recognize', async (c) => {
    // No recognizer configured: the client falls back to sending the image to the voice model itself.
    if (!recognizer) return c.json({ error: 'ANTHROPIC_API_KEY is not set on the server', fallback: 'image' }, 503);
    const body = await c.req.json<{ image?: string }>().catch(() => ({ image: undefined }));
    if (!body.image || body.image.length > 4_000_000) return c.json({ error: 'Expected { image: <base64 png> } under 3 MB' }, 400);
    try {
      const started = Date.now();
      const text = await recognizer(body.image);
      return c.json({ text, ms: Date.now() - started });
    } catch (err) {
      console.error(err);
      return c.json({ error: 'Recognition failed' }, 502);
    }
  });

  return app;
}
