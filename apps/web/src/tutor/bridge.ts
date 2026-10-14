// Connects student board activity to the AI: grouped events -> handwriting recognition -> silent context.
// See spec § AI perception of the board.

import { StudentEventGrouper, boardSummary, describeContent, type Board, type Bounds, type StudentEvent } from '@ai-tutor/board';
import type { BoardView } from '@ai-tutor/board/view';

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
  const res = await fetch('/api/recognize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: png }) });
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
        const png = this.view.strokesToPng(e.strokes);
        const text = this.imageFallback ? null : await recognize(png).catch(() => 'unreadable');
        if (text === null) {
          this.imageFallback = true;
          this.send(`[Board] Student wrote by hand (strokes ${label}) ${at(e.bounds)}${nearText(e.near)}. Image attached: read it yourself.`, png);
        } else {
          for (const s of e.strokes) if (this.board.get(s.id)) this.board.update(s.id, { content: { ...s.content, recognized: text } }, 'system');
          this.send(`[Board] Student wrote by hand (strokes ${label}) ${at(e.bounds)}${nearText(e.near)}: "${text}"`);
        }
        break;
      }
      case 'student_added':
        this.send(`[Board] Student added #${e.element.id} ${describeContent(e.element)} ${at(e.element.bounds)}${nearText(e.near)}.`);
        break;
      case 'student_edited':
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
