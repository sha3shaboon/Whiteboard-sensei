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

## Run it

```bash
pnpm install
cp .env.example .env   # OPENAI_API_KEY (voice + chat). ANTHROPIC_API_KEY is optional (handwriting recognition)
pnpm dev               # open http://localhost:5173 (server runs on :8787)
```

Press **Start session**, allow the microphone, and the tutor greets you and asks what you want to learn.
Talk or type; write on the board with pen, text or shapes; press **Check my work** for feedback.
Tick **Show board events** to see exactly what the AI is told about the board and what it draws.

- No API key? Open `http://localhost:5173/?demo` and press **Run board demo** to see the AI-side
  board tools drive a scripted mini-lesson.
- Without `ANTHROPIC_API_KEY`, handwriting is sent to the voice model as a small image instead of
  being transcribed first. With it, `claude-haiku-5-5` transcribes it (`RECOGNIZE_MODEL` to change).
- Tablet: run `pnpm dev`, then open the network URL Vite prints. The microphone needs HTTPS off
  localhost, so use an HTTPS tunnel (or type to the tutor) when testing on an iPad.

## Deploy

One service: the Node server serves the API and the built web app (`Dockerfile`).

**Render (blueprint included):** Render dashboard → New → Blueprint → pick this repo. It reads
`render.yaml`; enter `OPENAI_API_KEY`, `ACCESS_CODES` (e.g. `alpha-7f3k,beta-q9x2`) and optionally
`ANTHROPIC_API_KEY` when prompted. Pushes to `main` redeploy automatically. Render serves HTTPS,
so the microphone works on tablets too.

**Anywhere else with Docker:**

```bash
docker build -t whiteboard-sensei .
docker run -p 8080:8080 -e OPENAI_API_KEY=... -e ACCESS_CODES=... whiteboard-sensei
```

Always set `ACCESS_CODES` on a public URL: without it, anyone who finds the site can start voice
sessions billed to your OpenAI account. Students enter the code once; the browser remembers it.

## Checks

```bash
pnpm test && pnpm typecheck && pnpm build
pnpm --filter @ai-tutor/web e2e   # with pnpm dev running: full session against a fake Realtime peer
```

## What works (trial build)

- Voice conversation (interruptible) and typed chat in one session; transcript in the chat panel
- The tutor opens by asking subject, level and goal, then explains or solves step by step
- Whiteboard: pressure pen, highlighter, eraser, text, rectangle/ellipse/line/arrow, select and move,
  delete, undo/redo, pan (drag with pan tool, Alt+drag, two fingers) and zoom (Ctrl+wheel, pinch)
- AI writes on the board while speaking: text, LaTeX math, code, graphs, labeled shapes, arrows,
  and can circle/highlight/point at any item including the student's handwriting
- Relative placement ("below #12") with automatic layout; AI content never covers student work
- The AI sees board activity as silent events (grouped handwriting after a 1.5 s pause, typed text,
  shapes, moves, erases, edits) and responds when the student talks, types or presses Check my work
- Approximate audio cost per session in the chat footer

Not yet: accounts, saved sessions/profiles (Stage 5), shape resizing, multi-select.

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
