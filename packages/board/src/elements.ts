// Element model: the single source of truth for rendering, AI events,
// AI commands, undo/redo and persistence. See spec § Whiteboard.

/** Short numeric strings ("12") so the AI can refer to elements as "#12". */
export type ElementId = string;
export type Author = 'student' | 'ai';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface StrokePoint extends Point {
  /** 0..1 from PointerEvent.pressure; 0.5 for devices without pressure. */
  pressure: number;
}

/** Part of an element, as fractions of its bounding box (0..1 on each axis). */
export interface Region {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
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

export type StrokeElement = ElementBase<
  'stroke',
  {
    points: StrokePoint[];
    color: string;
    width: number;
    highlighter?: boolean;
    /** Text/LaTeX read from this stroke's handwriting group, once recognized. */
    recognized?: string;
  }
>;
export type TextElement = ElementBase<'text', { text: string; fontSize: number; color: string }>;
export type MathElement = ElementBase<'math', { latex: string; fontSize: number; color: string }>;
export type ShapeElement = ElementBase<'shape', { shape: 'rectangle' | 'ellipse' | 'line'; color: string; label?: string; /** Line runs bottom-left to top-right. */ flip?: boolean }>;
export type ArrowElement = ElementBase<'arrow', { from: Point; to: Point; color: string; label?: string }>;
export type GraphElement = ElementBase<'graph', { expression: string; xRange: [number, number]; color: string }>;
export type CodeElement = ElementBase<'code', { language: string; code: string }>;
export type AnnotationElement = ElementBase<
  'annotation',
  { target: ElementId; mode: 'highlight' | 'circle' | 'point'; region: Region; color: string; note?: string }
>;

export type BoardElement =
  | StrokeElement
  | TextElement
  | MathElement
  | ShapeElement
  | ArrowElement
  | GraphElement
  | CodeElement
  | AnnotationElement;

export type ElementType = BoardElement['type'];

export const COLORS = {
  studentInk: '#1c1c1a',
  aiInk: '#2563eb',
  highlighter: 'rgba(250, 204, 21, 0.4)',
  annotation: '#dc2626',
} as const;
