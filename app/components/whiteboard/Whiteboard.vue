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
  Group,
  Line,
  Rect,
  Circle,
  RegularPolygon,
  Arrow,
  Star,
  Text,
  Transformer,
  type VueKonvaRef,
} from "vue-konva";
import Konva from "konva";
import { nanoid } from "nanoid";
import { useResizeObserver, useEventListener } from "@vueuse/core";
import Button from "primevue/button";
import Popover from "primevue/popover";
import Menu from "primevue/menu";
import Dialog from "primevue/dialog";
import type { MenuItem } from "primevue/menuitem";
import Slider from "primevue/slider";
import ToggleSwitch from "primevue/toggleswitch";

import BIcon from "~/components/global/BIcon.vue";
import IconButton from "~/components/general/IconButton.vue";
import CallIcon from "~/components/call/CallIcon.vue";
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
  TextShape,
  StickyShape,
  CanvasTheme,
  GridStyle,
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
  copyImageToClipboard: () => Promise<void>;
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
    isFullWindow?: boolean;
    hasParticipants?: boolean;
    participantsCount?: number;
    isSidebarOpen?: boolean;
    title?: string;
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
    isFullWindow: undefined,
    hasParticipants: false,
    participantsCount: 0,
    isSidebarOpen: false,
    title: "",
  },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "streamStart", stream: MediaStream): void;
  (e: "streamStop"): void;
  (e: "update:streamActive", val: boolean): void;
  (e: "maximize", maximized: boolean): void;
  (e: "fullWindow", fullWindow: boolean): void;
  (e: "toggleSidebar"): void;
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
const overflowMenuRef = useTemplateRef<InstanceType<typeof Menu>>("overflowMenu");

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
const isMaximized = ref<boolean>(false);

const effectiveFullWindow = computed(() => {
  return typeof props.isFullWindow === "boolean" ? props.isFullWindow : isMaximized.value;
});

const isStandaloneMaximized = computed(() => {
  return !props.showClose && typeof props.isFullWindow !== "boolean" && isMaximized.value;
});

// Canvas Theme & Grid Styles
const canvasTheme = ref<CanvasTheme>("light");
const gridStyle = ref<GridStyle>(props.showGrid ? "dots" : "none");

const toggleCanvasTheme = () => {
  canvasTheme.value = canvasTheme.value === "light" ? "dark" : "light";
  markDirty();
};

const toggleGrid = () => {
  if (gridStyle.value === "dots") gridStyle.value = "lines";
  else if (gridStyle.value === "lines") gridStyle.value = "none";
  else gridStyle.value = "dots";
};

// Properties Island Collapsible State
const isPropertiesCollapsed = ref(false);
const showShortcutsModal = ref(false);
const showClearConfirmModal = ref(false);

// Sticky Notes & Text Settings
function getDefaultFontFamily(): string {
  if (typeof window !== "undefined") {
    const computed = window.getComputedStyle(document.body).fontFamily;
    if (computed) return computed;
  }
  return "system-ui, sans-serif";
}

const textFontSize = ref<number>(20);
const stickyColor = ref<string>("#fef08a");
const stickyColorPresets = [
  "#fef08a",
  "#bbf7d0",
  "#bfdbfe",
  "#fbcfe8",
  "#fed7aa",
  "#e9d5ff",
];

// In-canvas Inline Text Editing Overlay
const isEditingText = ref(false);
const editingShapeId = ref<string | null>(null);
const editingText = ref("");
const editingBox = reactive({
  left: 0,
  top: 0,
  width: 200,
  height: 100,
  fontSize: 16,
  color: "#0f172a",
  isSticky: false,
  bgColor: "#ffffff",
});
const inlineTextareaRef = useTemplateRef<HTMLTextAreaElement>("inlineTextareaRef");

// Preset colors for quick toolbar switching
const quickColors = [
  "#0f172a",
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

function requestClear() {
  if (currentShapes.value.length === 0) return;
  showClearConfirmModal.value = true;
}

function confirmClear() {
  clear();
  showClearConfirmModal.value = false;
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

// Z-Index Ordering & Duplication
function bringToFront() {
  if (!selectedShapeId.value) return;
  const idx = currentShapes.value.findIndex((s) => s.id === selectedShapeId.value);
  if (idx < 0 || idx === currentShapes.value.length - 1) return;
  const [item] = currentShapes.value.splice(idx, 1);
  if (item) {
    currentShapes.value.push(item);
    pushHistory();
    markDirty();
  }
}

function sendToBack() {
  if (!selectedShapeId.value) return;
  const idx = currentShapes.value.findIndex((s) => s.id === selectedShapeId.value);
  if (idx <= 0) return;
  const [item] = currentShapes.value.splice(idx, 1);
  if (item) {
    currentShapes.value.unshift(item);
    pushHistory();
    markDirty();
  }
}

function duplicateSelected() {
  if (!selectedShapeId.value) return;
  const original = currentShapes.value.find((s) => s.id === selectedShapeId.value);
  if (!original) return;
  const clone = JSON.parse(JSON.stringify(original)) as WhiteboardShape;
  clone.id = `shape-${nanoid(8)}`;
  if ("x" in clone && typeof clone.x === "number") clone.x += 20;
  if ("y" in clone && typeof clone.y === "number") clone.y += 20;
  if ("points" in clone && Array.isArray(clone.points)) {
    clone.points = clone.points.map((p) => p + 20);
  }
  currentShapes.value.push(clone);
  selectedShapeId.value = clone.id;
  pushHistory();
  nextTick(() => {
    const stage = stageRef.value?.getStage();
    const node = stage?.findOne(`#${clone.id}`);
    if (node) attachTransformer(node);
  });
  markDirty();
}

// Drawing & Scratch States
const isDrawing = ref(false);
const startPos = reactive({ x: 0, y: 0 });

let activeNativeNode: Konva.Shape | null = null;
let activeStrokePoints: number[] = [];
let hasErasedAnyShape = false;
const eraserMode = ref<"stroke" | "pixel">("stroke");
const eraserWidth = ref<number>(24);

// Dynamic Brush / Eraser Cursor Indicator
const isCursorInsideCanvas = ref(false);
const cursorIndicatorRef = useTemplateRef<HTMLDivElement>("cursorIndicatorRef");

function updateCursorIndicator(clientX: number, clientY: number) {
  if (!containerRef.value || !cursorIndicatorRef.value) return;
  const rect = containerRef.value.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  cursorIndicatorRef.value.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
}

function onContainerPointerEnter(e: PointerEvent) {
  if (currentTool.value !== "select" && currentTool.value !== "pan") {
    isCursorInsideCanvas.value = true;
    updateCursorIndicator(e.clientX, e.clientY);
  }
}

function onContainerPointerLeave() {
  isCursorInsideCanvas.value = false;
}

function onContainerPointerMove(e: PointerEvent) {
  if (!isCursorInsideCanvas.value && currentTool.value !== "select" && currentTool.value !== "pan") {
    isCursorInsideCanvas.value = true;
  }
  updateCursorIndicator(e.clientX, e.clientY);
}

const cursorVisualSize = computed(() => {
  const scale = stageScale.value || 1;
  if (currentTool.value === "laser") return 18;
  if (currentTool.value === "eraser") {
    return Math.max(12, Math.min(180, eraserWidth.value * scale));
  }
  if (currentTool.value === "brush") {
    return Math.max(8, Math.min(180, strokeWidth.value * 2.2 * scale));
  }
  if (currentTool.value === "highlighter") {
    return Math.max(12, Math.min(180, strokeWidth.value * 3.5 * scale));
  }
  return Math.max(6, Math.min(180, strokeWidth.value * scale));
});

const cursorIndicatorStyle = computed(() => {
  const size = cursorVisualSize.value;
  const tool = currentTool.value;

  if (tool === "laser") {
    return {
      width: `${size}px`,
      height: `${size}px`,
      borderColor: strokeColor.value || "#ef4444",
      backgroundColor: "rgba(239, 68, 68, 0.4)",
      boxShadow: "0 0 10px rgba(239, 68, 68, 0.8)",
    };
  }

  if (tool === "eraser") {
    return {
      width: `${size}px`,
      height: `${size}px`,
      borderColor: "#ef4444",
      borderStyle: "dashed",
      borderWidth: "1.5px",
      backgroundColor: "rgba(239, 68, 68, 0.12)",
      boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.5)",
    };
  }

  return {
    width: `${size}px`,
    height: `${size}px`,
    borderColor: strokeColor.value,
    borderStyle: "solid",
    borderWidth: "1.5px",
    backgroundColor: `${strokeColor.value}26`,
    boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.25)",
  };
});

// Fast Vector Math for Object / Stroke Eraser Mode
function distToSegmentSquared(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return (px - x1) ** 2 + (py - y1) ** 2;
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (px - (x1 + t * (x2 - x1))) ** 2 + (py - (y1 + t * (y2 - y1))) ** 2;
}

