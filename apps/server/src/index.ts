import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const apiKey = process.env.OPENAI_API_KEY;
const config = apiKey
  ? {
      apiKey,
      model: process.env.REALTIME_MODEL ?? 'gpt-realtime-2.1',
      voice: process.env.REALTIME_VOICE ?? 'marin',
    }
  : null;

if (!config) console.warn('OPENAI_API_KEY not set: /api/realtime/session will return 503');

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: createApp(config).fetch, port }, () => {
  console.log(`server listening on http://localhost:${port}`);
});
