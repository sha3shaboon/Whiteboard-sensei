import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { createClaudeRecognizer } from './recognize.js';

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

const port = Number(env.PORT ?? 8787);
serve({ fetch: createApp({ realtime, recognizer }).fetch, port }, () => {
  console.log(`server listening on http://localhost:${port}`);
});