function checkShapeIntersect(shape: WhiteboardShape, px: number, py: number, radius: number): boolean {
  const rSq = (radius + (shape.strokeWidth || 4) / 2) ** 2;

  if (
    shape.type === "pen" ||
    shape.type === "brush" ||
    shape.type === "highlighter" ||
    shape.type === "line" ||
    shape.type === "eraser"
  ) {
    const pts = (shape as LineShape).points;
    if (!pts || pts.length < 2) return false;
    for (let i = 0; i < pts.length - 2; i += 2) {
      if (distToSegmentSquared(px, py, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]) <= rSq) {
        return true;
      }
    }
    return false;
  }

  if (shape.type === "rect" || shape.type === "square") {
    const r = shape as RectShape;
    return px >= r.x - radius && px <= r.x + r.width + radius && py >= r.y - radius && py <= r.y + r.height + radius;
  }

  if (shape.type === "circle") {
    const c = shape as CircleShape;
    const dSq = (px - c.x) ** 2 + (py - c.y) ** 2;
    return dSq <= (c.radius + radius) ** 2;
  }

  if (shape.type === "triangle" || shape.type === "star") {
    const s = shape as TriangleShape;
    const dSq = (px - s.x) ** 2 + (py - s.y) ** 2;
    return dSq <= (s.radius + radius) ** 2;
  }

  if (shape.type === "arrow") {
    const a = shape as ArrowShape;
    const pts = a.points;
    if (!pts || pts.length < 4) return false;
    return distToSegmentSquared(px, py, pts[0], pts[1], pts[2], pts[3]) <= rSq;
  }

  if (shape.type === "text") {
    const t = shape as TextShape;
    const approxW = (t.text.length * (t.fontSize || 18)) * 0.6;
    const approxH = (t.fontSize || 18) * 1.4;
    return px >= t.x - radius && px <= t.x + approxW + radius && py >= t.y - radius && py <= t.y + approxH + radius;
  }

  if (shape.type === "sticky") {
    const s = shape as StickyShape;
    return px >= s.x - radius && px <= s.x + s.width + radius && py >= s.y - radius && py <= s.y + s.height + radius;
  }

  return false;
}

// Laser pointer
const laserPoints = ref<LaserPoint[]>([]);
let laserTimer: ReturnType<typeof setInterval> | null = null;

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

// Text & Sticky In-Canvas Editor
function startEditingText(shape: TextShape | StickyShape) {
  isEditingText.value = true;
  editingShapeId.value = shape.id;
  editingText.value = shape.text;

  const scale = stageScale.value || 1;
  const screenX = shape.x * scale + stagePos.x;
  const screenY = shape.y * scale + stagePos.y;

  editingBox.left = screenX;
  editingBox.top = screenY;
  editingBox.isSticky = shape.type === "sticky";
  const shapeHeight = "height" in shape && shape.height ? shape.height : (shape.fontSize || 18) * 1.5;
  editingBox.width = Math.max(140, (shape.width || 180) * scale);
  editingBox.height = Math.max(70, shapeHeight * scale);
  editingBox.fontSize = Math.max(12, (shape.fontSize || 16) * scale);
  editingBox.color = shape.type === "sticky" ? (shape.textColor || "#1e293b") : (shape.fill || strokeColor.value);
  editingBox.bgColor = shape.type === "sticky" ? shape.fill : "transparent";

  nextTick(() => {
    if (inlineTextareaRef.value) {
      inlineTextareaRef.value.focus();
      inlineTextareaRef.value.select();
    }
  });
}

function finishEditingText() {
  if (!isEditingText.value || !editingShapeId.value) return;
  const shape = currentShapes.value.find((s) => s.id === editingShapeId.value);
  if (shape && (shape.type === "text" || shape.type === "sticky")) {
    const trimmed = editingText.value.trim();
    if (trimmed) {
      shape.text = trimmed;
    }
    pushHistory();
    markDirty();
  }
  isEditingText.value = false;
  editingShapeId.value = null;
}

function onInlineTextEnter(e: KeyboardEvent) {
  if (!editingBox.isSticky && !e.shiftKey) {
    e.preventDefault();
    finishEditingText();
  }
}

function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
  if (isEditingText.value) {
    finishEditingText();
  }

  if (currentTool.value !== "select" && currentTool.value !== "pan") {
    isCursorInsideCanvas.value = true;
  }

  if (e.evt) {
    updateCursorIndicator(
      "clientX" in e.evt ? e.evt.clientX : e.evt.touches[0]?.clientX ?? 0,
      "clientY" in e.evt ? e.evt.clientY : e.evt.touches[0]?.clientY ?? 0,
    );
  }

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

  // Text tool click to create
  if (currentTool.value === "text") {
    const pos = getRelativePointerPosition();
    if (pos) {
      const id = `shape-${nanoid(8)}`;
      const newShape: TextShape = {
        id,
        type: "text",
        x: pos.x,
        y: pos.y,
        text: t("board.typeHere") || "Text",
        fontSize: textFontSize.value,
        fontFamily: getDefaultFontFamily(),
        stroke: strokeColor.value,
        strokeWidth: 1,
        fill: strokeColor.value,
      };
      currentShapes.value.push(newShape);
      pushHistory();
      selectedShapeId.value = id;
      currentTool.value = "select";
      nextTick(() => {
        startEditingText(newShape);
      });
    }
    return;
  }

  // Sticky Note click to create
  if (currentTool.value === "sticky") {
    const pos = getRelativePointerPosition();
    if (pos) {
      const id = `shape-${nanoid(8)}`;
      const newShape: StickyShape = {
        id,
        type: "sticky",
        x: pos.x - 70,
        y: pos.y - 70,
        width: 140,
        height: 140,
        text: t("board.typeHere") || "Note",
        fontSize: 15,
        stroke: "#eab308",
        strokeWidth: 1,
        fill: stickyColor.value,
        textColor: "#1e293b",
      };
      currentShapes.value.push(newShape);
      pushHistory();
      selectedShapeId.value = id;
      currentTool.value = "select";
      nextTick(() => {
        startEditingText(newShape);
      });
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

  // Eraser in Stroke Mode (instant object deletion)
  if (currentTool.value === "eraser" && eraserMode.value === "stroke") {
    isDrawing.value = true;
    hasErasedAnyShape = false;
    const pos = getRelativePointerPosition();
    if (pos) {
      const initialCount = currentShapes.value.length;
      currentShapes.value = currentShapes.value.filter(
        (s) => !checkShapeIntersect(s, pos.x, pos.y, eraserWidth.value / 2),
      );
      if (currentShapes.value.length !== initialCount) {
        hasErasedAnyShape = true;
        shapesLayerRef.value?.getNode()?.batchDraw();
        markDirty();
      }
    }
    return;
  }

  // Drawing tools (pen, brush, highlighter, pixel eraser, line, shapes)
  const pos = getRelativePointerPosition();
  if (!pos) return;
  isDrawing.value = true;
  startPos.x = pos.x;
  startPos.y = pos.y;

  const tool = currentTool.value;
  const scratchLayer = scratchLayerRef.value?.getNode();

  if (tool === "pen" || tool === "brush" || tool === "highlighter" || tool === "eraser") {
    const isEraser = tool === "eraser";
    let strokeW = strokeWidth.value;
    let strokeC = strokeColor.value;
    let opacity = 1;
    let tension = 0.4;
    let lineCap: "round" | "butt" | "square" = "round";
    let lineJoin: "round" | "bevel" | "miter" = "round";

    if (tool === "brush") {
      strokeW = Math.max(8, strokeWidth.value * 2.2);
    } else if (tool === "highlighter") {
      strokeW = Math.max(16, strokeWidth.value * 3.5);
      opacity = 0.35;
      tension = 0;
      lineCap = "square";
    } else if (tool === "eraser") {
      strokeW = eraserWidth.value;
      strokeC = canvasTheme.value === "dark" ? "#334155" : "#cbd5e1";
      opacity = 0.6;
      tension = 0;
    }

    activeStrokePoints = [pos.x, pos.y, pos.x, pos.y];
    activeNativeNode = new Konva.Line({
      id: "scratch-active",
      points: activeStrokePoints,
      stroke: strokeC,
      strokeWidth: strokeW,
      opacity,
      tension,
      lineCap,
      lineJoin,
      listening: false,
      dash: isEraser ? [6, 4] : undefined,
    });
    scratchLayer?.add(activeNativeNode);
    scratchLayer?.batchDraw();
  } else if (tool === "line") {
    activeStrokePoints = [pos.x, pos.y, pos.x, pos.y];
    activeNativeNode = new Konva.Line({
      id: "scratch-active",
      points: activeStrokePoints,
      stroke: strokeColor.value,
      strokeWidth: strokeWidth.value,
      opacity: 1,
      tension: 0,
      lineCap: "round",
      lineJoin: "round",
      listening: false,
    });
    scratchLayer?.add(activeNativeNode);
    scratchLayer?.batchDraw();
  } else if (tool === "rect" || tool === "square") {
    activeNativeNode = new Konva.Rect({
      id: "scratch-active",
      x: pos.x,
      y: pos.y,
      width: 0,
      height: 0,
      stroke: strokeColor.value,
      strokeWidth: strokeWidth.value,
      fill: isShapeFilled.value ? fillColor.value : undefined,
      opacity: 1,
      listening: false,
    });
    scratchLayer?.add(activeNativeNode);
    scratchLayer?.batchDraw();
  } else if (tool === "circle") {
    activeNativeNode = new Konva.Circle({
      id: "scratch-active",
      x: pos.x,
      y: pos.y,
      radius: 0,
      stroke: strokeColor.value,
      strokeWidth: strokeWidth.value,
      fill: isShapeFilled.value ? fillColor.value : undefined,
      opacity: 1,
      listening: false,
    });
    scratchLayer?.add(activeNativeNode);
    scratchLayer?.batchDraw();
  } else if (tool === "triangle") {
    activeNativeNode = new Konva.RegularPolygon({
      id: "scratch-active",
      x: pos.x,
      y: pos.y,
      sides: 3,
      radius: 0,
      stroke: strokeColor.value,
      strokeWidth: strokeWidth.value,
      fill: isShapeFilled.value ? fillColor.value : undefined,
      opacity: 1,
      listening: false,
    });
    scratchLayer?.add(activeNativeNode);
    scratchLayer?.batchDraw();
  } else if (tool === "arrow") {
    activeNativeNode = new Konva.Arrow({
      id: "scratch-active",
      points: [pos.x, pos.y, pos.x, pos.y],
      pointerLength: Math.max(10, strokeWidth.value * 3),
      pointerWidth: Math.max(10, strokeWidth.value * 3),
      stroke: strokeColor.value,
      fill: strokeColor.value,
      strokeWidth: strokeWidth.value,
      opacity: 1,
      listening: false,
    });
    scratchLayer?.add(activeNativeNode);
    scratchLayer?.batchDraw();
  } else if (tool === "star") {
    activeNativeNode = new Konva.Star({
      id: "scratch-active",
      x: pos.x,
      y: pos.y,
      numPoints: 5,
      innerRadius: 0,
      outerRadius: 0,
      stroke: strokeColor.value,
      strokeWidth: strokeWidth.value,
      fill: isShapeFilled.value ? fillColor.value : undefined,
      opacity: 1,
      listening: false,
    });
    scratchLayer?.add(activeNativeNode);
    scratchLayer?.batchDraw();
  }

  markDirty();
}

function handleStageMouseMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
  if (currentTool.value !== "select" && currentTool.value !== "pan") {
    isCursorInsideCanvas.value = true;
  }

  if (e.evt) {
    updateCursorIndicator(
      "clientX" in e.evt ? e.evt.clientX : e.evt.touches[0]?.clientX ?? 0,
      "clientY" in e.evt ? e.evt.clientY : e.evt.touches[0]?.clientY ?? 0,
    );
  }

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

  // Eraser in Stroke Mode
  if (isDrawing.value && currentTool.value === "eraser" && eraserMode.value === "stroke") {
    const pos = getRelativePointerPosition();
    if (pos) {
      const initialCount = currentShapes.value.length;
      currentShapes.value = currentShapes.value.filter(
        (s) => !checkShapeIntersect(s, pos.x, pos.y, eraserWidth.value / 2),
      );
      if (currentShapes.value.length !== initialCount) {
        hasErasedAnyShape = true;
        shapesLayerRef.value?.getNode()?.batchDraw();
        markDirty();
      }
    }
    return;
  }

  if (!isDrawing.value || !activeNativeNode) return;
  const pos = getRelativePointerPosition();
  if (!pos) return;

  const tool = currentTool.value;
  const scratchLayer = scratchLayerRef.value?.getNode();

  if (tool === "pen" || tool === "brush" || tool === "highlighter" || tool === "eraser") {
    const lastX = activeStrokePoints[activeStrokePoints.length - 2];
    const lastY = activeStrokePoints[activeStrokePoints.length - 1];
    const distSq = (pos.x - lastX) ** 2 + (pos.y - lastY) ** 2;
    if (distSq >= 4) {
      activeStrokePoints.push(pos.x, pos.y);
      (activeNativeNode as Konva.Line).points(activeStrokePoints);
      scratchLayer?.batchDraw();
      markDirty();
    }
  } else if (tool === "line") {
    activeStrokePoints = [startPos.x, startPos.y, pos.x, pos.y];
    (activeNativeNode as Konva.Line).points(activeStrokePoints);
    scratchLayer?.batchDraw();
    markDirty();
  } else if (tool === "arrow") {
    activeStrokePoints = [startPos.x, startPos.y, pos.x, pos.y];
    (activeNativeNode as Konva.Arrow).points(activeStrokePoints);
    scratchLayer?.batchDraw();
    markDirty();
  } else if (tool === "rect") {
    activeNativeNode.setAttrs({
      x: Math.min(startPos.x, pos.x),
      y: Math.min(startPos.y, pos.y),
      width: Math.abs(pos.x - startPos.x),
      height: Math.abs(pos.y - startPos.y),
    });
    scratchLayer?.batchDraw();
    markDirty();
  } else if (tool === "square") {
    const side = Math.max(Math.abs(pos.x - startPos.x), Math.abs(pos.y - startPos.y));
    activeNativeNode.setAttrs({
      x: pos.x < startPos.x ? startPos.x - side : startPos.x,
      y: pos.y < startPos.y ? startPos.y - side : startPos.y,
      width: side,
      height: side,
    });
    scratchLayer?.batchDraw();
    markDirty();
  } else if (tool === "circle") {
    const dx = pos.x - startPos.x;
    const dy = pos.y - startPos.y;
    activeNativeNode.setAttrs({
      radius: Math.round(Math.sqrt(dx * dx + dy * dy)),
    });
    scratchLayer?.batchDraw();
    markDirty();
  } else if (tool === "triangle") {
    const dx = pos.x - startPos.x;
    const dy = pos.y - startPos.y;
    activeNativeNode.setAttrs({
      radius: Math.round(Math.sqrt(dx * dx + dy * dy)),
    });
    scratchLayer?.batchDraw();
    markDirty();
  } else if (tool === "star") {
    const dx = pos.x - startPos.x;
    const dy = pos.y - startPos.y;
    const outer = Math.round(Math.sqrt(dx * dx + dy * dy));
    activeNativeNode.setAttrs({
      outerRadius: outer,
      innerRadius: Math.round(outer * 0.45),
    });
    scratchLayer?.batchDraw();
    markDirty();
  }
}

