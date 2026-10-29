// Connects student board activity to the AI: grouped events -> handwriting recognition -> silent context.
// See spec § AI perception of the board.

import { StudentEventGrouper, boardSummary, describeContent, describeStep, gradeActivity, solutionSteps, intersects, letter, simFacts, type ActivityElement, type AnswerElement, type Board, type BoardElement, type Bounds, type StrokeElement, type StudentEvent } from '@ai-tutor/board';
import type { BoardView } from '@ai-tutor/board/view';
import { apiFetch } from '../api';

export interface ContextSink {
  readonly connected: boolean;
  addContext(text: string, imagePngBase64?: string): void;
  respond(): void;
}

const r = Math.round;
const at = (b: Bounds) => `at (${r(b.x)},${r(b.y)}) ${r(b.width)}x${r(b.height)}`;
const nearText = (near?: string) => (near ? `, near ${near}` : '');

/** Recognizes handwriting via the server; null means "send the image to the voice model instead". */
async function recognize(png: string): Promise<string | null> {
  const res = await apiFetch('/api/recognize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: png }) });
  if (res.status === 503) return null;
  if (!res.ok) return 'unreadable';
  return ((await res.json()) as { text: string }).text;
}

export class TutorBridge {
  private grouper: StudentEventGrouper;
  private queue: Promise<void> = Promise.resolve();
  private eventsSinceSummary = 0;
  private imageFallback = false;

  constructor(
    private board: Board,
    private view: BoardView,
    private sink: ContextSink,
    /** Called with every context message sent, for the "show board events" debug view. */
    private onContext?: (text: string) => void,
  ) {
    this.grouper = new StudentEventGrouper(board, (e) => this.enqueue(() => this.handle(e)));
  }

  /** Sends the current board state, e.g. right after connecting. */
  sendSummary(): void {
    this.send(`[Board] Current board state.\n${boardSummary(this.board)}`);
    this.eventsSinceSummary = 0;
  }

  /** "Check my work": finish the current handwriting group, then ask the AI to respond. */
  checkMyWork(): Promise<void> {
    this.grouper.flush();
    return this.enqueue(async () => {
      this.send(`[Check my work] The student wants feedback on their latest work.\n${boardSummary(this.board)}`);
      this.eventsSinceSummary = 0;
      this.sink.respond();
    });
  }

  dispose(): void {
    this.grouper.dispose();
  }

  private answerBoxAt(b: Bounds): AnswerElement | undefined {
    return this.board.all().find((el): el is AnswerElement => el.type === 'answer' && intersects(el.bounds, b));
  }

  /** The student pressed Done on an answer box: send everything they put inside it, and ask for feedback. */
  private async submitAnswer(box: AnswerElement): Promise<void> {
    const inside = this.board.all().filter((el) => el.author === 'student' && el.id !== box.id && intersects(el.bounds, box.bounds));
    const question = box.content.question ? this.board.get(box.content.question) : undefined;
    const q = question ? `your question #${question.id} (${describeContent(question)})` : `answer box #${box.id}`;
    if (!inside.length) {
      this.send(`[Answer] The student pressed Done on ${q} but the box is empty. Encourage them to try, or give a hint.`);
      this.sink.respond();
      return;
    }
    const strokes = inside.filter((el): el is StrokeElement => el.type === 'stroke' && !el.content.highlighter);
    const unread = strokes.filter((s) => !s.content.recognized);
    const parts = describeGroups(inside);
    const image = this.imageFallback && unread.length ? this.view.strokesToPng(unread) : undefined;
    this.send(
      `[Answer] The student submitted their answer to ${q}: ${parts.join('; ')}.${image ? ' Their handwriting is attached as an image.' : ''} Respond now: say what's right, and if there's a mistake, annotate the first one with a hint (don't just give the full answer).`,
      image,
    );
    this.sink.respond();
  }

  /**
   * Tells the tutor how an activity went. The app has already shown instant feedback and hints, so
   * the tutor is asked to speak when it adds something: a right answer, a reveal, a first miss,
   * or a third miss. Returns whether to ask for a response.
   */
  private reportActivity(el: ActivityElement, before: ActivityElement): boolean {
    const c = el.content, b = before.content;
    if (c.mode === 'example') {
      const shown = c.shown ?? 0, total = solutionSteps(c.spec);
      if (shown <= (b.shown ?? 0)) return false;
      this.send(`[Activity] The student tapped "Next step" on worked example #${el.id}: step ${shown} of ${total} is now shown (${describeStep(c.spec, shown - 1)}). Explain why that step works in a sentence or two${shown >= total ? ', then sum up the method and offer a similar one to try (ask_activity with given)' : ''}.`);
      return true;
    }
    if (c.status === b.status && c.attempts === b.attempts) return false;
    const q = `activity #${el.id} (${c.spec.kind.replace('_', ' ')}) "${c.prompt}"`;
    const detail = c.response !== undefined ? gradeActivity(c.spec, c.response).detail : '';
    if (c.status === 'correct') {
      this.send(`[Activity] The student solved ${q}${c.attempts > 1 ? ` on try ${c.attempts}` : ' first try'}: ${detail}. The app already celebrated. Praise specifically in one short sentence, then continue (next question, or build on it).`);
      return true;
    }
    if (c.status === 'revealed') {
      this.send(`[Activity] The student pressed "Show me" on ${q} after ${c.attempts} tries; the app showed the answer${c.explanation ? ' and your explanation' : ''}. Walk through why it's right, briefly and kindly, then offer a similar one to try.`);
      return true;
    }
    if (c.status === 'wrong') {
      const hint = c.hints?.length ? c.hints[Math.min(c.attempts - 1, c.hints.length - 1)] : undefined;
      this.send(`[Activity] Try ${c.attempts} on ${q} was not right: ${detail}. The app showed "${c.feedback ?? 'Not quite'}"${hint ? ` and the hint "${hint}"` : ''}.${c.attempts === 1 || c.attempts >= 3 ? ' Give a short nudge that targets their mistake (not the answer).' : ' Stay quiet unless they ask: they are trying again.'}`);
      return c.attempts === 1 || c.attempts >= 3;
    }
    return false;
  }

  private enqueue(task: () => Promise<void> | void): Promise<void> {
    // Serialize so events reach the AI in order even though recognition is async.
    this.queue = this.queue.then(task).catch((err) => console.error('board event failed', err));
    return this.queue;
  }

  private send(text: string, image?: string): void {
    if (!this.sink.connected) return;
    this.sink.addContext(text, image);
    this.onContext?.(image ? `${text} [+image]` : text);
  }

  private async handle(e: StudentEvent): Promise<void> {
    if (!this.sink.connected) return;
    switch (e.type) {
      case 'student_wrote': {
        const ids = e.strokes.map((s) => `#${s.id}`);
        const label = ids.length > 1 ? `${ids[0]}…${ids.at(-1)}` : ids[0];
        if (e.highlighter) {
          this.send(`[Board] Student highlighted ${at(e.bounds)}${nearText(e.near)}.`);
          break;
        }
        const box = this.answerBoxAt(e.bounds);
        const where = box ? ` inside answer box #${box.id}` : '';
        const png = this.view.strokesToPng(e.strokes);
        const text = this.imageFallback ? null : await recognize(png).catch(() => 'unreadable');
        if (text === null) {
          this.imageFallback = true;
          this.send(`[Board] Student wrote by hand (strokes ${label})${where} ${at(e.bounds)}${nearText(e.near)}. Image attached: read it yourself.`, png);
        } else {
          for (const s of e.strokes) if (this.board.get(s.id)) this.board.update(s.id, { content: { ...s.content, recognized: text } }, 'system');
          this.send(`[Board] Student wrote by hand (strokes ${label})${where} ${at(e.bounds)}${nearText(e.near)}: "${text}"`);
        }
        break;
      }
      case 'student_added':
        this.send(`[Board] Student added #${e.element.id} ${describeContent(e.element)} ${at(e.element.bounds)}${nearText(e.near)}.`);
        break;
      case 'student_edited':
        if (e.element.type === 'choice' && e.before.type === 'choice') {
          const i = e.element.content.selected;
          if (i === undefined || i === e.before.content.selected) break;
          this.send(`[Answer] For your question #${e.element.id} "${e.element.content.question}", the student picked ${letter(i)}) ${e.element.content.choices[i]}. Respond now: say whether it's right and why.`);
          this.sink.respond();
          return;
        }
        if (e.element.type === 'answer') {
          await this.submitAnswer(e.element);
          return;
        }
        if (e.element.type === 'activity' && e.before.type === 'activity') {
          if (this.reportActivity(e.element, e.before)) this.sink.respond();
          return;
        }
        if (e.element.type === 'simulation' && e.before.type === 'simulation') {
          const before = e.before.content.params, after = e.element.content.params;
          const changed = Object.keys(after).filter((k) => after[k] !== before[k]).map((k) => `${k} ${before[k]} → ${after[k]}`);
          if (!changed.length) break;
          const facts = Object.entries(simFacts(e.element.content.kind, after)).map(([k, v]) => `${k} ${+v.toFixed(2)}`).join(', ');
          this.send(`[Board] The student changed the ${e.element.content.kind} simulation #${e.element.id}: ${changed.join(', ')} (now ${facts}). If you're not mid-sentence, react to what they found.`);
          break;
        }
        this.send(`[Board] Student changed #${e.element.id} from ${describeContent(e.before)} to ${describeContent(e.element)}.`);
        break;
      case 'student_moved':
        this.send(`[Board] Student moved #${e.element.id} (${e.element.author} ${describeContent(e.element)}) to ${at(e.element.bounds)}.`);
        break;
      case 'student_erased':
        this.send(`[Board] Student erased #${e.element.id} (${e.element.author === 'ai' ? 'your' : 'their'} ${describeContent(e.element)}).`);
        break;
    }
    // Every 15 events, refresh the full picture so the AI doesn't drift.
    if (++this.eventsSinceSummary >= 15) this.sendSummary();
  }
}

/** "handwriting \"x=3\"; text \"because...\"", merging strokes that share a reading. */
function describeGroups(els: BoardElement[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const el of els) {
    const d = describeContent(el);
    if (el.type === 'stroke' && seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}
