<script setup lang="ts">
/**
 * A photo in the media viewer, fitted to the stage, with zoom and pan: double-click or double-tap
 * zooms in on that point (and back out), the wheel or a pinch zooms around the pointer, and a drag
 * pans while zoomed in. At fit size a horizontal swipe asks for the neighbouring item instead.
 * A photo smaller than the stage is scaled up to fit it; a tap beside the photo asks to close.
 */
import { computed, reactive, ref } from "vue";
import { useElementSize } from "@vueuse/core";
import ProgressSpinner from "primevue/progressspinner";
import { ZOOM_MAX as MAX, ZOOM_MIN as MIN } from "~/utils/media";

defineProps<{ src: string }>();

const emit = defineEmits<{
  swipe: [direction: "left" | "right"];
  /** The new scale, 1 at fit size. */
  zoomed: [scale: number];
  dismiss: [];
}>();

const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 300;
const SWIPE_PX = 60;
const BUTTON_STEP = 1.5;

const stageEl = ref<HTMLElement | null>(null);
const imageEl = ref<HTMLElement | null>(null);
const view = reactive({ scale: 1, x: 0, y: 0 });
const isZoomed = computed(() => view.scale > 1.01);
const animate = ref(false);
const loaded = ref(false);

// Sized from the photo's own pixels, not CSS max sizes: those never grow a small photo.
const { width: stageW, height: stageH } = useElementSize(stageEl);
const natural = ref<{ w: number; h: number } | null>(null);
const fitted = computed(() => {
  const n = natural.value;
  if (!n || !stageW.value || !stageH.value) return null;
  const k = Math.min(stageW.value / n.w, stageH.value / n.h);
  return { width: `${n.w * k}px`, height: `${n.h * k}px` };
});

const onLoad = (event: Event) => {
  const img = event.target as HTMLImageElement;
  if (img.naturalWidth && img.naturalHeight) natural.value = { w: img.naturalWidth, h: img.naturalHeight };
  loaded.value = true;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keeps the photo covering the stage it has grown past, so it cannot be dragged off screen. */
const clampPan = () => {
  const el = imageEl.value;
  if (!el) return;
  const maxX = (el.offsetWidth * (view.scale - 1)) / 2;
  const maxY = (el.offsetHeight * (view.scale - 1)) / 2;
  view.x = clamp(view.x, -maxX, maxX);
  view.y = clamp(view.y, -maxY, maxY);
};

/** Scales to `next`, keeping the point under (clientX, clientY) where it is on screen. */
const zoomTo = (next: number, clientX: number, clientY: number) => {
  const el = imageEl.value;
  if (!el) return;
  const target = clamp(next, MIN, MAX);
  const rect = el.getBoundingClientRect();
  // Offset of the point from the photo's centre, in unscaled pixels.
  const px = (clientX - (rect.left + rect.width / 2)) / view.scale;
  const py = (clientY - (rect.top + rect.height / 2)) / view.scale;
  view.x += (view.scale - target) * px;
  view.y += (view.scale - target) * py;
  view.scale = target;
  if (target === MIN) {
    view.x = 0;
    view.y = 0;
  }
  clampPan();
  emit("zoomed", view.scale);
};

const reset = () => {
  animate.value = true;
  view.scale = 1;
  view.x = 0;
  view.y = 0;
  emit("zoomed", 1);
};

/** The zoom buttons and keys: a step in or out around the stage's centre. */
const zoomStep = (direction: 1 | -1) => {
  const rect = stageEl.value?.getBoundingClientRect();
  if (!rect) return;
  animate.value = true;
  zoomTo(view.scale * BUTTON_STEP ** direction, rect.left + rect.width / 2, rect.top + rect.height / 2);
};

defineExpose({ reset, isZoomed, zoomStep });

const onWheel = (event: WheelEvent) => {
  animate.value = false;
  zoomTo(view.scale * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
};

// --- Pointers: pan, pinch, double tap and swipe share one set of listeners. ---
const pointers = new Map<number, { x: number; y: number }>();
let gesture: { x: number; y: number; moved: boolean; beside: boolean } | null = null;
let pinch: { distance: number; scale: number } | null = null;
let lastTap = { time: 0, x: 0, y: 0 };

const distance = () => {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
};

const onPointerDown = (event: PointerEvent) => {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  animate.value = false;
  if (pointers.size === 1) {
    // On the stage itself, not the photo: the empty space around it.
    gesture = { x: event.clientX, y: event.clientY, moved: false, beside: event.target === event.currentTarget };
  } else if (pointers.size === 2) {
    pinch = { distance: distance(), scale: view.scale };
    gesture = null;
  }
};

const onPointerMove = (event: PointerEvent) => {
  const last = pointers.get(event.pointerId);
  if (!last) return;
  const dx = event.clientX - last.x;
  const dy = event.clientY - last.y;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    zoomTo(pinch.scale * (distance() / pinch.distance), (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
    return;
  }
  if (!gesture) return;
  if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) gesture.moved = true;
  if (isZoomed.value) {
    view.x += dx;
    view.y += dy;
    clampPan();
  }
};

const onPointerUp = (event: PointerEvent) => {
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!gesture || pointers.size > 0) return;
  const { x, y, moved, beside } = gesture;
  gesture = null;

  if (!moved && beside) {
    emit("dismiss");
    return;
  }
  if (!moved) {
    const now = event.timeStamp;
    const isDouble =
      now - lastTap.time < DOUBLE_TAP_MS &&
      Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 24;
    lastTap = isDouble ? { time: 0, x: 0, y: 0 } : { time: now, x: event.clientX, y: event.clientY };
    if (isDouble) {
      animate.value = true;
      if (isZoomed.value) reset();
      else zoomTo(DOUBLE_TAP_ZOOM, event.clientX, event.clientY);
    }
    return;
  }

  const dx = event.clientX - x;
  const dy = event.clientY - y;
  if (!isZoomed.value && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
    emit("swipe", dx < 0 ? "left" : "right");
  }
};
</script>

<template>
  <div
    ref="stageEl"
    class="relative flex size-full touch-none items-center justify-center overflow-hidden select-none"
    :class="isZoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'"
    data-testid="viewer-image"
    :data-zoomed="String(isZoomed)"
    @wheel.prevent="onWheel"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div
      ref="imageEl"
      class="max-h-full max-w-full will-change-transform"
      :class="animate && 'transition-transform duration-200 ease-out motion-reduce:transition-none'"
      :style="{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }"
    >
      <img
        :src="src"
        alt=""
        draggable="false"
        class="block object-contain transition-opacity duration-300"
        :class="[
          loaded ? 'opacity-100' : 'opacity-0',
          !fitted && 'max-h-[calc(100dvh-10rem)] max-w-dvw md:max-w-[calc(100dvw-9rem)]',
        ]"
        :style="fitted ?? undefined"
        @load="onLoad"
        @error="loaded = true"
      />
    </div>
    <ProgressSpinner
      v-if="!loaded"
      stroke-width="3"
      class="absolute! size-10! [&_circle]:stroke-white!"
    />
  </div>
</template>
