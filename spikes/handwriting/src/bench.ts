// Stage 0 spike: which small vision model turns cropped handwriting into LaTeX accurately, fast and cheaply?
//
// Usage: pnpm spike:handwriting
//   MODELS=claude-haiku-5-5,claude-sonnet-5-5,openai:<model-id>  (comma-separated; "openai:" prefix uses OpenAI)
// Needs ANTHROPIC_API_KEY for Claude models and OPENAI_API_KEY for OpenAI models (in ../../.env or the environment).
// Reads samples/labels.json, writes results/<timestamp>.csv and prints a summary.

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLatex } from './normalize';

const here = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.join(here, '../samples');
const resultsDir = path.join(here, '../results');

const PROMPT = `Transcribe this handwritten whiteboard content.
If it is math, output LaTeX only, without $ delimiters. If it is plain text, output the text only.
No explanation.`;

// USD per 1M tokens (input, output). Claude prices from the claude-api reference, cached 2026-10-06.
// Add OpenAI prices here once confirmed on the pricing page; unknown models report cost as "?".
const PRICES: Record<string, [number, number]> = {
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5': [4, 20],
};

interface Sample { file: string; latex: string }
interface Result { model: string; file: string; expected: string; got: string; correct: boolean; ms: number; inTok: number; outTok: number; error?: string }

let anthropic: Anthropic | undefined;
let openai: OpenAI | undefined;

async function runClaude(model: string, png: string) {
  anthropic ??= new Anthropic();
  const res = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    // Short transcription task: low effort keeps latency and cost down.
    output_config: { effort: 'low' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
  });
  if (res.stop_reason === 'refusal') throw new Error('refusal');
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  return { text, inTok: res.usage.input_tokens, outTok: res.usage.output_tokens };
}

async function runOpenAI(model: string, png: string) {
  openai ??= new OpenAI();
  const res = await openai.responses.create({
    model,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: PROMPT },
          { type: 'input_image', image_url: `data:image/png;base64,${png}`, detail: 'auto' },
        ],
      },
    ],
  });
  return { text: res.output_text, inTok: res.usage?.input_tokens ?? 0, outTok: res.usage?.output_tokens ?? 0 };
}

async function runOne(model: string, sample: Sample): Promise<Result> {
  const png = readFileSync(path.join(samplesDir, sample.file)).toString('base64');
  const start = performance.now();
  try {
    const out = model.startsWith('openai:') ? await runOpenAI(model.slice(7), png) : await runClaude(model, png);
    const got = out.text.trim();
    return {
      model, file: sample.file, expected: sample.latex, got,
      correct: normalizeLatex(got) === normalizeLatex(sample.latex),
      ms: performance.now() - start, inTok: out.inTok, outTok: out.outTok,
    };
  } catch (err) {
    return { model, file: sample.file, expected: sample.latex, got: '', correct: false, ms: performance.now() - start, inTok: 0, outTok: 0, error: (err as Error).message };
  }
}

function pct(xs: number[], p: number) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? NaN;
}

const csvCell = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;

async function main() {
  const samples: Sample[] = JSON.parse(readFileSync(path.join(samplesDir, 'labels.json'), 'utf8'));
  if (!samples.length) {
    console.error('No samples. Add PNGs + labels.json to spikes/handwriting/samples (see README there).');
    process.exit(1);
  }
  const models = (process.env.MODELS ?? 'claude-haiku-5-5,claude-sonnet-5-5').split(',').map((m) => m.trim()).filter(Boolean);
  console.log(`${samples.length} samples x ${models.length} models: ${models.join(', ')}\n`);

  const results: Result[] = [];
  for (const model of models) {
    // Sequential per model so latency numbers aren't skewed by our own concurrency.
    for (const sample of samples) {
      const r = await runOne(model, sample);
      results.push(r);
      console.log(`${r.correct ? 'ok  ' : 'MISS'} ${model} ${r.file} ${r.ms.toFixed(0)}ms  got: ${r.error ? `ERROR ${r.error}` : r.got}`);
    }
  }

  console.log('\nmodel                      accuracy   p50 ms   p90 ms   cost/1000 calls');
  for (const model of models) {
    const rs = results.filter((r) => r.model === model);
    const acc = rs.filter((r) => r.correct).length / rs.length;
    const ms = rs.filter((r) => !r.error).map((r) => r.ms);
    const price = PRICES[model];
    const cost = price
      ? `$${((rs.reduce((s, r) => s + r.inTok * price[0] + r.outTok * price[1], 0) / 1e6 / rs.length) * 1000).toFixed(3)}`
      : '?';
    console.log(`${model.padEnd(26)} ${(acc * 100).toFixed(0).padStart(6)}%   ${pct(ms, 0.5).toFixed(0).padStart(6)}   ${pct(ms, 0.9).toFixed(0).padStart(6)}   ${cost}`);
  }

  mkdirSync(resultsDir, { recursive: true });
  const file = path.join(resultsDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
  const header = 'model,file,expected,got,correct,ms,input_tokens,output_tokens,error';
  const rows = results.map((r) => [r.model, r.file, r.expected, r.got, r.correct, r.ms.toFixed(0), r.inTok, r.outTok, r.error ?? ''].map(csvCell).join(','));
  writeFileSync(file, [header, ...rows].join('\n'));
  console.log(`\nDetails: ${path.relative(process.cwd(), file)} (review MISS rows by hand: some are equivalent LaTeX)`);
}

main();
