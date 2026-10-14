import type { Tool } from '@ai-tutor/board/view';
import { Icon } from './Icon';

const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: 'pen', label: 'Pen', key: 'P' },
  { tool: 'highlighter', label: 'Highlighter', key: 'H' },
  { tool: 'eraser', label: 'Eraser', key: 'E' },
  { tool: 'text', label: 'Text', key: 'T' },
  { tool: 'rectangle', label: 'Rectangle', key: 'R' },
  { tool: 'ellipse', label: 'Ellipse', key: 'O' },
  { tool: 'line', label: 'Line', key: 'L' },
  { tool: 'arrow', label: 'Arrow', key: 'A' },
  { tool: 'select', label: 'Select and move', key: 'V' },
  { tool: 'pan', label: 'Pan', key: 'Space' },
];

export const TOOL_KEYS: Record<string, Tool> = Object.fromEntries(TOOLS.filter((t) => t.key.length === 1).map((t) => [t.key.toLowerCase(), t.tool]));

interface Props {
  tool: Tool;
  onTool(tool: Tool): void;
  onUndo(): void;
  onRedo(): void;
  canUndo: boolean;
  canRedo: boolean;
}

export function Toolbar({ tool, onTool, onUndo, onRedo, canUndo, canRedo }: Props) {
  return (
    <div className="toolbar" role="toolbar" aria-label="Whiteboard tools">
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          className={`tool ${tool === t.tool ? 'active' : ''}`}
          onClick={() => onTool(t.tool)}
          title={`${t.label} (${t.key})`}
          aria-label={t.label}
          aria-pressed={tool === t.tool}
        >
          <Icon name={t.tool} />
        </button>
      ))}
      <span className="divider" />
      <button className="tool" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
        <Icon name="undo" />
      </button>
      <button className="tool" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
        <Icon name="redo" />
      </button>
    </div>
  );
}
