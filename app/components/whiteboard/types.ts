export type WhiteboardTool =
  | "select"
  | "pan"
  | "pen"
  | "brush"
  | "highlighter"
  | "eraser"
  | "laser"
  | "rect"
  | "square"
  | "circle"
  | "triangle"
  | "line"
  | "arrow"
  | "star";

export type ShapeType =
  | "pen"
  | "brush"
  | "highlighter"
  | "eraser"
  | "rect"
  | "square"
  | "circle"
  | "triangle"
  | "line"
  | "arrow"
  | "star";

export interface BaseShape {
  id: string;
  type: ShapeType;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  fill?: string;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  draggable?: boolean;
}

export interface LineShape extends BaseShape {
  type: "pen" | "brush" | "highlighter" | "eraser" | "line";
  points: number[];
  tension?: number;
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "miter" | "round" | "bevel";
  globalCompositeOperation?: GlobalCompositeOperation;
}

export interface RectShape extends BaseShape {
  type: "rect" | "square";
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius?: number;
}

export interface CircleShape extends BaseShape {
  type: "circle";
  x: number;
  y: number;
  radius: number;
}

export interface TriangleShape extends BaseShape {
  type: "triangle";
  x: number;
  y: number;
  radius: number;
  sides?: number;
}

export interface ArrowShape extends BaseShape {
  type: "arrow";
  points: number[];
  pointerLength?: number;
  pointerWidth?: number;
}

export interface StarShape extends BaseShape {
  type: "star";
  x: number;
  y: number;
  numPoints?: number;
  innerRadius: number;
  outerRadius: number;
}

export type WhiteboardShape =
  | LineShape
  | RectShape
  | CircleShape
  | TriangleShape
  | ArrowShape
  | StarShape;

export interface WhiteboardPage {
  id: string;
  shapes: WhiteboardShape[];
  history: WhiteboardShape[][];
  redoHistory: WhiteboardShape[][];
}
