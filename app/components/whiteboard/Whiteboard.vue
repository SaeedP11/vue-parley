<script setup lang="ts">
import {
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  useTemplateRef,
  nextTick,
} from "vue";
import {
  Stage,
  Layer,
  Line,
  Rect,
  Circle,
  RegularPolygon,
  Arrow,
  Star,
  Transformer,
  type VueKonvaRef,
} from "vue-konva";
import Konva from "konva";
import { nanoid } from "nanoid";
import { useResizeObserver, useEventListener } from "@vueuse/core";
import Button from "primevue/button";
import Popover from "primevue/popover";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import Slider from "primevue/slider";
import ToggleSwitch from "primevue/toggleswitch";

import BIcon from "~/components/global/BIcon.vue";
import IconButton from "~/components/general/IconButton.vue";
import WhiteboardRgbPicker from "./WhiteboardRgbPicker.vue";
import type {
  WhiteboardTool,
  WhiteboardShape,
  WhiteboardPage,
  LineShape,
  RectShape,
  CircleShape,
  TriangleShape,
  ArrowShape,
  StarShape,
} from "./types";
import useLocalI18n, { useDirection } from "~/composables/useLocalI18n";
import { callPaintBoard } from "@i18n/locales";
import { useAppToast } from "~/composables/useAppToast";

interface KonvaBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface LaserPoint {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  opacity: number;
  createdAt: number;
}

export interface WhiteboardExposed {
  getStream: (fps?: number) => MediaStream | null;
  downloadImage: (format?: "png" | "jpeg") => void;
  clear: () => void;
  undo: () => void;
  redo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

const props = withDefaults(
  defineProps<{
    initialTool?: WhiteboardTool;
    initialColor?: string;
    initialSize?: number;
    showClose?: boolean;
    maximizable?: boolean;
    streamActive?: boolean;
    allowStream?: boolean;
    showGrid?: boolean;
  }>(),
  {
    initialTool: "pen",
    initialColor: "#2563eb",
    initialSize: 4,
    showClose: false,
    maximizable: false,
    streamActive: false,
    allowStream: true,
    showGrid: true,
  },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "streamStart", stream: MediaStream): void;
  (e: "streamStop"): void;
  (e: "maximize", maximized: boolean): void;
  (e: "fullWindow", fullWindow: boolean): void;
}>();

const { t } = useLocalI18n(callPaintBoard);
const { dir } = useDirection();
const { openToast } = useAppToast();

const containerRef = useTemplateRef<HTMLDivElement>("containerRef");
const stageRef = ref<VueKonvaRef<Konva.Stage> | null>(null);
const shapesLayerRef = ref<VueKonvaRef<Konva.Layer> | null>(null);
const scratchLayerRef = ref<VueKonvaRef<Konva.Layer> | null>(null);
const laserLayerRef = ref<VueKonvaRef<Konva.Layer> | null>(null);
const transformerRef = ref<VueKonvaRef<Konva.Transformer> | null>(null);

const shapesPopoverRef = useTemplateRef<InstanceType<typeof Popover>>("shapesPopover");
const colorPopoverRef = useTemplateRef<InstanceType<typeof Popover>>("colorPopover");
const fillColorPopoverRef = useTemplateRef<InstanceType<typeof Popover>>("fillColorPopover");
const sizePopoverRef = useTemplateRef<InstanceType<typeof Popover>>("sizePopover");
const pagesMenuRef = useTemplateRef<InstanceType<typeof Menu>>("pagesMenu");

// Canvas Dimensions
const stageSize = reactive({
  width: 800,
  height: 600,
});

// Canvas Pan & Zoom State
const stagePos = reactive({ x: 0, y: 0 });
const stageScale = ref(1);
const isPanning = ref(false);
const panStart = reactive({ x: 0, y: 0 });
const isSpacePressed = ref(false);

useResizeObserver(containerRef, (entries) => {
  const entry = entries[0];
  if (!entry) return;
  const { width, height } = entry.contentRect;
  if (width > 0 && height > 0) {
    stageSize.width = Math.floor(width);
    stageSize.height = Math.floor(height);
    markDirty();
  }
});

// Tool, Size, Color & View State
const currentTool = ref<WhiteboardTool>(props.initialTool);
const strokeColor = ref<string>(props.initialColor);
const strokeWidth = ref<number>(props.initialSize);
const isShapeFilled = ref<boolean>(false);
const fillColor = ref<string>("#93c5fd");
const selectedShapeId = ref<string | null>(null);
const gridVisible = ref<boolean>(props.showGrid);
const isMaximized = ref<boolean>(false);

// Preset colors for quick toolbar switching
const quickColors = [
  "#1e293b",
  "#ef4444",
  "#10b981",
  "#2563eb",
  "#f59e0b",
  "#8b5cf6",
];

const strokeWidthPresets = [2, 4, 8, 14, 24];

// Pages Management
const createEmptyPage = (id = `page-${nanoid(6)}`): WhiteboardPage => ({
  id,
  shapes: [],
  history: [[]],
  redoHistory: [],
});

const pages = ref<WhiteboardPage[]>([createEmptyPage("page-1")]);
const currentPageIndex = ref<number>(0);

const currentPage = computed(() => pages.value[currentPageIndex.value] ?? pages.value[0]);

const currentShapes = computed<WhiteboardShape[]>({
  get: () => currentPage.value.shapes,
  set: (val: WhiteboardShape[]) => {
    currentPage.value.shapes = val;
  },
});

const canUndo = computed(() => currentPage.value.history.length > 1);
const canRedo = computed(() => currentPage.value.redoHistory.length > 0);

function pushHistory() {
  const cloned = JSON.parse(JSON.stringify(currentShapes.value));
  currentPage.value.history.push(cloned);
  currentPage.value.redoHistory = [];
  markDirty();
}

function undo() {
  if (!canUndo.value) return;
  const current = currentPage.value.history.pop();
  if (current) {
    currentPage.value.redoHistory.push(current);
  }
  const prev = currentPage.value.history[currentPage.value.history.length - 1];
  if (prev) {
    currentPage.value.shapes = JSON.parse(JSON.stringify(prev));
  }
  selectedShapeId.value = null;
  detachTransformer();
  markDirty();
}

function redo() {
  if (!canRedo.value) return;
  const next = currentPage.value.redoHistory.pop();
  if (next) {
    currentPage.value.history.push(JSON.parse(JSON.stringify(next)));
    currentPage.value.shapes = JSON.parse(JSON.stringify(next));
  }
  selectedShapeId.value = null;
  detachTransformer();
  markDirty();
}

function clear() {
  if (currentShapes.value.length === 0) return;
  currentShapes.value = [];
  pushHistory();
  selectedShapeId.value = null;
  detachTransformer();
  markDirty();
}

function addPage() {
  const newPage = createEmptyPage();
  pages.value.push(newPage);
  currentPageIndex.value = pages.value.length - 1;
  selectedShapeId.value = null;
  detachTransformer();
  markDirty();
}

function removePage(index: number) {
  if (pages.value.length <= 1) {
    clear();
    return;
  }
  pages.value.splice(index, 1);
  if (currentPageIndex.value >= pages.value.length) {
    currentPageIndex.value = pages.value.length - 1;
  }
  selectedShapeId.value = null;
  detachTransformer();
  markDirty();
}

const pageMenuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = pages.value.map((p, idx) => ({
    label: t("board.page", { page: idx + 1 }),
    phIcon: idx === currentPageIndex.value ? "PhCheck" : "PhFile",
    command: () => {
      currentPageIndex.value = idx;
      selectedShapeId.value = null;
      detachTransformer();
      markDirty();
    },
  }));
  items.push({ separator: true });
  items.push({
    label: t("board.addPage"),
    phIcon: "PhPlus",
    command: () => addPage(),
  });
  if (pages.value.length > 1) {
    items.push({
      label: t("board.erase"),
      phIcon: "PhTrash",
      command: () => removePage(currentPageIndex.value),
    });
  }
  return items;
});

// Selection & Transformer
function attachTransformer(node: Konva.Node) {
  const tr = transformerRef.value?.getNode();
  if (!tr) return;
  tr.nodes([node]);
  tr.getLayer()?.batchDraw();
  markDirty();
}

function detachTransformer() {
  const tr = transformerRef.value?.getNode();
  if (tr) {
    tr.nodes([]);
    tr.getLayer()?.batchDraw();
    markDirty();
  }
}

function deleteSelected() {
  if (!selectedShapeId.value) return;
  currentShapes.value = currentShapes.value.filter((s) => s.id !== selectedShapeId.value);
  selectedShapeId.value = null;
  detachTransformer();
  pushHistory();
}

// Drawing & Laser States
const isDrawing = ref(false);
const drawingShape = ref<WhiteboardShape | null>(null);
const startPos = reactive({ x: 0, y: 0 });

// Laser pointer
const laserPoints = ref<LaserPoint[]>([]);
let laserTimer: ReturnType<typeof setInterval> | null = null;
const isLaserActive = computed(() => laserPoints.value.length > 0);

function addLaserPoint(x: number, y: number) {
  laserPoints.value.push({
    id: nanoid(6),
    x,
    y,
    radius: Math.max(5, strokeWidth.value * 1.5),
    color: strokeColor.value || "#ef4444",
    opacity: 1,
    createdAt: Date.now(),
  });
  markDirty();
  if (!laserTimer) {
    laserTimer = setInterval(updateLaser, 35);
  }
}

function updateLaser() {
  const now = Date.now();
  const updated: LaserPoint[] = [];
  for (const pt of laserPoints.value) {
    const age = now - pt.createdAt;
    if (age < 1200) {
      pt.opacity = Math.max(0, 1 - age / 1200);
      updated.push(pt);
    }
  }
  laserPoints.value = updated;
  if (updated.length === 0 && laserTimer) {
    clearInterval(laserTimer);
    laserTimer = null;
  }
  markDirty();
}

function getRelativePointerPosition(): { x: number; y: number } | null {
  const stage = stageRef.value?.getStage();
  if (!stage) return null;
  const transform = stage.getAbsoluteTransform().copy();
  transform.invert();
  const pos = stage.getPointerPosition();
  if (!pos) return null;
  return transform.point(pos);
}

function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
  // Pan mode (or Spacebar held)
  if (currentTool.value === "pan" || isSpacePressed.value) {
    isPanning.value = true;
    const stage = stageRef.value?.getStage();
    const pointer = stage?.getPointerPosition();
    if (pointer) {
      panStart.x = pointer.x - stagePos.x;
      panStart.y = pointer.y - stagePos.y;
    }
    return;
  }

  // Laser tool
  if (currentTool.value === "laser") {
    const pos = getRelativePointerPosition();
    if (pos) {
      addLaserPoint(pos.x, pos.y);
    }
    return;
  }

  // Select tool
  if (currentTool.value === "select") {
    const clickedOnStage = e.target === e.target.getStage() || e.target.hasName("bg-rect");
    if (clickedOnStage) {
      selectedShapeId.value = null;
      detachTransformer();
    }
    return;
  }

  // Drawing tools
  isDrawing.value = true;
  const pos = getRelativePointerPosition();
  if (!pos) return;
  startPos.x = pos.x;
  startPos.y = pos.y;

  const id = `shape-${nanoid(8)}`;
  const tool = currentTool.value;

  if (tool === "pen" || tool === "brush" || tool === "highlighter" || tool === "eraser") {
    let strokeW = strokeWidth.value;
    let strokeC = strokeColor.value;
    let opacity = 1;
    let tension = 0.5;
    let lineCap: "round" | "butt" | "square" = "round";
    let lineJoin: "round" | "bevel" | "miter" = "round";

    if (tool === "brush") {
      strokeW = Math.max(8, strokeWidth.value * 2.2);
    } else if (tool === "highlighter") {
      strokeW = Math.max(16, strokeWidth.value * 3.5);
      opacity = 0.35;
      lineCap = "square";
    } else if (tool === "eraser") {
      strokeW = Math.max(14, strokeWidth.value * 3);
    }

    drawingShape.value = {
      id,
      type: tool,
      points: [pos.x, pos.y, pos.x, pos.y],
      stroke: strokeC,
      strokeWidth: strokeW,
      opacity,
      tension,
      lineCap,
      lineJoin,
    } as LineShape;
  } else if (tool === "line") {
    drawingShape.value = {
      id,
      type: "line",
      points: [pos.x, pos.y, pos.x, pos.y],
      stroke: strokeColor.value,
      strokeWidth: strokeWidth.value,
      opacity: 1,
      tension: 0,
      lineCap: "round",
      lineJoin: "round",
    } as LineShape;
  } else if (tool === "rect" || tool === "square") {
    drawingShape.value = {
      id,
      type: tool,
      x: pos.x,
      y: pos.y,
      width: 0,
      height: 0,
      stroke: strokeColor.value,
      strokeWidth: strokeWidth.value,
      fill: isShapeFilled.value ? fillColor.value : undefined,
      opacity: 1,
    } as RectShape;
  } else if (tool === "circle") {
    drawingShape.value = {
      id,
      type: "circle",
      x: pos.x,
      y: pos.y,
      radius: 0,
      stroke: strokeColor.value,
      strokeWidth: strokeWidth.value,
      fill: isShapeFilled.value ? fillColor.value : undefined,
      opacity: 1,
    } as CircleShape;
  } else if (tool === "triangle") {
    drawingShape.value = {
      id,
      type: "triangle",
      x: pos.x,
      y: pos.y,
      radius: 0,
      sides: 3,
      stroke: strokeColor.value,
      strokeWidth: strokeWidth.value,
      fill: isShapeFilled.value ? fillColor.value : undefined,
      opacity: 1,
    } as TriangleShape;
  } else if (tool === "arrow") {
    drawingShape.value = {
      id,
      type: "arrow",
      points: [pos.x, pos.y, pos.x, pos.y],
      pointerLength: Math.max(10, strokeWidth.value * 3),
      pointerWidth: Math.max(10, strokeWidth.value * 3),
      stroke: strokeColor.value,
      fill: strokeColor.value,
      strokeWidth: strokeWidth.value,
      opacity: 1,
    } as ArrowShape;
  } else if (tool === "star") {
    drawingShape.value = {
      id,
      type: "star",
      x: pos.x,
      y: pos.y,
      numPoints: 5,
      innerRadius: 0,
      outerRadius: 0,
      stroke: strokeColor.value,
      strokeWidth: strokeWidth.value,
      fill: isShapeFilled.value ? fillColor.value : undefined,
      opacity: 1,
    } as StarShape;
  }

  markDirty();
}