function handleStageMouseUp() {
  if (isPanning.value) {
    isPanning.value = false;
    markDirty();
    return;
  }

  // Eraser in Stroke Mode
  if (currentTool.value === "eraser" && eraserMode.value === "stroke") {
    isDrawing.value = false;
    if (hasErasedAnyShape) {
      pushHistory();
      hasErasedAnyShape = false;
    }
    return;
  }

  if (!isDrawing.value) return;
  isDrawing.value = false;

  if (activeNativeNode) {
    const tool = currentTool.value;
    const id = `shape-${nanoid(8)}`;

    if (tool === "pen" || tool === "brush" || tool === "highlighter" || tool === "eraser") {
      const isEraser = tool === "eraser";
      let strokeW = strokeWidth.value;
      let strokeC = strokeColor.value;
      let opacity = 1;
      let tension = 0.4;
      let lineCap: "round" | "butt" | "square" = "round";
      let lineJoin: "round" | "bevel" | "miter" = "round";

      if (tool === "brush") {
        strokeW = Math.max(8, strokeWidth.value * 2.2);
      } else if (tool === "highlighter") {
        strokeW = Math.max(16, strokeWidth.value * 3.5);
        opacity = 0.35;
        tension = 0;
        lineCap = "square";
      } else if (tool === "eraser") {
        strokeW = eraserWidth.value;
        strokeC = canvasTheme.value === "dark" ? "#0f172a" : "#ffffff";
        opacity = 1;
        tension = 0;
      }

      if (activeStrokePoints.length >= 4) {
        currentShapes.value.push({
          id,
          type: tool,
          points: [...activeStrokePoints],
          stroke: strokeC,
          strokeWidth: strokeW,
          opacity,
          tension,
          lineCap,
          lineJoin,
        } as LineShape);
        pushHistory();
      }
    } else if (tool === "line") {
      if (activeStrokePoints.length >= 4) {
        currentShapes.value.push({
          id,
          type: "line",
          points: [...activeStrokePoints],
          stroke: strokeColor.value,
          strokeWidth: strokeWidth.value,
          opacity: 1,
          tension: 0,
          lineCap: "round",
          lineJoin: "round",
        } as LineShape);
        pushHistory();
      }
    } else if (tool === "arrow") {
      if (activeStrokePoints.length >= 4) {
        currentShapes.value.push({
          id,
          type: "arrow",
          points: [...activeStrokePoints],
          pointerLength: Math.max(10, strokeWidth.value * 3),
          pointerWidth: Math.max(10, strokeWidth.value * 3),
          stroke: strokeColor.value,
          fill: strokeColor.value,
          strokeWidth: strokeWidth.value,
          opacity: 1,
        } as ArrowShape);
        pushHistory();
      }
    } else if (tool === "rect" || tool === "square") {
      const r = activeNativeNode as Konva.Rect;
      if (r.width() >= 3 && r.height() >= 3) {
        currentShapes.value.push({
          id,
          type: tool,
          x: r.x(),
          y: r.y(),
          width: r.width(),
          height: r.height(),
          stroke: strokeColor.value,
          strokeWidth: strokeWidth.value,
          fill: isShapeFilled.value ? fillColor.value : undefined,
          opacity: 1,
        } as RectShape);
        pushHistory();
      }
    } else if (tool === "circle") {
      const c = activeNativeNode as Konva.Circle;
      if (c.radius() >= 3) {
        currentShapes.value.push({
          id,
          type: "circle",
          x: c.x(),
          y: c.y(),
          radius: c.radius(),
          stroke: strokeColor.value,
          strokeWidth: strokeWidth.value,
          fill: isShapeFilled.value ? fillColor.value : undefined,
          opacity: 1,
        } as CircleShape);
        pushHistory();
      }
    } else if (tool === "triangle") {
      const t = activeNativeNode as Konva.RegularPolygon;
      if (t.radius() >= 3) {
        currentShapes.value.push({
          id,
          type: "triangle",
          x: t.x(),
          y: t.y(),
          sides: 3,
          radius: t.radius(),
          stroke: strokeColor.value,
          strokeWidth: strokeWidth.value,
          fill: isShapeFilled.value ? fillColor.value : undefined,
          opacity: 1,
        } as TriangleShape);
        pushHistory();
      }
    } else if (tool === "star") {
      const s = activeNativeNode as Konva.Star;
      if (s.outerRadius() >= 3) {
        currentShapes.value.push({
          id,
          type: "star",
          x: s.x(),
          y: s.y(),
          numPoints: 5,
          innerRadius: s.innerRadius(),
          outerRadius: s.outerRadius(),
          stroke: strokeColor.value,
          strokeWidth: strokeWidth.value,
          fill: isShapeFilled.value ? fillColor.value : undefined,
          opacity: 1,
        } as StarShape);
        pushHistory();
      }
    }

    activeNativeNode.destroy();
    activeNativeNode = null;
    activeStrokePoints = [];
    scratchLayerRef.value?.getNode()?.batchDraw();
    shapesLayerRef.value?.getNode()?.batchDraw();
  }

  markDirty();
}

