const PATHS: Record<string, string> = {
  pen: 'M4 20l4-1L19 8l-3-3L5 16l-1 4zM14 7l3 3',
  highlighter: 'M9 14l-4 4v2h6l2-2M9 14l7-7 3 3-7 7-3-3z',
  eraser: 'M8 20h12M4.5 15.5l9-9 5 5-6.5 6.5H8.5l-4-2.5z',
  text: 'M5 7V5h14v2M12 5v14M9 19h6',
  rectangle: 'M4 6h16v12H4z',
  ellipse: 'M12 6c4.4 0 8 2.7 8 6s-3.6 6-8 6-8-2.7-8-6 3.6-6 8-6z',
  line: 'M5 19L19 5',
  arrow: 'M5 19L19 5M11 5h8v8',
  select: 'M6 3l12 7-5.5 1.5L10 17z',
  pan: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3',
  micOff: 'M3 3l18 18M9 9v3a3 3 0 005 2.2M15 9.3V6a3 3 0 00-5.8-1M5 11a7 7 0 0011.5 5.4M19 11a7 7 0 01-.7 3M12 18v3',
  check: 'M4 12l5 5L20 6',
  send: 'M4 12l16-8-6 16-2-7-8-1z',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2',
  stop: 'M6 6h12v12H6z',
};

export function Icon({ name, size = 20 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
