# AI Tutor

An AI tutor that teaches by voice, chat and a shared whiteboard. Spec and build stages: see the
"AI Teaching Platform — Trial Spec" doc.

## Layout

| Path | What |
|---|---|
| `apps/web` | React app shell (chat panel, controls); hosts the board |
| `apps/server` | Small Node backend (Hono): mints short-lived Realtime keys; later profiles, sessions, costs |
| `packages/board` | Framework-independent whiteboard core: element model + store |
| `spikes/pen-input` | Stage 0: pen pressure / palm rejection test page; exports handwriting samples |
| `spikes/realtime` | Stage 0: voice latency, tool calls and typed input in one Realtime session |
| `spikes/handwriting` | Stage 0: handwriting → LaTeX benchmark across vision models |

## Setup

```bash
pnpm install
cp .env.example .env   # add OPENAI_API_KEY (and ANTHROPIC_API_KEY for the handwriting benchmark)
pnpm dev               # web on :5173, server on :8787
pnpm test && pnpm typecheck && pnpm build
```

## Stage 0 checklist

- [ ] **Pen input**: `pnpm spike:pen`, open the printed network URL on an iPad (same Wi-Fi).
  Check: `pointerType: pen`, pressure varies, samples/s around 240 with Apple Pencil, no stray marks
  from your palm. Save 20+ handwriting samples (fractions, exponents, roots, Greek, multi-line).
- [ ] **Realtime voice**: `pnpm dev` (for the server) and `pnpm spike:realtime`. Talk for 5+
  minutes; ask it to write an equation (tests `write_math`); type a message mid-conversation.
  Record median latency and audio tokens per minute; multiply by current prices for cost/minute.
- [ ] **Handwriting**: copy the samples + `labels.json` into `spikes/handwriting/samples/`, then
  `MODELS=claude-haiku-5-5,claude-sonnet-5-5 pnpm spike:handwriting` (add `openai:<model>` to compare).
  Pick the cheapest model with acceptable accuracy and p90 latency under about 1.5 s.

Microphone access needs `localhost` or HTTPS, so run the realtime spike on the machine serving
it, or put it behind an HTTPS tunnel to test on a tablet.