function handleGlobalPointerUp() {
  if (isDrawing.value) {
    handleStageMouseUp();
  }
}
useEventListener(window, "pointerup", handleGlobalPointerUp);

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
  } else if (shape.type === "text") {
    const t = shape as TextShape;
    t.fontSize = Math.max(8, Math.round((t.fontSize || 18) * Math.max(scaleX, scaleY)));
  } else if (shape.type === "sticky") {
    const st = shape as StickyShape;
    st.width = Math.max(80, Math.round(st.width * scaleX));
    st.height = Math.max(80, Math.round(st.height * scaleY));
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

// Multi-Touch Pinch-to-Zoom & Two-Finger Pan Gestures
let lastTouchDist = 0;
let lastTouchCenter: { x: number; y: number } | null = null;
let isTwoFingerGesture = false;

function handleStageTouchStart(e: Konva.KonvaEventObject<TouchEvent>) {
  const touches = e.evt.touches;
  if (touches && touches.length >= 2) {
    isTwoFingerGesture = true;
    // Abort active stroke drawing if one finger was already on canvas
    if (isDrawing.value) {
      isDrawing.value = false;
      if (activeNativeNode) {
        activeNativeNode.destroy();
        activeNativeNode = null;
        activeStrokePoints = [];
        scratchLayerRef.value?.getNode()?.batchDraw();
      }
    }
    lastTouchDist = Math.hypot(
      touches[1].clientX - touches[0].clientX,
      touches[1].clientY - touches[0].clientY,
    );
    lastTouchCenter = {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
    return;
  }

  isTwoFingerGesture = false;
  handleStageMouseDown(e);
}

function handleStageTouchMove(e: Konva.KonvaEventObject<TouchEvent>) {
  const touches = e.evt.touches;
  if (touches && touches.length >= 2) {
    if (e.evt.cancelable) {
      e.evt.preventDefault();
    }
    if (!lastTouchCenter || lastTouchDist <= 0) {
      lastTouchDist = Math.hypot(
        touches[1].clientX - touches[0].clientX,
        touches[1].clientY - touches[0].clientY,
      );
      lastTouchCenter = {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
      };
      return;
    }

    const currentDist = Math.hypot(
      touches[1].clientX - touches[0].clientX,
      touches[1].clientY - touches[0].clientY,
    );
    const currentCenter = {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };

    const stage = stageRef.value?.getStage();
    if (stage && currentDist > 0) {
      const containerRect = containerRef.value?.getBoundingClientRect();
      const originX = containerRect ? containerRect.left : 0;
      const originY = containerRect ? containerRect.top : 0;

      // Pinch zoom anchored around touch midpoint
      const scaleFactor = currentDist / lastTouchDist;
      const oldScale = stageScale.value;
      const newScale = Math.min(4, Math.max(0.25, oldScale * scaleFactor));

      const pointer = {
        x: currentCenter.x - originX,
        y: currentCenter.y - originY,
      };

      const mousePointTo = {
        x: (pointer.x - stagePos.x) / oldScale,
        y: (pointer.y - stagePos.y) / oldScale,
      };

      stageScale.value = newScale;
      stagePos.x = pointer.x - mousePointTo.x * newScale;
      stagePos.y = pointer.y - mousePointTo.y * newScale;

      // Two-finger pan delta
      const dx = currentCenter.x - lastTouchCenter.x;
      const dy = currentCenter.y - lastTouchCenter.y;
      stagePos.x += dx;
      stagePos.y += dy;

      markDirty();
    }

    lastTouchDist = currentDist;
    lastTouchCenter = currentCenter;
    return;
  }

  if (isTwoFingerGesture) {
    return;
  }

  handleStageMouseMove(e);
}

function handleStageTouchEnd(e: Konva.KonvaEventObject<TouchEvent>) {
  const touches = e.evt.touches;
  if (!touches || touches.length < 2) {
    lastTouchDist = 0;
    lastTouchCenter = null;
  }
  if (!touches || touches.length === 0) {
    setTimeout(() => {
      isTwoFingerGesture = false;
    }, 60);
  }
  if (!isTwoFingerGesture) {
    handleStageMouseUp();
  }
}

function selectStrokeColor(color: string) {
  strokeColor.value = color;
  if (selectedShape.value) {
    selectedShape.value.stroke = color;
    if (selectedShape.value.type === "text") {
      (selectedShape.value as TextShape).fill = color;
    }
    pushHistory();
  }
  markDirty();
}

function setFontSize(size: number) {
  textFontSize.value = size;
  if (selectedShape.value && selectedShape.value.type === "text") {
    (selectedShape.value as TextShape).fontSize = size;
    pushHistory();
    markDirty();
  }
}

function setStickyColor(color: string) {
  stickyColor.value = color;
  if (selectedShape.value && selectedShape.value.type === "sticky") {
    (selectedShape.value as StickyShape).fill = color;
    pushHistory();
    markDirty();
  }
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
    tension: item.tension ?? 0.4,
    lineCap: item.lineCap ?? "round",
    lineJoin: item.lineJoin ?? "round",
    draggable: currentTool.value === "select" && !isEraser,
    globalCompositeOperation: isEraser ? "destination-out" : "source-over",
    shadowColor: isSelected ? "#3b82f6" : undefined,
    shadowBlur: isSelected ? 8 : 0,
    listening: currentTool.value === "select" && !isEraser,
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
    listening: currentTool.value === "select",
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
    listening: currentTool.value === "select",
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
    listening: currentTool.value === "select",
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
    listening: currentTool.value === "select",
  };
}

function getStarConfig(item: StarShape) {
  const isSelected = selectedShapeId.value === item.id;
  return {
    id: item.id,
    x: item.x,
    y: item.y,
    numPoints: 5,
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
    listening: currentTool.value === "select",
  };
}

function getTextConfig(item: TextShape) {
  const isSelected = selectedShapeId.value === item.id;
  return {
    id: item.id,
    x: item.x,
    y: item.y,
    text: item.text,
    fontSize: item.fontSize || 18,
    fontFamily: item.fontFamily || getDefaultFontFamily(),
    fill: item.fill || strokeColor.value || (canvasTheme.value === "dark" ? "#f8fafc" : "#0f172a"),
    draggable: currentTool.value === "select",
    shadowColor: isSelected ? "#3b82f6" : undefined,
    shadowBlur: isSelected ? 8 : 0,
    listening: currentTool.value === "select",
  };
}

function getStickyGroupConfig(item: StickyShape) {
  const isSelected = selectedShapeId.value === item.id;
  return {
    id: item.id,
    x: item.x,
    y: item.y,
    draggable: currentTool.value === "select",
    shadowColor: isSelected ? "#3b82f6" : undefined,
    shadowBlur: isSelected ? 10 : 0,
    listening: currentTool.value === "select",
  };
}

// Copy Image to Clipboard
async function copyImageToClipboard() {
  const stage = stageRef.value?.getStage();
  if (!stage) return;
  detachTransformer();
  const prevPos = { x: stagePos.x, y: stagePos.y };
  const prevScale = stageScale.value;

  stage.position({ x: 0, y: 0 });
  stage.scale({ x: 1, y: 1 });
  stage.batchDraw();

  try {
    const dataUrl = stage.toDataURL({
      mimeType: "image/png",
      pixelRatio: 2,
    });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      openToast(t("board.copiedToClipboard"), "success");
    } else {
      downloadImage("png");
    }
  } catch {
    downloadImage("png");
  } finally {
    stage.position(prevPos);
    stage.scale({ x: prevScale, y: prevScale });
    stage.batchDraw();
    markDirty();
  }
}

