import { useEffect, useRef, useState } from 'react';
import type { Status, Usage } from '../tutor/realtime';
import { Icon } from './Icon';
import { sessionCost } from '../tutor/pricing';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'event';
  text: string;
  final: boolean;
}

interface Props {
  status: Status;
  statusDetail?: string;
  messages: ChatMessage[];
  micOn: boolean;
  hasMic: boolean;
  speaking: boolean;
  paused: boolean;
  onPause(): void;
  onResume(): void;
  usage: Usage | null;
  minutes: number;
  showEvents: boolean;
  demoAvailable: boolean;
  needsAccessCode: boolean;
  onShowEvents(v: boolean): void;
  onConnect(accessCode?: string): void;
  onDisconnect(): void;
  onToggleMic(): void;
  onSend(text: string): void;
  onCheckWork(): void;
  onDemo(): void;
}


export function ChatPanel(p: Props) {
  const [draft, setDraft] = useState('');
  const [codeDraft, setCodeDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const connected = p.status === 'connected';

  useEffect(() => {
    const el = listRef.current;
    if (el && p.messages.length) el.scrollTop = el.scrollHeight;
  }, [p.messages]);

  const submit = () => {
    const text = draft.trim();
    if (!text || !connected) return;
    p.onSend(text);
    setDraft('');
  };

  const visible = p.messages.filter((m) => p.showEvents || m.role !== 'event');
  const cost = p.usage ? sessionCost(p.usage) : null;

  return (
    <aside className="chat-panel">
      <header className="chat-header">
        <div>
          <div className="chat-title">Tutor</div>
          <div className={`chat-status ${p.status}`}>
            {connected ? (
              <span className={`eq ${p.paused ? 'paused' : p.speaking ? 'speaking' : ''}`} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
            ) : (
              <span className="dot" />
            )}
            {p.status === 'connected' ? (p.paused ? 'Paused' : p.speaking ? 'Speaking…' : 'Listening') : p.status === 'connecting' ? 'Connecting…' : p.status === 'error' ? 'Connection failed' : 'Not connected'}
          </div>
        </div>
        {connected ? (
          <div className="header-actions">
            {p.paused ? (
              <button className="pill-btn" onClick={p.onResume} title="Let the tutor continue">
                <Icon name="play" size={16} /> Continue
              </button>
            ) : (
              <button className="pill-btn" onClick={p.onPause} title="Stop the tutor for a moment (you can also just start talking)">
                <Icon name="pause" size={16} /> Pause
              </button>
            )}
            {p.hasMic && (
              <button className={`icon-btn ${p.micOn ? '' : 'off'}`} onClick={p.onToggleMic} title={p.micOn ? 'Mute microphone' : 'Unmute microphone'} aria-label={p.micOn ? 'Mute microphone' : 'Unmute microphone'}>
                <Icon name={p.micOn ? 'mic' : 'micOff'} />
              </button>
            )}
            <button className="icon-btn danger" onClick={p.onDisconnect} title="End session" aria-label="End session">
              <Icon name="stop" />
            </button>
          </div>
        ) : null}
      </header>

      <div className="messages" ref={listRef}>
        {!connected && p.messages.length === 0 && (
          <div className="welcome">
            <span className="eyebrow">Live AI tutor</span>
            <h2>
              Learn anything, <span>out loud</span>
            </h2>
            <p>Talk or type, and work on the whiteboard together. Your tutor will ask what you'd like to learn.</p>
            <div className="features">
              <span style={{ ['--c' as string]: '#8b5cf6' }}>Voice</span>
              <span style={{ ['--c' as string]: '#3b82f6' }}>Shared whiteboard</span>
              <span style={{ ['--c' as string]: '#2dd4bf' }}>Maps, molecules, charts</span>
              <span style={{ ['--c' as string]: '#facc15' }}>Real pictures</span>
            </div>
            {p.needsAccessCode ? (
              <form
                className="code-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (codeDraft.trim()) p.onConnect(codeDraft.trim());
                }}
              >
                <input value={codeDraft} onChange={(e) => setCodeDraft(e.target.value)} placeholder="Trial access code" aria-label="Trial access code" autoComplete="off" />
                <button className="primary" type="submit" disabled={!codeDraft.trim() || p.status === 'connecting'}>
                  <Icon name="phone" /> Start
                </button>
              </form>
            ) : (
              <button className="primary" onClick={() => p.onConnect()} disabled={p.status === 'connecting'}>
                <Icon name="phone" /> {p.status === 'connecting' ? 'Connecting…' : 'Start session'}
              </button>
            )}
            {p.status === 'error' && <p className="error">{p.statusDetail}</p>}
            {p.demoAvailable && (
              <button className="secondary" onClick={p.onDemo}>
                Run board demo (no API needed)
              </button>
            )}
            <p className="fine">Microphone access is requested when you start. Audio is not recorded.</p>
          </div>
        )}
        {visible.map((m) => (
          <div key={m.id} className={`msg ${m.role} ${m.final ? '' : 'partial'}`}>
            {m.text}
          </div>
        ))}
        {!connected && p.messages.length > 0 && (
          <div className="session-ended">
            {p.status === 'error' && <p className="error">{p.statusDetail}</p>}
            <button className="primary" onClick={() => p.onConnect()} disabled={p.status === 'connecting' || p.needsAccessCode}>
              <Icon name="phone" /> {p.status === 'connecting' ? 'Connecting…' : 'Start a new session'}
            </button>
          </div>
        )}
      </div>

      <div className="composer">
        <button className="check-btn" onClick={p.onCheckWork} disabled={!connected} title="Ask the tutor to look at your latest work">
          <Icon name="check" size={18} /> Check my work
        </button>
        <div className="input-row">
          <textarea
            value={draft}
            placeholder={connected ? 'Type a message…' : 'Start a session to chat'}
            disabled={!connected}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button className="icon-btn send" onClick={submit} disabled={!connected || !draft.trim()} aria-label="Send">
            <Icon name="send" />
          </button>
        </div>
        <footer className="meta">
          <label>
            <input type="checkbox" checked={p.showEvents} onChange={(e) => p.onShowEvents(e.target.checked)} /> Show board events
          </label>
          {p.usage && cost && (
            <span
              className="cost"
              title={[
                `${p.usage.model || 'model unknown'} · ${p.usage.responses} responses`,
                ...cost.parts.map((x) => `${x.label}: ${x.tokens.toLocaleString()} tokens ≈ $${x.cost.toFixed(3)}`),
                p.usage.imageIn ? `Images in: ${p.usage.imageIn.toLocaleString()} tokens (not priced)` : '',
                'List prices; voice transcription billed separately.',
              ].filter(Boolean).join('\n')}
            >
              {p.minutes.toFixed(1)} min · <b>${cost.total.toFixed(2)}</b>
              {p.minutes >= 0.5 ? ` · $${(cost.total / p.minutes).toFixed(2)}/min` : ''}
            </span>
          )}
        </footer>
        {connected && p.statusDetail && <div className="notice">{p.statusDetail}</div>}
      </div>
    </aside>
  );
}
