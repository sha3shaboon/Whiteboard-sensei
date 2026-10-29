// Instant feedback for activities: soft synthesized sounds, a spectrum confetti burst for a right
// answer, and a gentle shake for a wrong one. No audio files, nothing loud.

let ctx: AudioContext | null = null;
let muted = false;

export function setFeedbackMuted(m: boolean): void {
  muted = m;
}

function audio(): AudioContext | null {
  if (muted || typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'sine'): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** Two rising notes (a major third): "that's right". */
export function playCorrect(): void {
  tone(659.25, 0, 0.35, 0.12);
  tone(830.61, 0.09, 0.45, 0.1);
  tone(987.77, 0.18, 0.6, 0.08);
}

/** A soft low double tap: "not quite", never a buzzer. */
export function playWrong(): void {
  tone(220, 0, 0.16, 0.08, 'triangle');
  tone(196, 0.12, 0.22, 0.07, 'triangle');
}

/** A tiny click for picking things up and placing them. */
export function playTap(): void {
  tone(1200, 0, 0.05, 0.03, 'triangle');
}

/** Plays notes (MIDI numbers per step) as soft piano-like tones; returns the total length in seconds. */
export function playNotes(steps: number[][], beat = 0.55): number {
  const a = audio();
  if (!a) return 0;
  steps.forEach((chord, i) => {
    for (const m of chord) {
      const f = 440 * 2 ** ((m - 69) / 12);
      tone(f, i * beat, beat * 1.6, 0.12 / Math.sqrt(chord.length), 'triangle');
      tone(f * 2, i * beat, beat * 0.8, 0.02 / Math.sqrt(chord.length));
    }
  });
  return steps.length * beat;
}

const SPECTRUM = ['#8b5cf6', '#3b82f6', '#14b8a6', '#facc15', '#ec4899', '#22c55e'];

/** Confetti burst from the top of `node`. */
export function celebrate(node: HTMLElement): void {
  if (typeof node.animate !== 'function') return;
  const layer = document.createElement('div');
  Object.assign(layer.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '0', pointerEvents: 'none', overflow: 'visible', zIndex: '5' });
  node.appendChild(layer);
  const n = 28;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span');
    const size = 5 + Math.random() * 6;
    Object.assign(p.style, {
      position: 'absolute', left: `${30 + Math.random() * 40}%`, top: '24px', width: `${size}px`, height: `${size * (Math.random() < 0.5 ? 1 : 0.45)}px`,
      background: SPECTRUM[i % SPECTRUM.length], borderRadius: Math.random() < 0.4 ? '50%' : '2px',
    });
    layer.appendChild(p);
    const angle = (-Math.PI / 2) + (Math.random() - 0.5) * 2.2, dist = 70 + Math.random() * 110;
    const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist;
    p.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${Math.random() * 540}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx * 1.15}px, ${dy + 90}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ],
      { duration: 1100 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
    );
  }
  setTimeout(() => layer.remove(), 1800);
}

export function shake(node: HTMLElement): void {
  if (typeof node.animate !== 'function') return;
  node.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }], { duration: 380, easing: 'ease-out' });
}