// Download Image with unzoomed high-res export
function downloadImage(format: "png" | "jpeg" = "png") {
  const stage = stageRef.value?.getStage();
  if (!stage) return;

  detachTransformer();

  const prevPos = { x: stagePos.x, y: stagePos.y };
  const prevScale = stageScale.value;

  stage.position({ x: 0, y: 0 });
  stage.scale({ x: 1, y: 1 });
  stage.batchDraw();

  const dataUrl = stage.toDataURL({
    mimeType: format === "jpeg" ? "image/jpeg" : "image/png",
    quality: 1,
    pixelRatio: 2,
  });

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

const ACTIVE_FRAME_INTERVAL = 66; // ~15 fps active drawing: cuts rendering load and bandwidth while keeping pen strokes fluid
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

  ctx.fillStyle = canvasTheme.value === "dark" ? "#0f172a" : "#ffffff";
  ctx.fillRect(0, 0, streamCanvas.width, streamCanvas.height);

  try {
    const shapesLayer = shapesLayerRef.value?.getNode();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shapesCanvas = (shapesLayer as any)?.getCanvas?.()?._canvas;
    if (shapesCanvas && shapesCanvas.width > 0 && shapesCanvas.height > 0) {
      ctx.drawImage(shapesCanvas, 0, 0, streamCanvas.width, streamCanvas.height);
    }

    const scratchLayer = scratchLayerRef.value?.getNode();
    if (scratchLayer && (isDrawing.value || scratchLayer.getChildren().length > 0)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scratchCanvas = (scratchLayer as any)?.getCanvas?.()?._canvas;
      if (scratchCanvas && scratchCanvas.width > 0 && scratchCanvas.height > 0) {
        ctx.drawImage(scratchCanvas, 0, 0, streamCanvas.width, streamCanvas.height);
      }
    }

    if (laserPoints.value.length > 0) {
      const laserLayer = laserLayerRef.value?.getNode();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const laserCanvas = (laserLayer as any)?.getCanvas?.()?._canvas;
      if (laserCanvas && laserCanvas.width > 0 && laserCanvas.height > 0) {
        ctx.drawImage(laserCanvas, 0, 0, streamCanvas.width, streamCanvas.height);
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

const isStreamActiveInternal = ref(false);
const effectiveStreamActive = computed(() => !!(props.streamActive || isStreamActiveInternal.value));

function stopActiveStream() {
  isStreamActiveInternal.value = false;
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
    isStreamActiveInternal.value = !!active;
    if (!active) {
      stopActiveStream();
    } else if (!activeStreamTrack) {
      const stream = getStream();
      if (stream) emit("streamStart", stream);
    }
  },
);

function getStream(fps = 10): MediaStream | null {
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
      emit("update:streamActive", false);
    });
  }

  return stream;
}

function toggleStream() {
  if (effectiveStreamActive.value) {
    stopActiveStream();
    emit("streamStop");
    emit("update:streamActive", false);
  } else {
    const stream = getStream();
    if (stream) {
      isStreamActiveInternal.value = true;
      emit("streamStart", stream);
      emit("update:streamActive", true);
    }
  }
}

const toggleMaximize = () => {
  const next = !effectiveFullWindow.value;
  isMaximized.value = next;
  emit("maximize", next);
  emit("fullWindow", next);
  markDirty();
};

// Global Keyboard Shortcuts
useEventListener(window, "keydown", (e: KeyboardEvent) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  if (e.code === "Space" && !isSpacePressed.value) {
    isSpacePressed.value = true;
  }

  if (e.key === "?" || (e.shiftKey && e.key === "/")) {
    e.preventDefault();
    showShortcutsModal.value = !showShortcutsModal.value;
    return;
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

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
    if (selectedShapeId.value) {
      e.preventDefault();
      duplicateSelected();
    }
    return;
  }

  if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedShapeId.value) {
      e.preventDefault();
      deleteSelected();
    }
    return;
  }

  if (e.key === "[" || e.key === "{") {
    if (currentTool.value === "eraser") {
      eraserWidth.value = Math.max(6, eraserWidth.value - 4);
    } else {
      strokeWidth.value = Math.max(1, strokeWidth.value - 2);
    }
    return;
  }

  if (e.key === "]" || e.key === "}") {
    if (currentTool.value === "eraser") {
      eraserWidth.value = Math.min(120, eraserWidth.value + 4);
    } else {
      strokeWidth.value = Math.min(60, strokeWidth.value + 2);
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
    else if (k === "t") currentTool.value = "text";
    else if (k === "s") currentTool.value = "sticky";
    else if (k === "l") currentTool.value = "laser";
    else if (k === "f" && props.maximizable) toggleMaximize();
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
    isStreamActiveInternal.value = true;
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
    text: t("board.text"),
    sticky: t("board.sticky"),
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

const overflowMenuItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [
    {
      label: canvasTheme.value === "dark" ? t("board.themeLight") : t("board.themeDark"),
      phIcon: canvasTheme.value === "dark" ? "PhSun" : "PhMoon",
      command: () => toggleCanvasTheme(),
    },
    {
      label: `${t("board.grid")} (${gridStyle.value})`,
      phIcon: "PhGridFour",
      command: () => toggleGrid(),
    },
    {
      label: t("board.copyImage"),
      phIcon: "PhCopy",
      command: () => copyImageToClipboard(),
    },
    {
      label: t("board.save"),
      phIcon: "PhDownloadSimple",
      command: () => downloadImage("png"),
    },
    {
      separator: true,
    },
    {
      label: t("board.erase"),
      phIcon: "PhTrash",
      danger: true,
      command: () => requestClear(),
    },
  ];

  if (props.maximizable) {
    items.push({
      label: effectiveFullWindow.value ? t("board.exitFullWindow") : t("board.fullWindow"),
      phIcon: effectiveFullWindow.value ? "PhCornersIn" : "PhCornersOut",
      command: () => toggleMaximize(),
    });
  }

  items.push({
    label: t("board.shortcuts"),
    phIcon: "PhQuestion",
    command: () => {
      showShortcutsModal.value = true;
    },
  });

  return items;
});