function handleStageMouseMove() {
  // Pan in progress
  if (isPanning.value) {
    const stage = stageRef.value?.getStage();
    const pointer = stage?.getPointerPosition();
    if (pointer) {
      stagePos.x = pointer.x - panStart.x;
      stagePos.y = pointer.y - panStart.y;
      markDirty();
    }
    return;
  }

  // Laser in progress
  if (currentTool.value === "laser") {
    const pos = getRelativePointerPosition();
    if (pos) {
      addLaserPoint(pos.x, pos.y);
    }
    return;
  }

  if (!isDrawing.value || !drawingShape.value) return;
  const pos = getRelativePointerPosition();
  if (!pos) return;

  const shape = drawingShape.value;
  const tool = currentTool.value;

  if (tool === "pen" || tool === "brush" || tool === "highlighter" || tool === "eraser") {
    const line = shape as LineShape;
    const pts = line.points;
    const lastX = pts[pts.length - 2];
    const lastY = pts[pts.length - 1];
    const distSq = (pos.x - lastX) ** 2 + (pos.y - lastY) ** 2;
    // Point distance threshold (at least 3px delta) to prevent point flooding
    if (distSq >= 9) {
      line.points.push(pos.x, pos.y);
      markDirty();
    }
  } else if (tool === "line") {
    const line = shape as LineShape;
    line.points = [startPos.x, startPos.y, pos.x, pos.y];
    markDirty();
  } else if (tool === "arrow") {
    const arrow = shape as ArrowShape;
    arrow.points = [startPos.x, startPos.y, pos.x, pos.y];
    markDirty();
  } else if (tool === "rect") {
    const rect = shape as RectShape;
    rect.x = Math.min(startPos.x, pos.x);
    rect.y = Math.min(startPos.y, pos.y);
    rect.width = Math.abs(pos.x - startPos.x);
    rect.height = Math.abs(pos.y - startPos.y);
    markDirty();
  } else if (tool === "square") {
    const rect = shape as RectShape;
    const side = Math.max(Math.abs(pos.x - startPos.x), Math.abs(pos.y - startPos.y));
    rect.x = pos.x < startPos.x ? startPos.x - side : startPos.x;
    rect.y = pos.y < startPos.y ? startPos.y - side : startPos.y;
    rect.width = side;
    rect.height = side;
    markDirty();
  } else if (tool === "circle") {
    const circle = shape as CircleShape;
    const dx = pos.x - startPos.x;
    const dy = pos.y - startPos.y;
    circle.radius = Math.round(Math.sqrt(dx * dx + dy * dy));
    markDirty();
  } else if (tool === "triangle") {
    const tri = shape as TriangleShape;
    const dx = pos.x - startPos.x;
    const dy = pos.y - startPos.y;
    tri.radius = Math.round(Math.sqrt(dx * dx + dy * dy));
    markDirty();
  } else if (tool === "star") {
    const star = shape as StarShape;
    const dx = pos.x - startPos.x;
    const dy = pos.y - startPos.y;
    const outer = Math.round(Math.sqrt(dx * dx + dy * dy));
    star.outerRadius = outer;
    star.innerRadius = Math.round(outer * 0.45);
    markDirty();
  }
}

function handleStageMouseUp() {
  if (isPanning.value) {
    isPanning.value = false;
    markDirty();
    return;
  }

  if (!isDrawing.value) return;
  isDrawing.value = false;

  if (drawingShape.value) {
    let isValid = true;
    const s = drawingShape.value;
    if (s.type === "rect" || s.type === "square") {
      if ((s as RectShape).width < 3 && (s as RectShape).height < 3) isValid = false;
    } else if (s.type === "circle") {
      if ((s as CircleShape).radius < 3) isValid = false;
    } else if (s.type === "triangle") {
      if ((s as TriangleShape).radius < 3) isValid = false;
    } else if (s.type === "star") {
      if ((s as StarShape).outerRadius < 3) isValid = false;
    }

    if (isValid) {
      currentShapes.value.push(JSON.parse(JSON.stringify(drawingShape.value)));
      pushHistory();
    }
    drawingShape.value = null;
  }
  markDirty();
}

function handleShapeClick(id: string) {
  if (currentTool.value !== "select") return;
  selectedShapeId.value = id;
  const stage = stageRef.value?.getStage();
  if (!stage) return;
  const node = stage.findOne(`#${id}`);
  if (node) {
    attachTransformer(node);
  }
}

function handleShapeDragEnd(id: string, e: Konva.KonvaEventObject<DragEvent>) {
  const shape = currentShapes.value.find((s) => s.id === id);
  if (!shape) return;
  shape.x = e.target.x();
  shape.y = e.target.y();
  pushHistory();
  markDirty();
}

function handleShapeTransformEnd(id: string, e: Konva.KonvaEventObject<Event>) {
  const node = e.target;
  const shape = currentShapes.value.find((s) => s.id === id);
  if (!shape) return;

  shape.x = node.x();
  shape.y = node.y();
  shape.rotation = node.rotation();

  const scaleX = node.scaleX();
  const scaleY = node.scaleY();
  node.scaleX(1);
  node.scaleY(1);

  if (shape.type === "rect" || shape.type === "square") {
    const r = shape as RectShape;
    r.width = Math.max(5, r.width * scaleX);
    r.height = Math.max(5, r.height * scaleY);
  } else if (shape.type === "circle") {
    const c = shape as CircleShape;
    c.radius = Math.max(5, c.radius * Math.max(scaleX, scaleY));
  } else if (shape.type === "triangle") {
    const tri = shape as TriangleShape;
    tri.radius = Math.max(5, tri.radius * Math.max(scaleX, scaleY));
  } else if (shape.type === "star") {
    const star = shape as StarShape;
    star.outerRadius = Math.max(8, star.outerRadius * Math.max(scaleX, scaleY));
    star.innerRadius = Math.max(4, star.innerRadius * Math.max(scaleX, scaleY));
  }
  pushHistory();
  markDirty();
}

// Wheel Zoom
function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
  if (e.evt.ctrlKey || e.evt.metaKey || currentTool.value === "pan") {
    e.evt.preventDefault();
    const stage = stageRef.value?.getStage();
    if (!stage) return;
    const oldScale = stageScale.value;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.08;
    const newScale = e.evt.deltaY < 0 ? Math.min(4, oldScale * scaleBy) : Math.max(0.25, oldScale / scaleBy);

    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };

    stageScale.value = newScale;
    stagePos.x = pointer.x - mousePointTo.x * newScale;
    stagePos.y = pointer.y - mousePointTo.y * newScale;
    markDirty();
  }
}

const zoomIn = () => {
  setZoom(Math.min(4, stageScale.value * 1.25));
};
const zoomOut = () => {
  setZoom(Math.max(0.25, stageScale.value / 1.25));
};
const resetZoom = () => {
  stageScale.value = 1;
  stagePos.x = 0;
  stagePos.y = 0;
  markDirty();
};
const setZoom = (nextScale: number) => {
  const center = {
    x: stageSize.width / 2,
    y: stageSize.height / 2,
  };
  const mousePointTo = {
    x: (center.x - stagePos.x) / stageScale.value,
    y: (center.y - stagePos.y) / stageScale.value,
  };
  stageScale.value = nextScale;
  stagePos.x = center.x - mousePointTo.x * nextScale;
  stagePos.y = center.y - mousePointTo.y * nextScale;
  markDirty();
};

function selectStrokeColor(color: string) {
  strokeColor.value = color;
  if (selectedShape.value) {
    selectedShape.value.stroke = color;
    pushHistory();
  }
  markDirty();
}

// Konva Shape Configs
function getLineConfig(item: LineShape) {
  const isSelected = selectedShapeId.value === item.id;
  const isEraser = item.type === "eraser";

  return {
    id: item.id,
    points: item.points,
    stroke: item.stroke,
    strokeWidth: item.strokeWidth,
    opacity: item.opacity ?? 1,
    tension: item.tension ?? 0.5,
    lineCap: item.lineCap ?? "round",
    lineJoin: item.lineJoin ?? "round",
    draggable: currentTool.value === "select" && !isEraser,
    globalCompositeOperation: isEraser ? "destination-out" : "source-over",
    shadowColor: isSelected ? "#3b82f6" : undefined,
    shadowBlur: isSelected ? 8 : 0,
    listening: !isEraser,
  };
}

