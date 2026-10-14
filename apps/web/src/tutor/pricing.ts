// What a voice session has cost so far, from the token usage OpenAI reports on every response.
// List prices (USD per 1M tokens) from https://developers.openai.com/api/docs/pricing, Oct 2026.
// Check them before relying on the numbers; image input and transcription are not included.

import type { Usage } from './realtime';

interface Prices {
  audioIn: number;
  audioCached: number;
  textIn: number;
  textCached: number;
  audioOut: number;
  textOut: number;
}

const FULL: Prices = { audioIn: 32, audioCached: 0.4, textIn: 4, textCached: 0.4, audioOut: 64, textOut: 24 };
const MINI: Prices = { audioIn: 10, audioCached: 0.3, textIn: 0.6, textCached: 0.06, audioOut: 20, textOut: 2.4 };

export function pricesFor(model: string): Prices {
  if (/mini/.test(model)) return MINI;
  // The original gpt-realtime and 1.5 differ only in text output.
  if (/^gpt-realtime(-1\.5)?$/.test(model)) return { ...FULL, textOut: 16 };
  return FULL;
}

export interface CostBreakdown {
  total: number;
  parts: { label: string; tokens: number; cost: number }[];
}

export function sessionCost(u: Usage): CostBreakdown {
  const p = pricesFor(u.model);
  const m = (tokens: number, perM: number) => (tokens * perM) / 1e6;
  const parts = [
    { label: 'Audio in (new)', tokens: u.audioIn - u.audioInCached, cost: m(u.audioIn - u.audioInCached, p.audioIn) },
    { label: 'Audio in (cached)', tokens: u.audioInCached, cost: m(u.audioInCached, p.audioCached) },
    { label: 'Text in (new)', tokens: u.textIn - u.textInCached, cost: m(u.textIn - u.textInCached, p.textIn) },
    { label: 'Text in (cached)', tokens: u.textInCached, cost: m(u.textInCached, p.textCached) },
    { label: 'Audio out', tokens: u.audioOut, cost: m(u.audioOut, p.audioOut) },
    { label: 'Text out', tokens: u.textOut, cost: m(u.textOut, p.textOut) },
  ];
  return { total: parts.reduce((s, x) => s + x.cost, 0), parts };
}
