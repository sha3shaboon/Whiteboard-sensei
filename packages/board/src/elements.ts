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
export type ArrowElement = ElementBase<
  'arrow',
  {
    from: Point;
    to: Point;
    /** Corner points of a right-angle path. */
    via?: Point[];
    /** Control point of a curved (quadratic) arrow. */
    control?: Point;
    color: string;
    label?: string;
  }
>;
export interface PlotPoint {
  x: number;
  y: number;
  label?: string;
}
export type GraphElement = ElementBase<
  'graph',
  { functions: { expression: string; color: string }[]; xRange: [number, number]; points?: PlotPoint[]; title?: string }
>;
export type StructureElement = ElementBase<'structure', import('./structure').StructureContent>;
/** Free-form illustration: sanitized SVG drawn in stroke by stroke (see view/sketch.ts). */
export type SketchElement = ElementBase<
  'sketch',
  {
    svg: string;
    vw: number;
    vh: number;
    prefix: string;
    parts: string[];
    title?: string;
    /** How it was made: free SVG, a computed geometry figure, or stroke-order data. */
    kind?: 'svg' | 'geometry' | 'strokes' | 'map' | 'molecule' | 'chart' | 'timeline';
    /** Source data for regenerating (geometry spec / stroke data), kept so updates can rebuild it. */
    source?: unknown;
    /** Attribution shown under the drawing (e.g. stroke data license). */
    credit?: string;
    /** Stroke-order drawings: how many strokes are revealed. */
    shownStrokes?: number;
  }
>;
/** A real picture (photo, painting, scan, diagram) from an openly licensed source, always credited. */
export type ImageElement = ElementBase<
  'image',
  {
    url: string;
    /** Natural size, for the aspect ratio. */
    width: number;
    height: number;
    title?: string;
    caption?: string;
    author: string;
    license: string;
    licenseUrl?: string;
    /** Page the image comes from. */
    source: string;
    provider: string;
    /** Other results for the same search, so the tutor can swap to a better one. */
    alternatives?: unknown[];
  }
>;
export type TableElement = ElementBase<'table', { headers: string[]; rows: string[][]; color: string; title?: string }>;
/** Clickable multiple-choice card. `selected` is set by the student. */
export type ChoiceElement = ElementBase<'choice', { question: string; choices: string[]; selected?: number }>;
/** Dashed box the student answers in, with a Done button. `submissions` counts presses of Done. */
export type AnswerElement = ElementBase<'answer', { prompt?: string; question?: ElementId; submissions?: number }>;
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
  | TableElement
  | StructureElement
  | SketchElement
  | ImageElement
  | ChoiceElement
  | AnswerElement
  | AnnotationElement;

export type ElementType = BoardElement['type'];

export const COLORS = {
  studentInk: '#1c1c1a',
  aiInk: '#2563eb',
  highlighter: 'rgba(250, 204, 21, 0.4)',
  annotation: '#dc2626',
  /** Extra curve colors for multi-function graphs. */
  series: ['#2563eb', '#dc2626', '#16a34a', '#9333ea'],
} as const;
