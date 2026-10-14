// Element model: the single source of truth for rendering, AI events,
// AI commands, undo/redo and persistence. See spec § Whiteboard.

export type ElementId = string;
export type Author = 'student' | 'ai';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StrokePoint {
  x: number;
  y: number;
  /** 0..1 from PointerEvent.pressure; 0.5 for devices without pressure. */
  pressure: number;
}

interface ElementBase<T extends string, C> {
  id: ElementId;
  type: T;
  author: Author;
  bounds: Bounds;
  content: C;
  createdAt: number;
  updatedAt: number;
}

export type StrokeElement = ElementBase<'stroke', { points: StrokePoint[]; color: string; width: number; highlighter?: boolean }>;
export type TextElement = ElementBase<'text', { text: string }>;
export type MathElement = ElementBase<'math', { latex: string }>;
export type ShapeElement = ElementBase<'shape', { shape: 'rectangle' | 'ellipse' | 'line' }>;
export type ArrowElement = ElementBase<'arrow', { from: ElementId | { x: number; y: number }; to: ElementId | { x: number; y: number } }>;
export type GraphElement = ElementBase<'graph', { expression: string; xRange: [number, number] }>;
export type CodeElement = ElementBase<'code', { language: string; code: string }>;
export type HighlightElement = ElementBase<'highlight', { target: ElementId; mode: 'highlight' | 'circle' | 'point' }>;

export type BoardElement =
  | StrokeElement
  | TextElement
  | MathElement
  | ShapeElement
  | ArrowElement
  | GraphElement
  | CodeElement
  | HighlightElement;

export type ElementType = BoardElement['type'];