function getRectConfig(item: RectShape) {
  const isSelected = selectedShapeId.value === item.id;
  return {
    id: item.id,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    stroke: item.stroke,
    strokeWidth: item.strokeWidth,
    fill: item.fill,
    opacity: item.opacity ?? 1,
    rotation: item.rotation ?? 0,
    draggable: currentTool.value === "select",
    shadowColor: isSelected ? "#3b82f6" : undefined,
    shadowBlur: isSelected ? 8 : 0,
  };
}

function getCircleConfig(item: CircleShape) {
  const isSelected = selectedShapeId.value === item.id;
  return {
    id: item.id,
    x: item.x,
    y: item.y,
    radius: item.radius,
    stroke: item.stroke,
    strokeWidth: item.strokeWidth,
    fill: item.fill,
    opacity: item.opacity ?? 1,
    rotation: item.rotation ?? 0,
    draggable: currentTool.value === "select",
    shadowColor: isSelected ? "#3b82f6" : undefined,
    shadowBlur: isSelected ? 8 : 0,
  };
}

function getTriangleConfig(item: TriangleShape) {
  const isSelected = selectedShapeId.value === item.id;
  return {
    id: item.id,
    x: item.x,
    y: item.y,
    sides: 3,
    radius: item.radius,
    stroke: item.stroke,
    strokeWidth: item.strokeWidth,
    fill: item.fill,
    opacity: item.opacity ?? 1,
    rotation: item.rotation ?? 0,
    draggable: currentTool.value === "select",
    shadowColor: isSelected ? "#3b82f6" : undefined,
    shadowBlur: isSelected ? 8 : 0,
  };
}

function getArrowConfig(item: ArrowShape) {
  const isSelected = selectedShapeId.value === item.id;
  return {
    id: item.id,
    points: item.points,
    pointerLength: item.pointerLength,
    pointerWidth: item.pointerWidth,
    stroke: item.stroke,
    fill: item.fill,
    strokeWidth: item.strokeWidth,
    opacity: item.opacity ?? 1,
    draggable: currentTool.value === "select",
    shadowColor: isSelected ? "#3b82f6" : undefined,
    shadowBlur: isSelected ? 8 : 0,
  };
}

function getStarConfig(item: StarShape) {
  const isSelected = selectedShapeId.value === item.id;
  return {
    id: item.id,
    x: item.x,
    y: item.y,
    numPoints: item.numPoints,
    innerRadius: item.innerRadius,
    outerRadius: item.outerRadius,
    stroke: item.stroke,
    strokeWidth: item.strokeWidth,
    fill: item.fill,
    opacity: item.opacity ?? 1,
    rotation: item.rotation ?? 0,
    draggable: currentTool.value === "select",
    shadowColor: isSelected ? "#3b82f6" : undefined,
    shadowBlur: isSelected ? 8 : 0,
  };
}

