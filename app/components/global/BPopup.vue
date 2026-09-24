<template>
    <Teleport to="body">
      <div
        class="vue-chat popup-el fixed flex w-dvw h-dvh z-9999 transition-all duration-300 ease-in-out"
        :class="[
          isMobile ? 'items-end' : 'items-center justify-center',
          isOpen
            ? 'pointer-events-auto visible bg-[#0A0A0A]/20 backdrop-blur-sm dark:bg-white/20'
            : 'pointer-events-none invisible bg-[#0A0A0A]/0 backdrop-blur-none dark:bg-white/0',
        ]"
        @mousedown.self="onBackdropMouseDown"
        @mouseup.self="onBackdropMouseUp"
        @touchstart.self="onBackdropTouchDown"
        @touchend.self="onBackdropTouchUp"
      >
        <div
          ref="tabContent"
          :style="isMobile ? { transform: `translateY(${translateY}px)` } : {}"
          :class="[
            'relative rounded-t-xl bg-chat-background md:rounded-xl',
            isMobile ? 'w-full' : 'max-w-[90vw] lg:max-w-max',
            isDragging
              ? 'transition-none'
              : 'transition-all duration-300 ease-in-out',
            isOpen
              ? 'pointer-events-auto visible opacity-100'
              : 'pointer-events-none invisible opacity-0',
            !noPadding ? 'p-3' : 'p-0',
            !isMobile && (isOpen ? 'scale-100' : 'scale-95'),
            isMobile && (isOpen ? 'translate-y-0' : 'translate-y-full'),
          ]"
        >
          <!-- Mobile Drag Handle -->
          <div
            v-if="isMobile"
            class="w-full flex cursor-grab justify-center pb-4 pt-2 active:cursor-grabbing"
            @mousedown="startDrag"
            @touchstart="startDrag"
          >
            <div class="h-1.5 w-12 rounded-full bg-chat-outline" />
          </div>

          <!-- Header -->
          <div
            v-if="hasClose || title.trim()"
            class="flex w-full items-center gap-x-3 pb-3"
          >
            <div
              v-if="hasClose"
              class="flex h-7 w-7 cursor-pointer items-center justify-center transition-colors"
              @click="close"
            >
              <BIcon icon="PhX" class="h-4 w-4 fill-chat-on-background" />
            </div>
            <div
              v-if="title.trim()"
              class="select-none text-label-sm text-chat-on-background"
            >
              {{ title }}
            </div>
          </div>

          <!-- Content -->
          <div class="whitespace-nowrap text-wrap">
            <slot />
          </div>
        </div>
      </div>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import type { Popup } from "~/types/components/popup";

const props = withDefaults(
  defineProps<{
    noPadding?: boolean;
    hasClose?: boolean;
    title?: string;
    autoClose?: boolean;
  }>(),
  {
    noPadding: false,
    hasClose: false,
    title: "",
    autoClose: true,
  },
);

const emit = defineEmits<{
  closed: [];
  close: [];
}>();

const { width } = useWindowSize();
const isMobile = computed(() => width.value < 768);

const isOpen = ref(false);
const isDragging = ref(false);
const startY = ref(0);
const translateY = ref(0);
const backdropDown = ref(false);

const open = () => {
  translateY.value = 0;
  isOpen.value = true;
};

const close = () => {
  if (!props.autoClose) return;
  isOpen.value = false;
  backdropDown.value = false;
  emit("close");

  setTimeout(() => {
    if (!isOpen.value) {
      emit("closed");
      translateY.value = 0;
    }
  }, 300);
};

// --- Drag to Close Logic ---
const startDrag = (event: MouseEvent | TouchEvent) => {
  if (!isMobile.value) return;
  isDragging.value = true;
  startY.value =
    event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;

  window.addEventListener("mousemove", onDrag);
  window.addEventListener("mouseup", endDrag);
  window.addEventListener("touchmove", onDrag, { passive: false });
  window.addEventListener("touchend", endDrag);
};

const onDrag = (event: MouseEvent | TouchEvent) => {
  if (!isDragging.value) return;

  // Prevent background scrolling while dragging the popup
  if (event instanceof TouchEvent) {
    event.preventDefault();
  }

  const currentY =
    event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
  const deltaY = currentY - startY.value;

  // Only allow dragging down
  translateY.value = deltaY > 0 ? deltaY : 0;
};

const endDrag = () => {
  if (!isDragging.value) return;
  isDragging.value = false;

  // If dragged down enough, close it
  if (translateY.value > 100) {
    if (props.autoClose) {
      close();
    }
  } else {
    translateY.value = 0;
  }

  window.removeEventListener("mousemove", onDrag);
  window.removeEventListener("mouseup", endDrag);
  window.removeEventListener("touchmove", onDrag);
  window.removeEventListener("touchend", endDrag);
};

// --- Backdrop Click Logic (Prevents closing if drag starts inside popup) ---
const onBackdropMouseDown = () => {
  backdropDown.value = true;
};
const onBackdropMouseUp = (event: MouseEvent) => {
  if (backdropDown.value && event.target === event.currentTarget) close();
  backdropDown.value = false;
};

const onBackdropTouchDown = () => {
  backdropDown.value = true;
};
const onBackdropTouchUp = (event: TouchEvent) => {
  if (backdropDown.value && event.target === event.currentTarget) close();
  backdropDown.value = false;
};

// --- Body Scroll Lock ---
watch(isOpen, (val) => {
  if (typeof window === "undefined") return;
  const html = document.documentElement;

  if (val) {
    // Lock scroll when opening
    html.style.overflow = "hidden";
  } else {
    // Unlock scroll after closing animation finishes
    setTimeout(() => {
      html.style.overflow = "";
    }, 300);
  }
});

// Cleanup listeners if component is unmounted while dragging
onUnmounted(() => {
  window.removeEventListener("mousemove", onDrag);
  window.removeEventListener("mouseup", endDrag);
  window.removeEventListener("touchmove", onDrag);
  window.removeEventListener("touchend", endDrag);

  // Restore scroll just in case
  if (typeof window !== "undefined") {
    document.documentElement.style.overflow = "";
  }
});

defineExpose({ open, close } as Popup);
</script>

<style scoped>
/* Changed from ID to Class to prevent DOM conflicts if multiple popups are mounted */
.popup-el {
  position: fixed !important;
  top: 0px !important;
  left: 0px !important;
}

/* 
  Visibility is the key. 
  Transitions work on visibility: it stays 'visible' until the timer hits 0.
*/
.visible {
  visibility: visible !important;
}

.invisible {
  visibility: hidden !important;
}
</style>
