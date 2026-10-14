import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '@ai-tutor/board';
import { BoardView, type Tool } from '@ai-tutor/board/view';
import { getAccessCode, setAccessCode } from './api';
import { ChatPanel, type ChatMessage } from './components/ChatPanel';
import { Toolbar, TOOL_KEYS } from './components/Toolbar';
import { TutorBridge } from './tutor/bridge';
import { DEMO } from './tutor/demo';
import { INSTRUCTIONS } from './tutor/instructions';
import { RealtimeClient, type Status, type Usage } from './tutor/realtime';
import { executeTool, TOOLS } from './tutor/tools';

const demoAvailable = new URLSearchParams(location.search).has('demo');

const BOARD_NUDGE =
  '[Coach] Your last replies used only voice. In your next reply, put the content on the board (write_steps, draw_diagram, make_table, plot, annotate) and give the student something to do there with ask_question.';

export function App() {
  const board = useMemo(() => new Board(), []);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<BoardView | null>(null);
  const bridgeRef = useRef<TutorBridge | null>(null);

  const [tool, setTool] = useState<Tool>('pen');
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [statusDetail, setStatusDetail] = useState<string>();
  const [micOn, setMicOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [showEvents, setShowEvents] = useState(demoAvailable);
  const [accessRequired, setAccessRequired] = useState(false);
  const [code, setCode] = useState(getAccessCode);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json() as Promise<{ accessCodeRequired?: boolean }>)
      .then((h) => setAccessRequired(!!h.accessCodeRequired))
      .catch(() => {});
  }, []);

  // A rejected code is forgotten so the student can enter it again.
  useEffect(() => {
    if (status === 'error' && statusDetail === 'access-code') {
      setAccessCode('');
      setCode('');
    }
  }, [status, statusDetail]);

  const upsert = useCallback((m: ChatMessage) => {
    setMessages((list) => {
      const i = list.findIndex((x) => x.id === m.id);
      if (i === -1) return [...list, m];
      const next = list.slice();
      next[i] = m;
      return next;
    });
  }, []);
  const eventLine = useCallback((text: string) => upsert({ id: `ev-${crypto.randomUUID()}`, role: 'event', text, final: true }), [upsert]);

  // Board-first coaching: after 2 replies in a row without any board tool (greeting excluded),
  // remind the model silently to teach on the board.
  const nudge = useRef<(usedTools: boolean) => void>(() => {});
  const plainReplies = useRef(-1);
  nudge.current = (usedTools) => {
    if (usedTools) plainReplies.current = 0;
    else if (++plainReplies.current >= 2) {
      plainReplies.current = 0;
      client.addContext(BOARD_NUDGE);
      eventLine(`Coach → AI: ${BOARD_NUDGE}`);
    }
  };

  const client = useMemo(
    () =>
      new RealtimeClient({
        onStatus: (s, detail) => {
          setStatus(s);
          setStatusDetail(detail);
          if (s === 'idle' || s === 'error') setSpeaking(false);
        },
        onTranscript: (id, role, text, final) => upsert({ id, role, text, final }),
        onToolCall: (name, args) => {
          const view = viewRef.current;
          if (!view) return { ok: false, error: 'Board not ready' };
          const result = executeTool(board, view, name, args);
          eventLine(`AI → board: ${name} ${JSON.stringify(args)} → ${JSON.stringify(result)}`);
          return result;
        },
        onUsage: setUsage,
        onSpeaking: setSpeaking,
        onResponseDone: (usedTools) => nudge.current(usedTools),
      }),
    [board, upsert, eventLine],
  );

  // Mount the whiteboard and the AI bridge once.
  useEffect(() => {
    const view = new BoardView(hostRef.current!, board, {
      onToolChange: setTool,
      onHistoryChange: () => setHistory({ canUndo: board.canUndo(), canRedo: board.canRedo() }),
    });
    viewRef.current = view;
    bridgeRef.current = new TutorBridge(board, view, client, (text) => eventLine(`Board → AI: ${text}`));
    return () => {
      bridgeRef.current?.dispose();
      view.destroy();
      client.disconnect();
    };
  }, [board, client, eventLine]);

  // Tool keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      const next = TOOL_KEYS[e.key.toLowerCase()];
      if (next && viewRef.current) viewRef.current.tool = next;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (status !== 'connected') return;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [status]);

  const connect = (enteredCode?: string) => {
    if (enteredCode !== undefined) {
      setAccessCode(enteredCode);
      setCode(enteredCode);
    }
    setStartedAt(Date.now());
    setNow(Date.now());
    setUsage(null);
    void client.connect({
      instructions: INSTRUCTIONS,
      tools: TOOLS,
      onOpen: () => {
        plainReplies.current = -1; // the greeting doesn't count
        setMicOn(true);
        bridgeRef.current?.sendSummary();
        client.respond(); // tutor greets first and asks what to learn
      },
    });
  };

  const runDemo = async () => {
    const view = viewRef.current;
    if (!view) return;
    for (const [i, step] of DEMO.entries()) {
      if (step.say) upsert({ id: `demo-${i}`, role: 'assistant', text: step.say, final: true });
      if (step.tool) {
        const result = executeTool(board, view, step.tool, step.args ?? {});
        eventLine(`AI → board: ${step.tool} → ${JSON.stringify(result)}`);
      }
      await new Promise((r) => setTimeout(r, 900));
    }
  };

  return (
    <div className="layout">
      <main className="board-area">
        <div ref={hostRef} className="board-host" />
        <Toolbar
          tool={tool}
          onTool={(t) => viewRef.current && (viewRef.current.tool = t)}
          onUndo={() => board.undo()}
          onRedo={() => board.redo()}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
        />
      </main>
      <ChatPanel
        status={status}
        statusDetail={statusDetail === 'access-code' ? 'That access code is not valid.' : statusDetail}
        needsAccessCode={accessRequired && !code}
        messages={messages}
        micOn={micOn}
        hasMic={client.hasMic}
        speaking={speaking}
        usage={usage}
        minutes={startedAt ? Math.max(0, now - startedAt) / 60000 : 0}
        showEvents={showEvents}
        demoAvailable={demoAvailable}
        onShowEvents={setShowEvents}
        onConnect={connect}
        onDisconnect={() => client.disconnect()}
        onToggleMic={() => {
          client.setMicEnabled(!micOn);
          setMicOn(!micOn);
        }}
        onSend={(text) => client.sendText(text)}
        onCheckWork={() => void bridgeRef.current?.checkMyWork()}
        onDemo={runDemo}
      />
    </div>
  );
}