defineExpose<WhiteboardExposed>({
  getStream,
  downloadImage,
  copyImageToClipboard,
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
    class="flex flex-col select-none relative overflow-hidden text-slate-800 dark:text-slate-100 font-chat-family"
    :class="[
      isStandaloneMaximized ? 'fixed inset-0 z-50 w-screen h-screen' : 'h-full w-full',
      canvasTheme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-800',
    ]"
  >
    <!-- Top Unified Header Bar -->
    <header
      class="flex items-center justify-between px-2.5 sm:px-3 md:px-4 py-2 border-b border-gray-200/80 dark:border-gray-800/80 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md z-20 gap-1.5 sm:gap-2 shrink-0 select-none cursor-default"
      @dblclick.self="maximizable && toggleMaximize()"
    >
      <!-- Left: Title, Live Status, Undo, Redo (Safe History) -->
      <div class="flex items-center gap-1 sm:gap-1.5 md:gap-2 min-w-0 shrink-0">
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-chat-primary/10 text-xs font-bold text-chat-primary shrink-0 select-none">
          <BIcon icon="PhPaintBrush" class="size-4 shrink-0" />
          <span class="truncate max-w-[100px] md:max-w-[140px] xl:max-w-[180px] hidden sm:inline">{{ title || t("board.title") }}</span>
        </div>

        <!-- Live HD Badge if streamActive -->
        <div
          v-if="effectiveStreamActive"
          class="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold select-none shrink-0"
          :title="t('board.streaming')"
        >
          <span class="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span class="hidden xs:inline">{{ t("board.liveHd") }}</span>
        </div>

        <div class="h-4 w-[1px] bg-gray-200 dark:bg-gray-800 mx-0.5 hidden sm:block" />

        <!-- History: Undo & Redo (Destructive Clear safely relocated to overflow menu) -->
        <div class="hidden sm:flex items-center gap-0.5">
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
      </div>

      <!-- Center: Main Drawing Tools Dock (Desktop & Tablet) -->
      <nav class="hidden md:flex items-center gap-0.5 sm:gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 shadow-xs shrink-0 select-none">
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

        <!-- Text (T) -->
        <IconButton
          icon="PhTextT"
          :label="`${t('board.text')} (T)`"
          icon-class="size-4"
          class="rounded-xl transition-all"
          :class="currentTool === 'text' ? 'bg-chat-primary text-white shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
          @click="currentTool = 'text'"
        />

        <!-- Sticky Note (S) -->
        <IconButton
          icon="PhNote"
          :label="`${t('board.sticky')} (S)`"
          icon-class="size-4"
          class="rounded-xl transition-all"
          :class="currentTool === 'sticky' ? 'bg-amber-400 text-amber-950 shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
          @click="currentTool = 'sticky'"
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

      <!-- Right: Zoom, Share to Call, Theme, Grid, Copy, Save, Members, FullWindow, Close -->
      <div class="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <!-- Zoom Controls: Shown on lg+ (1024px+); on <lg, canvas floating zoom pill is used -->
        <div class="hidden lg:flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 border border-slate-200/80 dark:border-slate-700/80">
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
        <button
          v-if="allowStream"
          type="button"
          class="group relative inline-flex items-center justify-center gap-1.5 h-8 px-2 sm:px-2.5 lg:px-3 rounded-xl text-xs font-semibold cursor-pointer select-none transition-all duration-200 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 shrink-0"
          :class="
            effectiveStreamActive
              ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-xs hover:shadow-md hover:shadow-rose-600/25 border border-rose-500/50 focus-visible:outline-rose-500'
              : 'bg-chat-primary hover:bg-chat-primary/90 text-white shadow-xs hover:shadow-md hover:shadow-chat-primary/25 border border-white/20 dark:border-white/10 focus-visible:outline-chat-primary'
          "
          :title="effectiveStreamActive ? t('board.stopSharing') : t('board.shareToCall')"
          :aria-label="effectiveStreamActive ? t('board.stopSharing') : t('board.shareToCall')"
          :aria-pressed="effectiveStreamActive"
          data-testid="whiteboard-stream-btn"
          @click="toggleStream"
        >
          <!-- Pulsing Live Ping Dot when streaming -->
          <span v-if="effectiveStreamActive" class="relative flex size-2 shrink-0" aria-hidden="true">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span class="relative inline-flex size-2 rounded-full bg-white" />
          </span>

          <!-- Broadcast / Stop Icon -->
          <BIcon
            :icon="effectiveStreamActive ? 'PhStopCircle' : 'PhBroadcast'"
            weight="bold"
            class="size-4 shrink-0 transition-transform duration-200 group-hover:scale-110"
          />

          <!-- Text Label: Shown on lg+ (1024px+), compact on tablet/mobile -->
          <span class="hidden lg:inline font-medium tracking-tight">
            {{ effectiveStreamActive ? t('board.stopSharing') : t('board.shareToCall') }}
          </span>
        </button>

        <!-- Canvas Theme Toggle (Light / Dark Chalkboard) - Shown on XL+ (1280px+) -->
        <IconButton
          :icon="canvasTheme === 'dark' ? 'PhSun' : 'PhMoon'"
          :label="canvasTheme === 'dark' ? t('board.themeLight') : t('board.themeDark')"
          icon-class="size-4 text-slate-600 dark:text-slate-300"
          class="hidden xl:flex hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
          @click="toggleCanvasTheme"
        />

        <!-- Grid Style Toggle (Dots, Lines, None) - Shown on XL+ (1280px+) -->
        <IconButton
          icon="PhGridFour"
          :label="`${t('board.grid')} (${gridStyle})`"
          icon-class="size-4"
          class="hidden xl:flex rounded-xl transition-all"
          :class="gridStyle !== 'none' ? 'bg-slate-100 dark:bg-slate-800 text-chat-primary font-bold' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'"
          @click="toggleGrid"
        />

        <!-- Copy Image to Clipboard - Shown on XL+ (1280px+) -->
        <IconButton
          icon="PhCopy"
          :label="t('board.copyImage')"
          icon-class="size-4 text-slate-700 dark:text-slate-200"
          class="hidden xl:flex hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="copyImageToClipboard"
        />

        <!-- Export PNG - Shown on XL+ (1280px+) -->
        <IconButton
          icon="PhDownloadSimple"
          :label="t('board.save')"
          icon-class="size-4 text-slate-700 dark:text-slate-200"
          class="hidden xl:flex hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="downloadImage('png')"
        />

        <!-- Keyboard Shortcuts Help (?) - Shown on XL+ (1280px+) -->
        <IconButton
          icon="PhQuestion"
          :label="t('board.shortcuts')"
          icon-class="size-4 text-slate-500 hover:text-chat-primary"
          class="hidden xl:flex hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="showShortcutsModal = true"
        />

        <!-- Call Members Sidebar Toggle -->
        <button
          v-if="hasParticipants"
          type="button"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer border"
          :class="
            isSidebarOpen
              ? 'bg-chat-primary/10 border-chat-primary/30 text-chat-primary'
              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-chat-primary/40'
          "
          :title="isSidebarOpen ? t('board.collapseMembers') : t('board.expandMembers')"
          @click="emit('toggleSidebar')"
        >
          <CallIcon name="group" class="size-3.5" />
          <span>{{ participantsCount }}</span>
        </button>

        <!-- Full Window / Restore Button -->
        <IconButton
          v-if="maximizable"
          :icon="effectiveFullWindow ? 'PhCornersIn' : 'PhCornersOut'"
          :label="effectiveFullWindow ? t('board.exitFullWindow') : t('board.fullWindow')"
          icon-class="size-4 text-slate-700 dark:text-slate-200"
          class="hidden sm:flex hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="toggleMaximize"
        />

        <!-- Overflow More Options Trigger (Visible on all screens < 1280px xl) -->
        <IconButton
          icon="PhDotsThreeVertical"
          :label="t('board.moreOptions')"
          icon-class="size-4 text-slate-700 dark:text-slate-200"
          class="xl:hidden hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
          @click="overflowMenuRef?.toggle($event)"
        />

        <!-- Close Button -->
        <IconButton
          v-if="showClose"
          icon="PhX"
          :label="t('board.close')"
          icon-class="size-4.5"
          class="hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500"
          @click="emit('close')"
        />
      </div>
    </header>

    <!-- Contextual Floating Properties Bar (Properties Island) -->
    <div
      v-if="currentTool !== 'pan'"
      class="absolute top-14 left-1/2 -translate-x-1/2 z-10 transition-all max-w-[calc(100vw-1rem)] select-none"
    >
      <!-- Collapsed State: Micro Pill -->
      <div
        v-if="isPropertiesCollapsed"
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 dark:bg-slate-800/95 backdrop-blur-md shadow-md border border-slate-200/80 dark:border-slate-700/80 text-xs cursor-pointer hover:border-chat-primary transition-all"
        @click="isPropertiesCollapsed = false"
      >
        <div class="size-3 rounded-full shrink-0" :style="{ backgroundColor: strokeColor }" />
        <span class="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">{{ activeToolLabel }}</span>
        <BIcon icon="PhCaretDown" class="size-3 text-slate-400 shrink-0" />
      </div>

      <!-- Expanded State: Full Controls Island -->
      <div
        v-else
        class="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-md shadow-md border border-slate-200/80 dark:border-slate-700/80 text-xs overflow-x-auto no-scrollbar max-w-[calc(100vw-1.5rem)] whitespace-nowrap"
      >
        <!-- Mode & Size when tool is ERASER -->
        <template v-if="currentTool === 'eraser'">
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors cursor-pointer text-xs"
              :class="eraserMode === 'stroke' ? 'bg-chat-primary text-white shadow-xs font-semibold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'"
              @click="eraserMode = 'stroke'"
            >
              <BIcon icon="PhLightning" class="size-3.5" />
              <span>{{ t("board.strokeEraser") }}</span>
            </button>
            <button
              type="button"
              class="flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors cursor-pointer text-xs"
              :class="eraserMode === 'pixel' ? 'bg-chat-primary text-white shadow-xs font-semibold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'"
              @click="eraserMode = 'pixel'"
            >
              <BIcon icon="PhPaintBrush" class="size-3.5" />
              <span>{{ t("board.pixelEraser") }}</span>
            </button>
          </div>

          <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-0.5" />

          <!-- Eraser Size Presets -->
          <div class="flex items-center gap-1">
            <span class="text-slate-500 dark:text-slate-400 mr-0.5">{{ t("board.eraserSize") }}:</span>
            <button
              v-for="w in [12, 24, 48, 72]"
              :key="w"
              type="button"
              class="px-2 py-0.5 rounded-lg font-mono font-medium transition-colors cursor-pointer"
              :class="eraserWidth === w ? 'bg-chat-primary text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'"
              @click="eraserWidth = w"
            >
              {{ w }}px
            </button>
          </div>
        </template>

        <!-- Properties for TEXT TOOL or TEXT SELECTED -->
        <template v-else-if="currentTool === 'text' || selectedShape?.type === 'text'">
          <!-- Font Size Presets -->
          <div class="flex items-center gap-1">
            <span class="text-slate-500 dark:text-slate-400 text-[11px]">{{ t("board.brushSize") }}:</span>
            <button
              v-for="s in [14, 18, 24, 32, 40]"
              :key="s"
              type="button"
              class="px-1.5 py-0.5 rounded-lg font-mono text-[11px] cursor-pointer transition-colors"
              :class="textFontSize === s ? 'bg-chat-primary text-white font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'"
              @click="setFontSize(s)"
            >
              {{ s }}
            </button>
          </div>

          <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-0.5" />

          <!-- Text Color Swatch & Popover -->
          <button
            type="button"
            :title="t('board.strokeColor')"
            class="size-6 rounded-full border-2 border-white dark:border-slate-800 ring-2 ring-chat-primary/40 shadow-xs flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
            :style="{ backgroundColor: strokeColor }"
            @click="colorPopoverRef?.toggle($event)"
          />

          <!-- Quick Palette -->
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

          <!-- Selection Actions: Bring to front, Send to back, Duplicate, Delete -->
          <template v-if="selectedShapeId">
            <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-0.5" />
            <IconButton icon="PhStackSimple" :label="t('board.bringToFront')" icon-class="size-3.5" class="!p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" @click="bringToFront" />
            <IconButton icon="PhCopy" :label="t('board.duplicate')" icon-class="size-3.5" class="!p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" @click="duplicateSelected" />
            <IconButton icon="PhTrash" :label="t('board.deleteSelected')" icon-class="size-3.5 text-red-500" class="!p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40" @click="deleteSelected" />
          </template>
        </template>

        <!-- Properties for STICKY NOTE TOOL or STICKY NOTE SELECTED -->
        <template v-else-if="currentTool === 'sticky' || selectedShape?.type === 'sticky'">
          <span class="text-slate-500 dark:text-slate-400 text-[11px]">{{ t("board.sticky") }}:</span>
          <div class="flex items-center gap-1">
            <button
              v-for="sc in stickyColorPresets"
              :key="sc"
              type="button"
              class="size-5 rounded-md border border-black/10 dark:border-white/10 transition-transform hover:scale-115 cursor-pointer shadow-xs"
              :class="{ 'ring-2 ring-chat-primary ring-offset-1': stickyColor === sc }"
              :style="{ backgroundColor: sc }"
              @click="setStickyColor(sc)"
            />
          </div>

          <template v-if="selectedShapeId">
            <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-0.5" />
            <IconButton icon="PhStackSimple" :label="t('board.bringToFront')" icon-class="size-3.5" class="!p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" @click="bringToFront" />
            <IconButton icon="PhCopy" :label="t('board.duplicate')" icon-class="size-3.5" class="!p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" @click="duplicateSelected" />
            <IconButton icon="PhTrash" :label="t('board.deleteSelected')" icon-class="size-3.5 text-red-500" class="!p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40" @click="deleteSelected" />
          </template>
        </template>

        <!-- Normal Properties for Drawing / Shapes / Generic Selection -->
        <template v-else>
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

          <!-- Geometry Shape Fill Settings -->
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

          <!-- Shape Actions when selected: Bring to Front, Send to Back, Duplicate, Delete -->
          <template v-if="selectedShapeId">
            <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-0.5" />
            <IconButton icon="PhStackSimple" :label="t('board.bringToFront')" icon-class="size-3.5" class="!p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" @click="bringToFront" />
            <IconButton icon="PhCopy" :label="t('board.duplicate')" icon-class="size-3.5" class="!p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" @click="duplicateSelected" />
            <button
              type="button"
              class="flex items-center gap-1 text-red-500 hover:text-red-600 font-medium px-2 py-0.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
              @click="deleteSelected"
            >
              <BIcon icon="PhTrash" class="size-3.5" />
              <span>{{ t("board.deleteSelected") }}</span>
            </button>
          </template>
        </template>

        <!-- Collapse Island Button -->
        <button
          type="button"
          class="size-5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center cursor-pointer ml-0.5 transition-colors"
          :title="t('board.collapseProperties')"
          @click="isPropertiesCollapsed = true"
        >
          <BIcon icon="PhCaretUp" class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Canvas Area -->
    <div
      ref="containerRef"
      class="flex-1 w-full h-full relative overflow-hidden touch-none"
      :class="[
        canvasTheme === 'dark' ? 'bg-slate-950' : 'bg-white',
        gridStyle === 'dots'
          ? (canvasTheme === 'dark' ? 'whiteboard-dot-grid-dark' : 'whiteboard-dot-grid-light')
          : (gridStyle === 'lines' ? (canvasTheme === 'dark' ? 'whiteboard-line-grid-dark' : 'whiteboard-line-grid-light') : ''),
        isSpacePressed || currentTool === 'pan' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : '',
        currentTool === 'select' ? 'cursor-default' : '',
        currentTool === 'text' ? 'cursor-text' : '',
        currentTool === 'sticky' ? 'cursor-crosshair' : '',
        !isSpacePressed && (currentTool === 'pen' || currentTool === 'brush' || currentTool === 'highlighter' || currentTool === 'eraser' || currentTool === 'laser') ? 'cursor-none' : '',
        !isSpacePressed && (currentTool === 'line' || currentTool === 'arrow' || currentTool === 'rect' || currentTool === 'square' || currentTool === 'circle' || currentTool === 'triangle' || currentTool === 'star') ? 'cursor-crosshair' : '',
      ]"
      @pointerenter="onContainerPointerEnter"
      @pointerleave="onContainerPointerLeave"
      @pointermove="onContainerPointerMove"
    >
      <!-- Dynamic Brush / Eraser Cursor Preview Ring -->
      <div
        v-show="isCursorInsideCanvas && (currentTool === 'pen' || currentTool === 'brush' || currentTool === 'highlighter' || currentTool === 'eraser' || currentTool === 'laser')"
        ref="cursorIndicatorRef"
        class="pointer-events-none absolute top-0 left-0 z-30 rounded-full transform-gpu transition-opacity duration-100 will-change-transform"
        :style="cursorIndicatorStyle"
      >
        <div
          v-if="currentTool === 'pen' || currentTool === 'brush' || currentTool === 'highlighter'"
          class="size-1 rounded-full bg-slate-900 dark:bg-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 shadow-xs"
        />
      </div>

      <!-- In-Canvas Inline Text & Sticky Editor Overlay -->
      <div
        v-if="isEditingText"
        class="absolute z-40 transform-gpu"
        :style="{
          left: `${editingBox.left}px`,
          top: `${editingBox.top}px`,
          width: `${editingBox.width}px`,
          minHeight: `${editingBox.height}px`,
        }"
      >
        <textarea
          ref="inlineTextareaRef"
          v-model="editingText"
          class="w-full h-full p-2.5 rounded-xl border-2 border-chat-primary outline-hidden shadow-2xl resize-none font-chat-family"
          :style="{
            fontSize: `${editingBox.fontSize}px`,
            color: editingBox.color,
            backgroundColor: editingBox.isSticky ? editingBox.bgColor : (canvasTheme === 'dark' ? '#1e293b' : '#ffffff'),
          }"
          :placeholder="t('board.typeHere')"
          @blur="finishEditingText"
          @keydown.esc="finishEditingText"
          @keydown.enter="onInlineTextEnter"
        />
      </div>

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
        @touchstart="handleStageTouchStart"
        @touchmove="handleStageTouchMove"
        @touchend="handleStageTouchEnd"
        @touchcancel="handleStageTouchEnd"
        @wheel="handleWheel"
      >
        <!-- Layer 1: Background Layer (Opaque rectangle matching canvas theme) -->
        <Layer :config="{ listening: false }">
          <Rect
            :config="{
              id: 'bg-rect',
              name: 'bg-rect',
              x: -5000,
              y: -5000,
              width: 10000,
              height: 10000,
              fill: canvasTheme === 'dark' ? '#0f172a' : '#ffffff',
              listening: false,
            }"
          />
        </Layer>

        <!-- Layer 2: Committed Shapes Layer -->
        <Layer ref="shapesLayerRef" :config="{ listening: currentTool === 'select' }">
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

            <!-- Text Shape -->
            <Text
              v-else-if="item.type === 'text'"
              :config="getTextConfig(item as TextShape)"
              @click="handleShapeClick(item.id)"
              @tap="handleShapeClick(item.id)"
              @dblclick="startEditingText(item as TextShape)"
              @dragend="handleShapeDragEnd(item.id, $event)"
              @transformend="handleShapeTransformEnd(item.id, $event)"
            />

            <!-- Sticky Note Shape -->
            <Group
              v-else-if="item.type === 'sticky'"
              :config="getStickyGroupConfig(item as StickyShape)"
              @click="handleShapeClick(item.id)"
              @tap="handleShapeClick(item.id)"
              @dblclick="startEditingText(item as StickyShape)"
              @dragend="handleShapeDragEnd(item.id, $event)"
              @transformend="handleShapeTransformEnd(item.id, $event)"
            >
              <Rect
                :config="{
                  width: (item as StickyShape).width,
                  height: (item as StickyShape).height,
                  fill: (item as StickyShape).fill,
                  cornerRadius: 10,
                  shadowColor: '#000000',
                  shadowBlur: 8,
                  shadowOpacity: 0.12,
                  shadowOffset: { x: 2, y: 3 },
                }"
              />
              <Text
                :config="{
                  x: 12,
                  y: 12,
                  width: (item as StickyShape).width - 24,
                  height: (item as StickyShape).height - 24,
                  text: (item as StickyShape).text,
                  fontSize: (item as StickyShape).fontSize || 15,
                  fontFamily: (item as StickyShape).fontFamily || getDefaultFontFamily(),
                  fill: (item as StickyShape).textColor || '#1e293b',
                  wrap: 'word',
                }"
              />
            </Group>
          </template>
        </Layer>

        <!-- Layer 3: Active Scratch Layer -->
        <Layer ref="scratchLayerRef" :config="{ listening: false }" />

        <!-- Layer 4: Laser Pointer Layer -->
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

    <!-- Mobile Bottom Drawing Dock (Thumbs Ergonomic Zone) -->
    <nav
      class="md:hidden absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 sm:gap-1 p-1 rounded-2xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-md shadow-xl border border-slate-200/80 dark:border-slate-700/80 max-w-[calc(100vw-1.5rem)] overflow-x-auto no-scrollbar select-none"
      data-testid="whiteboard-mobile-bottom-dock"
    >
      <!-- History: Undo & Redo (Thumb Accessible on Mobile) -->
      <IconButton
        icon="PhArrowUUpLeft"
        :label="`${t('board.undo')} (Ctrl+Z)`"
        :disabled="!canUndo"
        icon-class="size-4"
        class="rounded-xl transition-all !p-1.5 shrink-0 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
        @click="undo"
      />
      <IconButton
        icon="PhArrowUUpRight"
        :label="`${t('board.redo')} (Ctrl+Y)`"
        :disabled="!canRedo"
        icon-class="size-4"
        class="rounded-xl transition-all !p-1.5 shrink-0 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
        @click="redo"
      />

      <div class="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-0.5 shrink-0" />

      <!-- Select (V) -->
      <IconButton
        icon="PhCursor"
        :label="`${t('board.select')} (V)`"
        icon-class="size-4"
        class="rounded-xl transition-all !p-1.5 shrink-0"
        :class="currentTool === 'select' ? 'bg-chat-primary text-white shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
        @click="currentTool = 'select'"
      />

      <!-- Pan / Hand (Space / M) -->
      <IconButton
        icon="PhHandPalm"
        :label="`${t('board.pan')} (Space / M)`"
        icon-class="size-4"
        class="rounded-xl transition-all !p-1.5 shrink-0"
        :class="currentTool === 'pan' ? 'bg-chat-primary text-white shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
        @click="currentTool = 'pan'"
      />

      <!-- Pen (P) -->
      <IconButton
        icon="PhPencilSimple"
        :label="`${t('board.pen')} (P)`"
        icon-class="size-4"
        class="rounded-xl transition-all !p-1.5 shrink-0"
        :class="currentTool === 'pen' ? 'bg-chat-primary text-white shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
        @click="currentTool = 'pen'"
      />

      <!-- Brush (B) -->
      <IconButton
        icon="PhPaintBrush"
        :label="`${t('board.brush')} (B)`"
        icon-class="size-4"
        class="rounded-xl transition-all !p-1.5 shrink-0"
        :class="currentTool === 'brush' ? 'bg-chat-primary text-white shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
        @click="currentTool = 'brush'"
      />

      <!-- Highlighter (H) -->
      <IconButton
        icon="PhHighlighterCircle"
        :label="`${t('board.highlighter')} (H)`"
        icon-class="size-4"
        class="rounded-xl transition-all !p-1.5 shrink-0"
        :class="currentTool === 'highlighter' ? 'bg-chat-primary text-white shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
        @click="currentTool = 'highlighter'"
      />

      <!-- Eraser (E) -->
      <IconButton
        icon="PhEraser"
        :label="`${t('board.eraser')} (E)`"
        icon-class="size-4"
        class="rounded-xl transition-all !p-1.5 shrink-0"
        :class="currentTool === 'eraser' ? 'bg-chat-primary text-white shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
        @click="currentTool = 'eraser'"
      />

      <!-- Text (T) -->
      <IconButton
        icon="PhTextT"
        :label="`${t('board.text')} (T)`"
        icon-class="size-4"
        class="rounded-xl transition-all !p-1.5 shrink-0"
        :class="currentTool === 'text' ? 'bg-chat-primary text-white shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
        @click="currentTool = 'text'"
      />

      <!-- Sticky Note (S) -->
      <IconButton
        icon="PhNote"
        :label="`${t('board.sticky')} (S)`"
        icon-class="size-4"
        class="rounded-xl transition-all !p-1.5 shrink-0"
        :class="currentTool === 'sticky' ? 'bg-amber-400 text-amber-950 shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
        @click="currentTool = 'sticky'"
      />

      <!-- Laser Pointer (L) -->
      <IconButton
        icon="PhCrosshairSimple"
        :label="`${t('board.laser')} (L)`"
        icon-class="size-4"
        class="rounded-xl transition-all !p-1.5 shrink-0"
        :class="currentTool === 'laser' ? 'bg-red-500 text-white shadow-xs font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700/80'"
        @click="currentTool = 'laser'"
      />

      <div class="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-0.5 shrink-0" />

      <!-- Shapes Popover Button -->
      <Button
        rounded
        text
        size="small"
        :aria-label="t('board.shapes')"
        class="!p-1.5 rounded-xl transition-all shrink-0"
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

    <!-- Bottom Floating Navigation & Status Bar -->
    <div class="absolute bottom-16 md:bottom-4 start-3 md:start-4 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-md shadow-md border border-slate-200/80 dark:border-slate-700/80 text-xs select-none">
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

    <!-- Canvas Floating Zoom Pill: Shown on <lg screens (mobile & tablet) where zoom is not in header -->
    <div class="lg:hidden absolute bottom-16 md:bottom-4 end-3 md:end-4 z-10 flex items-center bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl p-0.5 border border-slate-200/80 dark:border-slate-700/80 shadow-md select-none">
      <button
        type="button"
        class="size-6 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs cursor-pointer transition-colors"
        :title="t('board.zoomOut')"
        :disabled="stageScale <= 0.25"
        @click="zoomOut"
      >
        −
      </button>
      <button
        type="button"
        class="px-1.5 h-6 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-mono text-[11px] font-semibold flex items-center justify-center cursor-pointer transition-colors"
        :title="t('board.resetZoom')"
        @click="resetZoom"
      >
        {{ Math.round(stageScale * 100) }}%
      </button>
      <button
        type="button"
        class="size-6 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs cursor-pointer transition-colors"
        :title="t('board.zoomIn')"
        :disabled="stageScale >= 4"
        @click="zoomIn"
      >
        +
      </button>
    </div>

    <!-- Desktop Bottom Right Tool Mode Pill -->
    <div class="absolute bottom-4 end-4 z-10 hidden md:flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-md shadow-md border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-500 dark:text-slate-400 select-none">
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
      <div class="p-2 sm:p-3 w-72 max-w-[calc(100vw-2rem)] select-none">
        <WhiteboardRgbPicker
          :model-value="strokeColor"
          @update:model-value="selectStrokeColor"
        />
      </div>
    </Popover>

    <!-- Fill Color Popover -->
    <Popover ref="fillColorPopover" :dir="dir" class="vue-chat">
      <div class="p-2 sm:p-3 w-72 max-w-[calc(100vw-2rem)] select-none">
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

    <!-- Mobile Overflow Menu -->
    <Menu ref="overflowMenu" :model="overflowMenuItems" :popup="true" :dir="dir" class="vue-chat">
      <template #item="{ item }">
        <div
          class="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 w-full transition-colors"
          :class="item.danger ? 'text-red-500 hover:text-red-600' : 'text-slate-700 dark:text-slate-200'"
        >
          <BIcon
            v-if="item.phIcon"
            :icon="item.phIcon"
            class="size-4 shrink-0"
            :class="item.danger ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'"
          />
          <span class="truncate flex-1 font-medium">{{ item.label }}</span>
        </div>
      </template>
    </Menu>

    <!-- Keyboard Shortcuts Dialog -->
    <Dialog
      v-model:visible="showShortcutsModal"
      modal
      :header="t('board.shortcuts')"
      :dir="dir"
      class="vue-chat max-w-sm w-full"
    >
      <div class="flex flex-col gap-3.5 text-xs select-none pt-1">
        <div class="space-y-1.5">
          <div class="font-bold text-slate-700 dark:text-slate-200 border-b pb-1 dark:border-slate-700">
            Tools
          </div>
          <div class="grid grid-cols-2 gap-1.5 text-slate-600 dark:text-slate-300">
            <div class="flex justify-between items-center"><span class="font-mono font-semibold">V</span><span>Select</span></div>
            <div class="flex justify-between items-center"><span class="font-mono font-semibold">M / Space</span><span>Pan</span></div>
            <div class="flex justify-between items-center"><span class="font-mono font-semibold">P</span><span>Pen</span></div>
            <div class="flex justify-between items-center"><span class="font-mono font-semibold">B</span><span>Brush</span></div>
            <div class="flex justify-between items-center"><span class="font-mono font-semibold">H</span><span>Highlighter</span></div>
            <div class="flex justify-between items-center"><span class="font-mono font-semibold">E</span><span>Eraser</span></div>
            <div class="flex justify-between items-center"><span class="font-mono font-semibold">T</span><span>Text</span></div>
            <div class="flex justify-between items-center"><span class="font-mono font-semibold">S</span><span>Sticky Note</span></div>
            <div class="flex justify-between items-center"><span class="font-mono font-semibold">L</span><span>Laser</span></div>
          </div>
        </div>

        <div class="space-y-1.5">
          <div class="font-bold text-slate-700 dark:text-slate-200 border-b pb-1 dark:border-slate-700">
            Actions
          </div>
          <div class="grid grid-cols-2 gap-1.5 text-slate-600 dark:text-slate-300">
            <div class="flex justify-between items-center"><span class="font-mono font-semibold">Ctrl+Z</span><span>Undo</span></div>
            <div class="flex justify-between items-center"><span class="font-mono font-semibold">Ctrl+Y / ⇧⌘Z</span><span>Redo</span></div>
            <div class="flex justify-between items-center"><span class="font-mono font-semibold">Ctrl+D</span><span>Duplicate</span></div>
            <div class="flex justify-between items-center"><span class="font-mono font-semibold">Del / ⌫</span><span>Delete</span></div>
            <div class="flex justify-between items-center"><span class="font-mono font-semibold">[ / ]</span><span>Brush Size</span></div>
            <div class="flex justify-between items-center"><span class="font-mono font-semibold">Ctrl+Scroll</span><span>Zoom</span></div>
            <div class="flex justify-between items-center"><span class="font-mono font-semibold">F</span><span>Full Window</span></div>
          </div>
        </div>
      </div>
    </Dialog>

    <!-- Clear Board Confirmation Dialog -->
    <Dialog
      v-model:visible="showClearConfirmModal"
      modal
      :header="t('board.erase')"
      :dir="dir"
      class="vue-chat max-w-sm w-full"
    >
      <div class="flex flex-col gap-4 text-xs select-none pt-1">
        <div class="flex items-start gap-3">
          <div class="size-9 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
            <BIcon icon="PhTrash" class="size-5" />
          </div>
          <div class="flex-1 space-y-1">
            <div class="font-bold text-slate-800 dark:text-slate-100 text-sm">
              {{ t("board.erase") }}
            </div>
            <p class="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
              {{ t("board.clearConfirmMessage") }}
            </p>
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button
            size="small"
            severity="secondary"
            text
            :label="t('board.cancel')"
            class="text-xs"
            @click="showClearConfirmModal = false"
          />
          <Button
            size="small"
            severity="danger"
            :label="t('board.erase')"
            class="text-xs"
            @click="confirmClear"
          />
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.whiteboard-dot-grid-light {
  background-image: radial-gradient(rgba(148, 163, 184, 0.4) 1.5px, transparent 1.5px);
  background-size: 24px 24px;
}
.whiteboard-dot-grid-dark {
  background-image: radial-gradient(rgba(148, 163, 184, 0.3) 1.5px, transparent 1.5px);
  background-size: 24px 24px;
}
.whiteboard-line-grid-light {
  background-image:
    linear-gradient(to right, rgba(226, 232, 240, 0.8) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(226, 232, 240, 0.8) 1px, transparent 1px);
  background-size: 24px 24px;
}
.whiteboard-line-grid-dark {
  background-image:
    linear-gradient(to right, rgba(51, 65, 85, 0.6) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(51, 65, 85, 0.6) 1px, transparent 1px);
  background-size: 24px 24px;
}
</style>