// Download Image with unzoomed high-res export
function downloadImage(format: "png" | "jpeg" = "png") {
  const stage = stageRef.value?.getStage();
  if (!stage) return;

  detachTransformer();

  const prevPos = { x: stagePos.x, y: stagePos.y };
  const prevScale = stageScale.value;

  // Temporarily reset transform for clean high-res export
  stage.position({ x: 0, y: 0 });
  stage.scale({ x: 1, y: 1 });
  stage.batchDraw();

  const dataUrl = stage.toDataURL({
    mimeType: format === "jpeg" ? "image/jpeg" : "image/png",
    quality: 1,
    pixelRatio: 2,
  });

  // Restore transform
  stage.position(prevPos);
  stage.scale({ x: prevScale, y: prevScale });
  stage.batchDraw();
  markDirty();

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `whiteboard-${Date.now()}.${format === "png" ? "png" : "jpg"}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  openToast(t("board.savedSuccessfully"), "success");
}

// Adaptive Framerate & Streaming Engine (Dirty Tracking)
let activeStreamTrack: MediaStreamTrack | null = null;
let activeStream: MediaStream | null = null;
let streamCanvas: HTMLCanvasElement | null = null;
let animFrameId: number | null = null;
let isDirty = true;
let lastFrameTime = 0;
let lastHeartbeatTime = 0;

// 30 FPS while active, 1 FPS heartbeat when static
const ACTIVE_FRAME_INTERVAL = 33;
const IDLE_HEARTBEAT_INTERVAL = 1000;

function markDirty() {
  isDirty = true;
}

function renderCompositedFrame() {
  const stage = stageRef.value?.getStage();
  if (!stage || !streamCanvas) return;
  const ctx = streamCanvas.getContext("2d", { alpha: false });
  if (!ctx) return;

  const stageW = stage.width() || stageSize.width || 1280;
  const stageH = stage.height() || stageSize.height || 720;

  // Stream Resolution Clamping: Max 1920x1080 to prevent encoder overload
  const MAX_W = 1920;
  const MAX_H = 1080;
  const scale = Math.min(1, MAX_W / Math.max(1, stageW), MAX_H / Math.max(1, stageH));
  const targetW = Math.max(320, Math.round(stageW * scale));
  const targetH = Math.max(240, Math.round(stageH * scale));

  if (Math.abs(streamCanvas.width - targetW) > 8 || Math.abs(streamCanvas.height - targetH) > 8) {
    streamCanvas.width = targetW;
    streamCanvas.height = targetH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }

  // Solid white canvas background (opaque for WebRTC codecs)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, streamCanvas.width, streamCanvas.height);

  // Composite drawing layers (excluding selection handles)
  try {
    const layers = stage.getLayers();
    const uiLayer = transformerRef.value?.getNode()?.getLayer();
    for (const layer of layers) {
      if (uiLayer && layer === uiLayer) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layerCanvas = (layer as any).getCanvas?.()?._canvas;
      if (layerCanvas && layerCanvas.width > 0 && layerCanvas.height > 0) {
        ctx.drawImage(layerCanvas, 0, 0, streamCanvas.width, streamCanvas.height);
      }
    }
  } catch {
    const domCanvases = stage.content?.querySelectorAll("canvas") ?? [];
    for (let i = 0; i < domCanvases.length; i++) {
      const c = domCanvases[i];
      if (c && c.width > 0 && c.height > 0) {
        ctx.drawImage(c, 0, 0, streamCanvas.width, streamCanvas.height);
      }
    }
  }

  // Request new WebRTC frame if supported
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (activeStreamTrack && typeof (activeStreamTrack as any).requestFrame === "function") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (activeStreamTrack as any).requestFrame();
    } catch {
      // ignore
    }
  }
}

function startLoop() {
  stopLoop();
  isDirty = true;

  const tick = (now: number) => {
    const elapsedSinceLast = now - lastFrameTime;
    const elapsedSinceHeartbeat = now - lastHeartbeatTime;

    if (isDirty && elapsedSinceLast >= ACTIVE_FRAME_INTERVAL) {
      renderCompositedFrame();
      lastFrameTime = now;
      lastHeartbeatTime = now;
      if (!isDrawing.value && !isPanning.value && laserPoints.value.length === 0) {
        isDirty = false;
      }
    } else if (!isDirty && elapsedSinceHeartbeat >= IDLE_HEARTBEAT_INTERVAL) {
      renderCompositedFrame();
      lastHeartbeatTime = now;
    }

    animFrameId = requestAnimationFrame(tick);
  };

  animFrameId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

function stopActiveStream() {
  stopLoop();
  if (activeStreamTrack) {
    activeStreamTrack.stop();
    activeStreamTrack = null;
  }
  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop());
    activeStream = null;
  }
  if (streamCanvas && streamCanvas.parentNode) {
    streamCanvas.parentNode.removeChild(streamCanvas);
  }
  streamCanvas = null;
}

watch(
  () => props.streamActive,
  (active) => {
    if (!active) {
      stopActiveStream();
    } else if (!activeStreamTrack) {
      const stream = getStream();
      if (stream) emit("streamStart", stream);
    }
  },
);

function getStream(fps = 30): MediaStream | null {
  const stage = stageRef.value?.getStage();
  if (!stage) return null;

  if (!streamCanvas) {
    streamCanvas = document.createElement("canvas");
    streamCanvas.style.position = "fixed";
    streamCanvas.style.left = "-99999px";
    streamCanvas.style.top = "-99999px";
    streamCanvas.style.pointerEvents = "none";
    streamCanvas.style.opacity = "0";
    streamCanvas.style.width = "1px";
    streamCanvas.style.height = "1px";
    document.body.appendChild(streamCanvas);
  }

  const stageW = stage.width() || stageSize.width || 1280;
  const stageH = stage.height() || stageSize.height || 720;
  const MAX_W = 1920;
  const MAX_H = 1080;
  const scale = Math.min(1, MAX_W / Math.max(1, stageW), MAX_H / Math.max(1, stageH));
  streamCanvas.width = Math.max(320, Math.round(stageW * scale));
  streamCanvas.height = Math.max(240, Math.round(stageH * scale));

  startLoop();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvasWithStream = streamCanvas as any;
  const captureFn = canvasWithStream.captureStream || canvasWithStream.mozCaptureStream;
  if (typeof captureFn !== "function") {
    stopActiveStream();
    return null;
  }

  const stream: MediaStream = captureFn.call(canvasWithStream, fps);
  activeStream = stream;
  const track = stream.getVideoTracks()[0];
  if (track) {
    activeStreamTrack = track;
    track.addEventListener("ended", () => {
      stopActiveStream();
      emit("streamStop");
    });
  }

  return stream;
}

function toggleStream() {
  if (props.streamActive) {
    stopActiveStream();
    emit("streamStop");
  } else {
    const stream = getStream();
    if (stream) {
      emit("streamStart", stream);
    }
  }
}

const toggleMaximize = () => {
  isMaximized.value = !isMaximized.value;
  emit("maximize", isMaximized.value);
  emit("fullWindow", isMaximized.value);
  markDirty();
};

// Global Keyboard Shortcuts
useEventListener(window, "keydown", (e: KeyboardEvent) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  if (e.code === "Space" && !isSpacePressed.value) {
    isSpacePressed.value = true;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
    e.preventDefault();
    redo();
    return;
  }

  if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedShapeId.value) {
      e.preventDefault();
      deleteSelected();
    }
    return;
  }

  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === "v") currentTool.value = "select";
    else if (k === "m") currentTool.value = "pan";
    else if (k === "p") currentTool.value = "pen";
    else if (k === "b") currentTool.value = "brush";
    else if (k === "h") currentTool.value = "highlighter";
    else if (k === "e") currentTool.value = "eraser";
    else if (k === "l") currentTool.value = "laser";
  }
});

useEventListener(window, "keyup", (e: KeyboardEvent) => {
  if (e.code === "Space") {
    isSpacePressed.value = false;
    isPanning.value = false;
  }
});

onMounted(() => {
  if (props.streamActive) {
    const s = getStream();
    if (s) emit("streamStart", s);
  }
});

onBeforeUnmount(() => {
  stopActiveStream();
  if (laserTimer) {
    clearInterval(laserTimer);
    laserTimer = null;
  }
});

const selectedShape = computed(() =>
  currentShapes.value.find((s) => s.id === selectedShapeId.value),
);

const isGeometricTool = computed(() => {
  return ["rect", "square", "circle", "triangle", "line", "arrow", "star"].includes(
    currentTool.value,
  );
});

const activeToolLabel = computed(() => {
  const map: Record<string, string> = {
    select: t("board.select"),
    pan: t("board.pan"),
    pen: t("board.pen"),
    brush: t("board.brush"),
    highlighter: t("board.highlighter"),
    eraser: t("board.eraser"),
    laser: t("board.laser"),
    rect: t("board.rectangle"),
    square: t("board.square"),
    circle: t("board.circle"),
    triangle: t("board.triangle"),
    line: t("board.line"),
    arrow: t("board.arrow"),
    star: t("board.star"),
  };
  return map[currentTool.value] || t("board.pen");
});

defineExpose<WhiteboardExposed>({
  getStream,
  downloadImage,
  clear,
  undo,
  redo,
  zoomIn,
  zoomOut,
  resetZoom,
});
</script>

<template>
  <div
    class="flex flex-col select-none relative overflow-hidden bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans"
    :class="[
      isMaximized ? 'fixed inset-0 z-50 w-screen h-screen' : 'h-full w-full',
    ]"
  >
    <!-- Top Header Bar -->
    <header class="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-gray-200/80 dark:border-gray-800/80 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md z-20 gap-2 shrink-0">
      <!-- Left: Title, Undo, Redo, Clear -->
      <div class="flex items-center gap-1 sm:gap-2">
        <IconButton
          v-if="showClose"
          icon="PhX"
          :label="t('board.close')"
          icon-class="size-5"
          @click="emit('close')"
        />

        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <BIcon icon="PhPaintBrush" class="size-4 text-chat-primary" />
          <span class="hidden sm:inline">{{ t("board.title") }}</span>
        </div>

        <div class="h-4 w-[1px] bg-gray-200 dark:bg-gray-800 mx-0.5 sm:mx-1" />

        <!-- History: Undo & Redo -->
        <div class="flex items-center gap-0.5">
          <IconButton
            icon="PhArrowUUpLeft"
            :label="`${t('board.undo')} (Ctrl+Z)`"
            :disabled="!canUndo"
            icon-class="size-4"
            class="hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
            @click="undo"
          />
          <IconButton
            icon="PhArrowUUpRight"
            :label="`${t('board.redo')} (Ctrl+Y)`"
            :disabled="!canRedo"
            icon-class="size-4"
            class="hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
            @click="redo"
          />
        </div>

        <!-- Clear Board -->
        <IconButton
          icon="PhTrash"
          :label="t('board.erase')"
          icon-class="size-4 text-slate-500 hover:text-red-500"
          class="hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="clear"
        />
      </div>

      <!-- Center: Main Drawing Tools Dock -->
      <nav class="flex items-center gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 shadow-xs">
        <!-- Select (V) -->
        <IconButton
          icon="PhCursor"
          :label="`${t('board.select')} (V)`"
          icon-class="size-4"
          class="rounded-xl transition-all"
          :class="currentTool === 'select' ? 'bg-chat-primary text-white shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
          @click="currentTool = 'select'"
        />

        <!-- Pan / Hand (Space / M) -->
        <IconButton
          icon="PhHandPalm"
          :label="`${t('board.pan')} (Space / M)`"
          icon-class="size-4"
          class="rounded-xl transition-all"
          :class="currentTool === 'pan' ? 'bg-chat-primary text-white shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
          @click="currentTool = 'pan'"
        />

        <!-- Pen (P) -->
        <IconButton
          icon="PhPencilSimple"
          :label="`${t('board.pen')} (P)`"
          icon-class="size-4"
          class="rounded-xl transition-all"
          :class="currentTool === 'pen' ? 'bg-chat-primary text-white shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
          @click="currentTool = 'pen'"
        />

        <!-- Brush (B) -->
        <IconButton
          icon="PhPaintBrush"
          :label="`${t('board.brush')} (B)`"
          icon-class="size-4"
          class="rounded-xl transition-all"
          :class="currentTool === 'brush' ? 'bg-chat-primary text-white shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
          @click="currentTool = 'brush'"
        />

        <!-- Highlighter (H) -->
        <IconButton
          icon="PhHighlighterCircle"
          :label="`${t('board.highlighter')} (H)`"
          icon-class="size-4"
          class="rounded-xl transition-all"
          :class="currentTool === 'highlighter' ? 'bg-chat-primary text-white shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
          @click="currentTool = 'highlighter'"
        />

        <!-- Eraser (E) -->
        <IconButton
          icon="PhEraser"
          :label="`${t('board.eraser')} (E)`"
          icon-class="size-4"
          class="rounded-xl transition-all"
          :class="currentTool === 'eraser' ? 'bg-chat-primary text-white shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
          @click="currentTool = 'eraser'"
        />

        <!-- Laser Pointer (L) -->
        <IconButton
          icon="PhCrosshairSimple"
          :label="`${t('board.laser')} (L)`"
          icon-class="size-4"
          class="rounded-xl transition-all"
          :class="currentTool === 'laser' ? 'bg-red-500 text-white shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
          @click="currentTool = 'laser'"
        />

        <div class="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-0.5" />

        <!-- Shapes Popover Button -->
        <Button
          rounded
          text
          size="small"
          :aria-label="t('board.shapes')"
          class="!p-1.5 rounded-xl transition-all"
          :class="isGeometricTool ? 'bg-chat-primary text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
          @click="shapesPopoverRef?.toggle($event)"
        >
          <template #icon>
            <BIcon
              :icon="
                currentTool === 'rect' || currentTool === 'square'
                  ? 'PhSquare'
                  : currentTool === 'circle'
                  ? 'PhCircle'
                  : currentTool === 'triangle'
                  ? 'PhTriangle'
                  : currentTool === 'arrow'
                  ? 'PhArrowUpRight'
                  : currentTool === 'star'
                  ? 'PhStar'
                  : currentTool === 'line'
                  ? 'PhMinus'
                  : 'PhShapes'
              "
              class="size-4"
            />
          </template>
        </Button>
      </nav>

      <!-- Right: Live Badge, Zoom Controls, Stream, Grid Toggle, Export, Maximize -->
      <div class="flex items-center gap-1 sm:gap-1.5">
        <!-- Live HD Status Badge -->
        <div
          v-if="streamActive"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold select-none shadow-xs"
          :title="t('board.streaming')"
        >
          <span class="size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>{{ t("board.liveHd") }}</span>
        </div>

        <!-- Zoom Controls -->
        <div class="hidden sm:flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 border border-slate-200/80 dark:border-slate-700/80">
          <button
            type="button"
            class="size-6 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold text-xs cursor-pointer transition-colors"
            :title="t('board.zoomOut')"
            :disabled="stageScale <= 0.25"
            @click="zoomOut"
          >
            −
          </button>
          <button
            type="button"
            class="px-1.5 h-6 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-mono text-[11px] font-medium flex items-center justify-center cursor-pointer transition-colors"
            :title="t('board.resetZoom')"
            @click="resetZoom"
          >
            {{ Math.round(stageScale * 100) }}%
          </button>
          <button
            type="button"
            class="size-6 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center font-bold text-xs cursor-pointer transition-colors"
            :title="t('board.zoomIn')"
            :disabled="stageScale >= 4"
            @click="zoomIn"
          >
            +
          </button>
        </div>

        <!-- Stream / Share to Call Button -->
        <Button
          v-if="allowStream"
          rounded
          size="small"
          :severity="streamActive ? 'danger' : 'primary'"
          class="!px-2.5 !py-1 text-xs font-semibold gap-1.5 transition-all shadow-xs"
          data-testid="whiteboard-stream-btn"
          @click="toggleStream"
        >
          <template #icon>
            <BIcon :icon="streamActive ? 'PhStopCircle' : 'PhBroadcast'" class="size-4" />
          </template>
          <span>{{ streamActive ? t('board.stopSharing') : t('board.shareToCall') }}</span>
        </Button>

        <!-- Grid Toggle -->
        <IconButton
          icon="PhGridFour"
          :label="t('board.grid')"
          icon-class="size-4"
          class="rounded-xl transition-all"
          :class="gridVisible ? 'bg-slate-100 dark:bg-slate-800 text-chat-primary font-bold' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'"
          @click="gridVisible = !gridVisible"
        />

        <!-- Export PNG -->
        <IconButton
          icon="PhDownloadSimple"
          :label="t('board.save')"
          icon-class="size-4 text-slate-700 dark:text-slate-200"
          class="hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="downloadImage('png')"
        />

        <!-- Full Window / Restore Button -->
        <IconButton
          v-if="maximizable"
          :icon="isMaximized ? 'PhCornersIn' : 'PhCornersOut'"
          :label="isMaximized ? t('board.exitFullWindow') : t('board.fullWindow')"
          icon-class="size-4 text-slate-700 dark:text-slate-200"
          class="hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="toggleMaximize"
        />
      </div>
    </header>

    <!-- Contextual Floating Properties Bar (Properties Island) -->
    <div
      v-if="currentTool !== 'eraser' && currentTool !== 'pan'"
      class="absolute top-14 left-1/2 -translate-x-1/2 z-10 flex flex-wrap items-center justify-center gap-2 px-3 py-1.5 rounded-2xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-md shadow-md border border-slate-200/80 dark:border-slate-700/80 text-xs transition-all max-w-[95vw]"
    >
      <!-- Stroke Color: Active Swatch + Popover trigger -->
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          :title="t('board.strokeColor')"
          class="size-6 rounded-full border-2 border-white dark:border-slate-800 ring-2 ring-chat-primary/40 shadow-xs flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
          :style="{ backgroundColor: strokeColor }"
          @click="colorPopoverRef?.toggle($event)"
        />

        <!-- Quick Color Palette Dots -->
        <div class="flex items-center gap-1">
          <button
            v-for="c in quickColors"
            :key="c"
            type="button"
            class="size-4.5 rounded-full border border-black/10 dark:border-white/10 transition-transform hover:scale-110 cursor-pointer"
            :class="{ 'ring-2 ring-chat-primary ring-offset-1': strokeColor === c }"
            :style="{ backgroundColor: c }"
            @click="selectStrokeColor(c)"
          />
        </div>
      </div>

      <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-0.5" />

      <!-- Stroke Thickness: Quick Presets + Slider Popover -->
      <div class="flex items-center gap-1">
        <button
          v-for="w in [2, 4, 8, 14]"
          :key="w"
          type="button"
          class="px-2 py-0.5 rounded-lg font-mono font-medium transition-colors cursor-pointer"
          :class="strokeWidth === w ? 'bg-chat-primary text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'"
          @click="strokeWidth = w"
        >
          {{ w }}px
        </button>

        <IconButton
          icon="PhPencilLine"
          :label="t('board.brushSize')"
          icon-class="size-4"
          class="hover:bg-slate-100 dark:hover:bg-slate-700 !p-1 rounded-lg"
          @click="sizePopoverRef?.toggle($event)"
        />
      </div>

      <!-- Geometry Shape Fill Settings (when shape tool or shape selected) -->
      <template v-if="isGeometricTool || selectedShape">
        <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-0.5" />

        <div class="flex items-center gap-1.5">
          <span class="text-slate-600 dark:text-slate-300">{{ t("board.fillShape") }}</span>
          <ToggleSwitch v-model="isShapeFilled" />

          <button
            v-if="isShapeFilled"
            type="button"
            :title="t('board.fillColor')"
            class="size-5 rounded-full border-2 border-white dark:border-slate-800 ring-1 ring-slate-300 dark:ring-slate-600 shadow-xs cursor-pointer ml-1"
            :style="{ backgroundColor: fillColor }"
            @click="fillColorPopoverRef?.toggle($event)"
          />
        </div>
      </template>

      <!-- Delete Selected Button -->
      <template v-if="selectedShapeId">
        <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-0.5" />

        <button
          type="button"
          class="flex items-center gap-1 text-red-500 hover:text-red-600 font-medium px-2 py-0.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
          @click="deleteSelected"
        >
          <BIcon icon="PhTrash" class="size-3.5" />
          <span>{{ t("board.deleteSelected") }}</span>
        </button>
      </template>
    </div>

    <!-- Canvas Area -->
    <div
      ref="containerRef"
      class="flex-1 w-full h-full relative overflow-hidden bg-white dark:bg-slate-900 touch-none"
      :class="[
        gridVisible ? 'whiteboard-dot-grid' : '',
        isSpacePressed || currentTool === 'pan' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : '',
        currentTool === 'select' ? 'cursor-default' : '',
        currentTool === 'laser' ? 'cursor-crosshair' : '',
        currentTool === 'eraser' ? 'cursor-cell' : '',
        currentTool !== 'select' && currentTool !== 'pan' && currentTool !== 'eraser' && !isSpacePressed ? 'cursor-crosshair' : '',
      ]"
    >
      <Stage
        ref="stageRef"
        :config="{
          width: stageSize.width,
          height: stageSize.height,
          x: stagePos.x,
          y: stagePos.y,
          scaleX: stageScale,
          scaleY: stageScale,
        }"
        @mousedown="handleStageMouseDown"
        @mousemove="handleStageMouseMove"
        @mouseup="handleStageMouseUp"
        @touchstart="handleStageMouseDown"
        @touchmove="handleStageMouseMove"
        @touchend="handleStageMouseUp"
        @wheel="handleWheel"
      >
        <!-- Layer 1: Background Layer (Opaque white rectangle for clean export & eraser compositing) -->
        <Layer :config="{ listening: false }">
          <Rect
            :config="{
              id: 'bg-rect',
              name: 'bg-rect',
              x: -5000,
              y: -5000,
              width: 10000,
              height: 10000,
              fill: '#ffffff',
              listening: false,
            }"
          />
        </Layer>

        <!-- Layer 2: Committed Shapes Layer (Only repaints on shape commit / undo / redo / transform) -->
        <Layer ref="shapesLayerRef">
          <template v-for="item in currentShapes" :key="item.id">
            <!-- Freehand Line / Eraser / Straight Line -->
            <Line
              v-if="
                item.type === 'pen' ||
                item.type === 'brush' ||
                item.type === 'highlighter' ||
                item.type === 'eraser' ||
                item.type === 'line'
              "
              :config="getLineConfig(item as LineShape)"
              @click="handleShapeClick(item.id)"
              @tap="handleShapeClick(item.id)"
              @dragend="handleShapeDragEnd(item.id, $event)"
              @transformend="handleShapeTransformEnd(item.id, $event)"
            />

            <!-- Rectangle & Square -->
            <Rect
              v-else-if="item.type === 'rect' || item.type === 'square'"
              :config="getRectConfig(item as RectShape)"
              @click="handleShapeClick(item.id)"
              @tap="handleShapeClick(item.id)"
              @dragend="handleShapeDragEnd(item.id, $event)"
              @transformend="handleShapeTransformEnd(item.id, $event)"
            />

            <!-- Circle -->
            <Circle
              v-else-if="item.type === 'circle'"
              :config="getCircleConfig(item as CircleShape)"
              @click="handleShapeClick(item.id)"
              @tap="handleShapeClick(item.id)"
              @dragend="handleShapeDragEnd(item.id, $event)"
              @transformend="handleShapeTransformEnd(item.id, $event)"
            />

            <!-- Triangle -->
            <RegularPolygon
              v-else-if="item.type === 'triangle'"
              :config="getTriangleConfig(item as TriangleShape)"
              @click="handleShapeClick(item.id)"
              @tap="handleShapeClick(item.id)"
              @dragend="handleShapeDragEnd(item.id, $event)"
              @transformend="handleShapeTransformEnd(item.id, $event)"
            />

            <!-- Arrow -->
            <Arrow
              v-else-if="item.type === 'arrow'"
              :config="getArrowConfig(item as ArrowShape)"
              @click="handleShapeClick(item.id)"
              @tap="handleShapeClick(item.id)"
              @dragend="handleShapeDragEnd(item.id, $event)"
              @transformend="handleShapeTransformEnd(item.id, $event)"
            />

            <!-- Star -->
            <Star
              v-else-if="item.type === 'star'"
              :config="getStarConfig(item as StarShape)"
              @click="handleShapeClick(item.id)"
              @tap="handleShapeClick(item.id)"
              @dragend="handleShapeDragEnd(item.id, $event)"
              @transformend="handleShapeTransformEnd(item.id, $event)"
            />
          </template>
        </Layer>

        <!-- Layer 3: Active Scratch Layer (ONLY the current stroke in progress - isolated repaint!) -->
        <Layer ref="scratchLayerRef" :config="{ listening: false }">
          <template v-if="drawingShape">
            <Line
              v-if="
                drawingShape.type === 'pen' ||
                drawingShape.type === 'brush' ||
                drawingShape.type === 'highlighter' ||
                drawingShape.type === 'eraser' ||
                drawingShape.type === 'line'
              "
              :config="getLineConfig(drawingShape as LineShape)"
            />
            <Rect
              v-else-if="drawingShape.type === 'rect' || drawingShape.type === 'square'"
              :config="getRectConfig(drawingShape as RectShape)"
            />
            <Circle
              v-else-if="drawingShape.type === 'circle'"
              :config="getCircleConfig(drawingShape as CircleShape)"
            />
            <RegularPolygon
              v-else-if="drawingShape.type === 'triangle'"
              :config="getTriangleConfig(drawingShape as TriangleShape)"
            />
            <Arrow
              v-else-if="drawingShape.type === 'arrow'"
              :config="getArrowConfig(drawingShape as ArrowShape)"
            />
            <Star
              v-else-if="drawingShape.type === 'star'"
              :config="getStarConfig(drawingShape as StarShape)"
            />
          </template>
        </Layer>

        <!-- Layer 4: Laser Pointer Layer (Fading glowing trail for call presentations) -->
        <Layer ref="laserLayerRef" :config="{ listening: false }">
          <template v-for="pt in laserPoints" :key="pt.id">
            <Circle
              :config="{
                x: pt.x,
                y: pt.y,
                radius: pt.radius,
                fill: pt.color,
                opacity: pt.opacity,
                shadowColor: pt.color,
                shadowBlur: 10,
                shadowOpacity: 0.9,
                listening: false,
              }"
            />
          </template>
        </Layer>

        <!-- Layer 5: Transformer / Selection Handles Layer -->
        <Layer>
          <Transformer
            ref="transformerRef"
            :config="{
              rotateEnabled: true,
              enabledAnchors: [
                'top-left',
                'top-right',
                'bottom-left',
                'bottom-right',
                'middle-left',
                'middle-right',
                'top-center',
                'bottom-center',
              ],
              boundBoxFunc: (oldBox: KonvaBox, newBox: KonvaBox) => {
                if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
                  return oldBox;
                }
                return newBox;
              },
            }"
          />
        </Layer>
      </Stage>
    </div>

    <!-- Bottom Floating Navigation & Status Bar -->
    <div class="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-md shadow-md border border-slate-200/80 dark:border-slate-700/80 text-xs">
      <IconButton
        icon="PhCaretLeft"
        :label="t('board.prevPage')"
        :disabled="currentPageIndex === 0"
        icon-class="size-3.5"
        class="hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
        @click="currentPageIndex--"
      />

      <button
        type="button"
        class="px-2 py-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold cursor-pointer text-slate-700 dark:text-slate-200 flex items-center gap-1"
        @click="pagesMenuRef?.toggle($event)"
      >
        <BIcon icon="PhFiles" class="size-3.5 text-chat-primary" />
        <span>{{ currentPageIndex + 1 }} / {{ pages.length }}</span>
      </button>

      <IconButton
        icon="PhCaretRight"
        :label="t('board.nextPage')"
        :disabled="currentPageIndex === pages.length - 1"
        icon-class="size-3.5"
        class="hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
        @click="currentPageIndex++"
      />

      <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-0.5" />

      <button
        type="button"
        class="flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-chat-primary font-semibold cursor-pointer"
        @click="addPage"
      >
        <BIcon icon="PhPlus" class="size-3.5" />
        <span class="hidden sm:inline">{{ t("board.addPage") }}</span>
      </button>
    </div>

    <!-- Bottom Right Tool Mode Pill -->
    <div class="absolute bottom-4 right-4 z-10 hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-md shadow-md border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-500 dark:text-slate-400">
      <span class="font-medium text-slate-700 dark:text-slate-200">{{ activeToolLabel }}</span>
      <span v-if="currentTool !== 'select' && currentTool !== 'pan'">&middot; {{ strokeWidth }}px</span>
    </div>

    <!-- Shapes Popover -->
    <Popover ref="shapesPopover" :dir="dir" class="vue-chat">
      <div class="flex flex-col gap-2 p-2 w-52 text-xs select-none">
        <div class="font-semibold text-slate-500 dark:text-slate-400 mb-1">
          {{ t("board.shapes") }}
        </div>
        <div class="grid grid-cols-3 gap-1.5">
          <!-- Rect -->
          <button
            type="button"
            class="flex flex-col items-center justify-center gap-1 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            :class="{ 'bg-chat-primary/10 text-chat-primary font-bold': currentTool === 'rect' }"
            @click="currentTool = 'rect'; shapesPopoverRef?.hide()"
          >
            <BIcon icon="PhSquare" class="size-5" />
            <span class="text-[10px]">{{ t("board.rectangle") }}</span>
          </button>

          <!-- Square -->
          <button
            type="button"
            class="flex flex-col items-center justify-center gap-1 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            :class="{ 'bg-chat-primary/10 text-chat-primary font-bold': currentTool === 'square' }"
            @click="currentTool = 'square'; shapesPopoverRef?.hide()"
          >
            <BIcon icon="PhSquare" class="size-5" />
            <span class="text-[10px]">{{ t("board.square") }}</span>
          </button>

          <!-- Circle -->
          <button
            type="button"
            class="flex flex-col items-center justify-center gap-1 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            :class="{ 'bg-chat-primary/10 text-chat-primary font-bold': currentTool === 'circle' }"
            @click="currentTool = 'circle'; shapesPopoverRef?.hide()"
          >
            <BIcon icon="PhCircle" class="size-5" />
            <span class="text-[10px]">{{ t("board.circle") }}</span>
          </button>

          <!-- Triangle -->
          <button
            type="button"
            class="flex flex-col items-center justify-center gap-1 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            :class="{ 'bg-chat-primary/10 text-chat-primary font-bold': currentTool === 'triangle' }"
            @click="currentTool = 'triangle'; shapesPopoverRef?.hide()"
          >
            <BIcon icon="PhTriangle" class="size-5" />
            <span class="text-[10px]">{{ t("board.triangle") }}</span>
          </button>

          <!-- Line -->
          <button
            type="button"
            class="flex flex-col items-center justify-center gap-1 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            :class="{ 'bg-chat-primary/10 text-chat-primary font-bold': currentTool === 'line' }"
            @click="currentTool = 'line'; shapesPopoverRef?.hide()"
          >
            <BIcon icon="PhMinus" class="size-5" />
            <span class="text-[10px]">{{ t("board.line") }}</span>
          </button>

          <!-- Arrow -->
          <button
            type="button"
            class="flex flex-col items-center justify-center gap-1 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            :class="{ 'bg-chat-primary/10 text-chat-primary font-bold': currentTool === 'arrow' }"
            @click="currentTool = 'arrow'; shapesPopoverRef?.hide()"
          >
            <BIcon icon="PhArrowUpRight" class="size-5" />
            <span class="text-[10px]">{{ t("board.arrow") }}</span>
          </button>

          <!-- Star -->
          <button
            type="button"
            class="flex flex-col items-center justify-center gap-1 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            :class="{ 'bg-chat-primary/10 text-chat-primary font-bold': currentTool === 'star' }"
            @click="currentTool = 'star'; shapesPopoverRef?.hide()"
          >
            <BIcon icon="PhStar" class="size-5" />
            <span class="text-[10px]">{{ t("board.star") }}</span>
          </button>
        </div>
      </div>
    </Popover>

    <!-- Stroke Color Popover -->
    <Popover ref="colorPopover" :dir="dir" class="vue-chat">
      <div class="p-3 w-64 select-none">
        <WhiteboardRgbPicker
          :model-value="strokeColor"
          @update:model-value="selectStrokeColor"
        />
      </div>
    </Popover>

    <!-- Fill Color Popover -->
    <Popover ref="fillColorPopover" :dir="dir" class="vue-chat">
      <div class="p-3 w-64 select-none">
        <WhiteboardRgbPicker
          :model-value="fillColor"
          @update:model-value="(c) => { fillColor = c; if (selectedShape) { selectedShape.fill = c; pushHistory(); } markDirty(); }"
        />
      </div>
    </Popover>

    <!-- Stroke Size Slider Popover -->
    <Popover ref="sizePopover" :dir="dir" class="vue-chat">
      <div class="flex flex-col gap-3 p-3 w-48 text-xs select-none">
        <div class="flex items-center justify-between font-semibold">
          <span>{{ t("board.brushSize") }}</span>
          <span class="font-mono text-chat-primary">{{ strokeWidth }}px</span>
        </div>
        <Slider
          v-model="strokeWidth"
          :min="1"
          :max="40"
          class="w-full"
          @change="markDirty"
        />
        <div class="flex items-center justify-between gap-1 pt-1 border-t border-slate-100 dark:border-slate-800">
          <button
            v-for="w in strokeWidthPresets"
            :key="w"
            type="button"
            class="size-6 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-[10px] flex items-center justify-center cursor-pointer transition-colors"
            :class="{ 'bg-chat-primary text-white font-bold': strokeWidth === w }"
            @click="strokeWidth = w; markDirty();"
          >
            {{ w }}
          </button>
        </div>
      </div>
    </Popover>

    <!-- Pages Menu -->
    <Menu ref="pagesMenu" :model="pageMenuItems" :popup="true" :dir="dir" class="vue-chat">
      <template #item="{ item }">
        <div class="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 w-full">
          <BIcon v-if="item.phIcon" :icon="item.phIcon" class="size-4 shrink-0 text-slate-500" />
          <span class="truncate flex-1">{{ item.label }}</span>
        </div>
      </template>
    </Menu>
  </div>
</template>

<style scoped>
.whiteboard-dot-grid {
  background-image: radial-gradient(rgba(148, 163, 184, 0.35) 1px, transparent 1px);
  background-size: 20px 20px;
}
</style>
