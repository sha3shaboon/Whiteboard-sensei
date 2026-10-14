// Handwriting recognition: a cropped image of one handwriting group -> text or LaTeX.
// Uses a small, fast Claude vision model (configurable; pick the winner of the Stage 0 benchmark).

import Anthropic from '@anthropic-ai/sdk';

export type Recognizer = (pngBase64: string) => Promise<string>;

const PROMPT = `This is a student's handwriting from a whiteboard. Transcribe it.
If it is math, output LaTeX only, without $ delimiters. If it is words, output the words only.
If it is a drawing or diagram, describe it in under 12 words, starting with "drawing:".
If it is unreadable, output "unreadable". No explanation.`;

export function createClaudeRecognizer(model: string, client = new Anthropic()): Recognizer {
  return async (png) => {
    const res = await client.messages.create({
      model,
      max_tokens: 1024,
      // Short transcription: low effort keeps it fast and cheap.
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
    if (res.stop_reason === 'refusal') return 'unreadable';
    return res.content
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join('')
      .trim()
      .replace(/^\$+|\$+$/g, '');
  };
}
