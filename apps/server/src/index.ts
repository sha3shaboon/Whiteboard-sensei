import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createClaudeRecognizer } from './recognize.js';
import { createStrokeLoader } from './strokes.js';
import { createMoleculeLoader } from './molecule.js';
import { createImageSearch } from './images.js';

const env = process.env;

const realtime = env.OPENAI_API_KEY
  ? {
      apiKey: env.OPENAI_API_KEY,
      model: env.REALTIME_MODEL ?? 'gpt-realtime-2.1',
      voice: env.REALTIME_VOICE ?? 'marin',
      transcribeModel: env.REALTIME_TRANSCRIBE_MODEL ?? 'gpt-realtime-whisper',
    }
  : null;
const recognizer = env.ANTHROPIC_API_KEY ? createClaudeRecognizer(env.RECOGNIZE_MODEL ?? 'claude-haiku-5-5') : null;

if (!realtime) console.warn('OPENAI_API_KEY not set: voice/chat tutor is unavailable');
if (!recognizer) console.warn('ANTHROPIC_API_KEY not set: handwriting goes to the voice model as images instead');

const accessCodes = (env.ACCESS_CODES ?? '').split(',').filter((c) => c.trim());
if (!accessCodes.length) console.warn('ACCESS_CODES not set: anyone who can reach this server can start paid voice sessions');

const app = createApp({ realtime, recognizer, accessCodes, strokes: createStrokeLoader(), molecules: createMoleculeLoader(), images: createImageSearch() });

// Production: serve the built web app from the same origin (single service to deploy).
const staticDir = env.STATIC_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (existsSync(staticDir)) {
  const root = path.relative(process.cwd(), staticDir) || '.';
  app.use('/*', serveStatic({ root }));
  app.get('*', serveStatic({ root, path: 'index.html' })); // SPA fallback
  console.log(`serving web app from ${staticDir}`);
}

const port = Number(env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  console.log(`server listening on http://localhost:${port}`);
});
