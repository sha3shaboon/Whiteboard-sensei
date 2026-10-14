import { useEffect, useState } from 'react';

interface Health {
  ok: boolean;
  realtimeConfigured: boolean;
}

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json() as Promise<Health>)
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  return (
    <div className="layout">
      <main className="board-area">
        <p className="placeholder">Whiteboard goes here (Stage 1)</p>
      </main>
      <aside className="chat-panel">
        <header>Chat</header>
        <div className="messages">
          <p className="placeholder">Voice and chat transcript go here (Stage 2)</p>
        </div>
        <footer className="status">
          Server: {error ? 'unreachable' : health ? 'ok' : '…'}
          {health && !health.realtimeConfigured && ' · OPENAI_API_KEY not set'}
        </footer>
      </aside>
    </div>
  );
}
