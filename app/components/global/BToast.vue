<template>
  <Teleport to="body">
      <div
        class="pointer-events-none fixed bottom-0 z-10000 w-full max-w-dvw p-5 bg-transparent md:max-w-203"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <!-- 
                    OUTER DIV: Preserves exact original positioning and mount animation.
                    This prevents the drag logic from breaking Tailwind's coordinate system.
                -->
        <div
          class="pointer-events-auto transition-all duration-300 ease-in-out"
          :class="
            isOpen ? 'translate-y-0 opacity-100' : 'translate-y-15 opacity-0'
          "
        >
          <!-- 
                        INNER DIV: Handles the drag transform, background color, and touch events.
                    -->
          <div
            :class="[
              backgroundColor,
              isDragging
                ? 'transition-none'
                : 'transition-transform duration-300 ease-in-out',
            ]"
            :style="{ transform: `translateY(${dragY}px)` }"
            class="flex cursor-grab items-center gap-x-2 rounded-xl px-4 py-3 select-none touch-none pointer-events-auto active:cursor-grabbing md:cursor-default md:active:cursor-default"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
          >
            <BIcon :icon="toastIcon" class="h-5 w-5 shrink-0 fill-white" />
            <div class="flex-1 select-none text-label-md text-white">
              {{ toastMessage }}
            </div>
            <BIcon
              icon="PhX"
              class="hover:opacity-70 h-5 w-5 shrink-0 cursor-pointer fill-white transition-opacity"
              @click="closeToast"
            />
          </div>
        </div>
      </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";

type ToastType = "success" | "error" | "warning" | "info";

const isOpen = ref(false);
const toastType = ref<ToastType>("info");
const toastMessage = ref("");
const currentDuration = ref(4000);
let timer: ReturnType<typeof setTimeout> | null = null;

// Drag State
const dragY = ref(0);
const isDragging = ref(false);
let startY = 0;
const threshold = 50;

const { width } = useWindowSize();
const isMobile = computed(() => width.value < 768);

const clearTimer = () => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
};

const startTimer = () => {
  clearTimer();
  timer = setTimeout(() => {
    closeToast();
  }, currentDuration.value);
};

const onPointerDown = (e: PointerEvent) => {
  if (!isMobile.value) return;

  isDragging.value = true;
  startY = e.clientY;

  // Pause auto-close timer while holding
  clearTimer();

  // Capture pointer so fast swipes don't break tracking
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
};

const onPointerMove = (e: PointerEvent) => {
  if (!isMobile.value || !isDragging.value) return;

  const deltaY = e.clientY - startY;

  // Only allow dragging downwards to dismiss
  if (deltaY > 0) {
    dragY.value = deltaY;
  }
};

const onPointerUp = (e: PointerEvent) => {
  if (!isMobile.value || !isDragging.value) return;

  isDragging.value = false;

  // Release capture
  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

  // Check if user dragged past the closing threshold
  if (dragY.value > threshold) {
    closeToast();
  } else {
    // Snap back to original position
    dragY.value = 0;

    // Resume the auto-close timer
    startTimer();
  }
};

const openToast = (
  message: string,
  type: ToastType = "info",
  duration: number = 4000,
) => {
  clearTimer();

  currentDuration.value = duration;
  dragY.value = 0;
  isDragging.value = false;

  toastType.value = type;
  toastMessage.value = message;
  isOpen.value = true;

  startTimer();
};

const closeToast = () => {
  isOpen.value = false;
  clearTimer();

  setTimeout(() => {
    dragY.value = 0;
  }, 300);
};

const backgroundColor = computed(() => {
  switch (toastType.value) {
    case "success":
      return "bg-chat-primary";
    case "error":
      return "bg-chat-error";
    case "warning":
      return "bg-orange-500";
    case "info":
      return "bg-chat-on-background";
  }
});

const toastIcon = computed(() => {
  switch (toastType.value) {
    case "success":
      return "PhCheckCircle";
    case "error":
      return "PhWarningOctagon";
    case "warning":
      return "PhWarning";
    case "info":
      return "PhInfo";
  }
});

// Cleanup timer if the component is destroyed while a toast is active
onBeforeUnmount(clearTimer);

defineExpose({
  openToast,
  closeToast,
});
</script>
