<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted, reactive } from "vue";
import { useEventListener, useMediaQuery, useWindowSize } from "@vueuse/core";
import Whiteboard, { type WhiteboardExposed } from "./Whiteboard.vue";
import type { WhiteboardTool } from "./types";
import BIcon from "~/components/global/BIcon.vue";
import CallStageVideo from "~/components/call/CallStageVideo.vue";
import CallIcon from "~/components/call/CallIcon.vue";
import { useCallStore } from "~/stores/callStore";
import type { Participant } from "~/composables/call/session";
import { nameInitials } from "~/utils/avatar";
import useLocalI18n, { useDirection } from "~/composables/useLocalI18n";
import { callPaintBoard, chat } from "@i18n/locales";
import Tooltip from "primevue/tooltip";

const vTooltip = Tooltip;
const tt = (text: string, showDelay = 300) => ({
  value: text,
  class: "vue-chat font-chat-family",
  showDelay,
});

const props = withDefaults(
  defineProps<{
    visible?: boolean;
    modelValue?: boolean;
    initialTool?: WhiteboardTool;
    initialColor?: string;
    maximizable?: boolean;
    fullWindow?: boolean;
    dismissableMask?: boolean;
    modal?: boolean;
    title?: string;
    streamActive?: boolean;
    allowStream?: boolean;
    participants?: Participant[];
    draggable?: boolean;
    resizable?: boolean;
  }>(),
  {
    visible: undefined,
    modelValue: undefined,
    initialTool: "pen",
    initialColor: "#2563eb",
    maximizable: true,
    fullWindow: false,
    dismissableMask: false, // Prevents accidental closing during active drawing
    modal: true,
    title: "",
    streamActive: false,
    allowStream: true,
    participants: undefined,
    draggable: true,
    resizable: true,
  },
);

const emit = defineEmits<{
  (e: "update:visible", val: boolean): void;
  (e: "update:modelValue", val: boolean): void;
  (e: "close"): void;
  (e: "maximize"): void;
  (e: "unmaximize"): void;
  (e: "fullWindow", val: boolean): void;
  (e: "update:fullWindow", val: boolean): void;
  (e: "streamStart", stream: MediaStream): void;
  (e: "streamStop"): void;
  (e: "update:streamActive", val: boolean): void;
}>();

const isVisible = computed({
  get: () => (props.visible !== undefined ? props.visible : (props.modelValue ?? false)),
  set: (val: boolean) => {
    emit("update:visible", val);
    emit("update:modelValue", val);
  },
});

const isFullWindow = ref(props.fullWindow ?? false);

watch(
  () => props.fullWindow,
  (val) => {
    if (val !== undefined && val !== isFullWindow.value) {
      isFullWindow.value = val;
    }
  },
);

const setFullWindow = (val: boolean) => {
  if (isFullWindow.value === val) return;
  isFullWindow.value = val;
  emit("fullWindow", val);
  emit("update:fullWindow", val);
  if (val) {
    emit("maximize");
  } else {
    emit("unmaximize");
  }
  nextTick(() => {
    window.dispatchEvent(new Event("resize"));
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 250);
  });
};

const toggleFullWindow = (targetVal?: boolean | Event) => {
  if (typeof targetVal === "boolean") {
    setFullWindow(targetVal);
  } else {
    setFullWindow(!isFullWindow.value);
  }
};

const toggleMaximize = toggleFullWindow;

const isMaximized = computed({
  get: () => isFullWindow.value,
  set: (val: boolean) => {
    setFullWindow(val);
  },
});

const isSidebarCollapsed = ref(typeof window !== "undefined" ? window.innerWidth < 1024 : false);

const { t } = useLocalI18n(callPaintBoard, chat);
const { dir } = useDirection();

const callStore = useCallStore();
const session = computed(() => callStore.session);
const callMedia = computed(() => session.value?.media);

const displayParticipants = computed<Participant[]>(() => {
  if (props.participants && props.participants.length > 0) {
    return props.participants;
  }
  return session.value?.participants.value ?? [];
});

const selfTile = computed(() => displayParticipants.value.find((tile) => tile.isSelf));

const nameOf = (tile?: Participant) =>
  tile?.name || (tile?.isSelf ? t("chat.call.you") : t("chat.call.stage.participant"));

const initialsOf = (tile?: Participant) => nameInitials(tile?.name ?? "");

const streamOf = (tile?: Participant) => {
  if (tile?.isSelf) {
    return callMedia.value?.localStream.value ?? tile.camera;
  }
  return tile?.camera;
};

const cameraOn = (tile?: Participant) => {
  if (tile?.isSelf) {
    return callMedia.value?.isVideoOn.value ?? (tile.media?.video !== false && !!tile?.camera?.getVideoTracks().length);
  }
  return tile?.media?.video !== false && !!tile?.camera?.getVideoTracks().length;
};

const micOn = (tile?: Participant) => {
  if (tile?.isSelf) {
    return callMedia.value?.isAudioOn.value ?? (tile.media?.audio !== false);
  }
  return tile?.media?.audio !== false;
};

const isMirrored = (tile?: Participant) =>
  !!tile?.isSelf && callMedia.value?.facingMode.value !== "environment";

const isUnreachable = (tile?: Participant) =>
  !!tile && !tile.isSelf && tile.status === "unreachable";

const isDisconnected = (tile?: Participant) =>
  !!tile && !tile.isSelf && tile.status !== "connected" && !isUnreachable(tile);

const selectedMemberStream = reactive<Record<string, "camera" | "screen" | "whiteboard">>({});

const hasTileScreen = (tile: Participant) =>
  tile.isSelf ? !!callMedia.value?.isScreenSharing.value : !!tile.screen?.getVideoTracks().length;

const hasTileWhiteboard = (tile: Participant) =>
  tile.isSelf ? !!callMedia.value?.isWhiteboardSharing.value : !!tile.whiteboard?.getVideoTracks().length;

const getMemberStream = (tile: Participant) => {
  const mode = selectedMemberStream[tile.id] ?? "camera";
  if (mode === "screen") {
    return tile.isSelf ? callMedia.value?.screenStream.value : tile.screen;
  }
  if (mode === "whiteboard") {
    return tile.isSelf ? callMedia.value?.whiteboardStream.value : tile.whiteboard;
  }
  return streamOf(tile);
};

const otherWhiteboards = computed(() =>
  displayParticipants.value.filter((p) => !p.isSelf && !!p.whiteboard?.getVideoTracks().length),
);

const whiteboardRef = ref<WhiteboardExposed | null>(null);

const isDesktop = useMediaQuery("(min-width: 768px)");

const dialogRef = ref<HTMLDivElement | null>(null);
const dialogWidth = ref<number | null>(null);
const dialogHeight = ref<number | null>(null);
const dialogX = ref<number | null>(null);
const dialogY = ref<number | null>(null);

const isDragging = ref(false);
const isResizing = ref(false);
type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const resizeDirection = ref<ResizeDirection | null>(null);

const { width: windowWidth, height: windowHeight } = useWindowSize();

const initDialogBounds = () => {
  if (typeof window === "undefined") return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const targetW = Math.min(1440, Math.max(680, Math.round(vw * 0.92)));
  const targetH = Math.min(920, Math.max(480, Math.round(vh * 0.88)));

  dialogWidth.value = targetW;
  dialogHeight.value = targetH;
  dialogX.value = Math.max(0, Math.round((vw - targetW) / 2));
  dialogY.value = Math.max(0, Math.round((vh - targetH) / 2));
};

const clampBounds = () => {
  if (typeof window === "undefined" || !isDesktop.value) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const minW = Math.min(540, vw);
  const minH = Math.min(400, vh);

  if (dialogWidth.value === null || dialogHeight.value === null) {
    initDialogBounds();
    return;
  }

  dialogWidth.value = Math.min(vw, Math.max(minW, dialogWidth.value));
  dialogHeight.value = Math.min(vh, Math.max(minH, dialogHeight.value));

  if (dialogX.value === null || dialogY.value === null) {
    dialogX.value = Math.max(0, Math.round((vw - dialogWidth.value) / 2));
    dialogY.value = Math.max(0, Math.round((vh - dialogHeight.value) / 2));
  } else {
    dialogX.value = Math.max(0, Math.min(dialogX.value, Math.max(0, vw - 120)));
    dialogY.value = Math.max(0, Math.min(dialogY.value, Math.max(0, vh - 60)));
  }
};

watch([windowWidth, windowHeight], () => {
  if (isDesktop.value && !isFullWindow.value && isVisible.value) {
    clampBounds();
  }
});

onMounted(() => {
  if (isDesktop.value) {
    initDialogBounds();
  }
});

const dialogStyle = computed(() => {
  if (!isDesktop.value || isFullWindow.value) {
    return undefined;
  }
  return {
    left: `${dialogX.value ?? 0}px`,
    top: `${dialogY.value ?? 0}px`,
    width: `${dialogWidth.value ?? 800}px`,
    height: `${dialogHeight.value ?? 600}px`,
  };
});

const startDrag = (e: PointerEvent) => {
  isDragging.value = true;
  const startMouseX = e.clientX;
  const startMouseY = e.clientY;
  const initDialogX = dialogX.value ?? 0;
  const initDialogY = dialogY.value ?? 0;

  const onPointerMove = (ev: PointerEvent) => {
    if (!isDragging.value) return;
    const dx = ev.clientX - startMouseX;
    const dy = ev.clientY - startMouseY;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const currentW = dialogWidth.value ?? 800;
    const currentH = dialogHeight.value ?? 600;

    const minX = -(currentW - 120);
    const maxX = vw - 120;
    const minY = 0;
    const maxY = vh - 60;

    dialogX.value = Math.round(Math.max(minX, Math.min(maxX, initDialogX + dx)));
    dialogY.value = Math.round(Math.max(minY, Math.min(maxY, initDialogY + dy)));
  };

  const onPointerUp = () => {
    isDragging.value = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
};

const onDialogPointerDown = (e: PointerEvent) => {
  if (!isDesktop.value || isFullWindow.value || !props.draggable) return;
  if (e.button !== 0) return;

  const target = e.target as HTMLElement | null;
  if (!target) return;

  const dragHandle = target.closest(".whiteboard-header-drag, [data-drag-handle]");
  if (!dragHandle) return;

  if (target.closest("button, a, input, select, textarea, [role='button'], .p-button, .no-drag")) {
    return;
  }

  startDrag(e);
};

const startResize = (direction: ResizeDirection, e: PointerEvent) => {
  if (!isDesktop.value || isFullWindow.value || !props.resizable) return;
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();

  isResizing.value = true;
  resizeDirection.value = direction;

  const startMouseX = e.clientX;
  const startMouseY = e.clientY;
  const initX = dialogX.value ?? 0;
  const initY = dialogY.value ?? 0;
  const initW = dialogWidth.value ?? 800;
  const initH = dialogHeight.value ?? 600;

  const minW = 540;
  const minH = 400;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const onPointerMove = (ev: PointerEvent) => {
    if (!isResizing.value) return;
    const dx = ev.clientX - startMouseX;
    const dy = ev.clientY - startMouseY;

    let newX = initX;
    let newY = initY;
    let newW = initW;
    let newH = initH;

    if (direction.includes("e")) {
      newW = Math.max(minW, Math.min(vw - initX, initW + dx));
    } else if (direction.includes("w")) {
      const targetW = initW - dx;
      if (targetW < minW) {
        newW = minW;
        newX = initX + (initW - minW);
      } else if (initX + dx < 0) {
        newW = initX + initW;
        newX = 0;
      } else {
        newW = targetW;
        newX = initX + dx;
      }
    }

    if (direction.includes("s")) {
      newH = Math.max(minH, Math.min(vh - initY, initH + dy));
    } else if (direction.includes("n")) {
      const targetH = initH - dy;
      if (targetH < minH) {
        newH = minH;
        newY = initY + (initH - minH);
      } else if (initY + dy < 0) {
        newH = initY + initH;
        newY = 0;
      } else {
        newH = targetH;
        newY = initY + dy;
      }
    }

    dialogX.value = Math.round(newX);
    dialogY.value = Math.round(newY);
    dialogWidth.value = Math.round(newW);
    dialogHeight.value = Math.round(newH);
  };

  const onPointerUp = () => {
    isResizing.value = false;
    resizeDirection.value = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    window.dispatchEvent(new Event("resize"));
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
};

const activeOverlayCursorClass = computed(() => {
  if (isDragging.value) return "cursor-grabbing";
  switch (resizeDirection.value) {
    case "n":
    case "s":
      return "cursor-ns-resize";
    case "e":
    case "w":
      return "cursor-ew-resize";
    case "nw":
    case "se":
      return "cursor-nwse-resize";
    case "ne":
    case "sw":
      return "cursor-nesw-resize";
    default:
      return "cursor-default";
  }
});

watch(isVisible, async (open) => {
  if (open) {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      isSidebarCollapsed.value = true;
    }
    if (isDesktop.value) {
      clampBounds();
    }
    await nextTick();
    window.dispatchEvent(new Event("resize"));
    if (props.allowStream) {
      whiteboardRef.value?.startStream();
    }
  } else {
    whiteboardRef.value?.stopStream();
    session.value?.stopWhiteboardShare();
    emit("streamStop");
    emit("update:streamActive", false);
  }
});

const toggleSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;
  nextTick(() => {
    window.dispatchEvent(new Event("resize"));
  });
};

const close = () => {
  whiteboardRef.value?.stopStream();
  session.value?.stopWhiteboardShare();
  emit("streamStop");
  emit("update:streamActive", false);
  isVisible.value = false;
  emit("close");
};

onBeforeUnmount(() => {
  whiteboardRef.value?.stopStream();
  session.value?.stopWhiteboardShare();
  emit("streamStop");
  emit("update:streamActive", false);
});

const onMaskClick = (e: MouseEvent) => {
  if (props.dismissableMask && e.target === e.currentTarget) {
    close();
  }
};

useEventListener(window, "keydown", (e: KeyboardEvent) => {
  if (!isVisible.value) return;
  if (e.key === "Escape") {
    e.stopPropagation();
    if (isFullWindow.value) {
      setFullWindow(false);
    } else {
      close();
    }
  }
});

defineExpose({
  getStream: (fps = 10) => whiteboardRef.value?.getStream(fps) ?? null,
  startStream: () => whiteboardRef.value?.startStream() ?? false,
  stopStream: () => whiteboardRef.value?.stopStream(),
  downloadImage: (format?: "png" | "jpeg") => whiteboardRef.value?.downloadImage(format),
  copyImageToClipboard: () => whiteboardRef.value?.copyImageToClipboard(),
  clear: () => whiteboardRef.value?.clear(),
  undo: () => whiteboardRef.value?.undo(),
  redo: () => whiteboardRef.value?.redo(),
  zoomIn: () => whiteboardRef.value?.zoomIn(),
  zoomOut: () => whiteboardRef.value?.zoomOut(),
  resetZoom: () => whiteboardRef.value?.resetZoom(),
  fitToContent: () => whiteboardRef.value?.fitToContent(),
  visible: isVisible,
  isFullWindow,
  isMaximized,
  toggleFullWindow,
  toggleMaximize,
  whiteboard: whiteboardRef,
  resetPosition: initDialogBounds,
  isDragging,
  isResizing,
});
</script>

<template>
  <Teleport to="body">
    <div
      class="vue-chat font-chat-family whiteboard-dialog-mask fixed inset-0 transition-opacity duration-200"
      :class="[
        isVisible
          ? 'z-[100] opacity-100 pointer-events-auto backdrop-blur-xs'
          : '-z-10 opacity-0 pointer-events-none invisible',
      ]"
      :style="{ zIndex: isVisible ? 100 : -1 }"
      :dir="dir"
      :aria-hidden="!isVisible"
      @click="onMaskClick"
    >
      <!-- Full-screen transparent overlay while dragging/resizing to retain cursor & catch all pointer events -->
      <div
        v-if="isDragging || isResizing"
        class="fixed inset-0 z-[110] select-none touch-none"
        :class="activeOverlayCursorClass"
      />

      <div
        ref="dialogRef"
        class="whiteboard-dialog-root overflow-hidden bg-white dark:bg-gray-900 flex flex-col group"
        :class="[
          isFullWindow
            ? 'fixed inset-0 w-full h-full max-w-none rounded-none border-none shadow-none z-10'
            : isDesktop
              ? 'fixed rounded-2xl md:rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-800 z-10'
              : 'fixed inset-0 w-full h-[100dvh] rounded-none border-none shadow-none z-10',
          (isDragging || isResizing)
            ? 'select-none pointer-events-auto transition-none'
            : 'transition-[opacity,transform] duration-150',
        ]"
        :style="dialogStyle"
        @click.stop
        @pointerdown="onDialogPointerDown"
      >
        <!-- Resize Handles: Active on desktop when not in full window -->
        <template v-if="isDesktop && !isFullWindow && resizable">
          <!-- Edge handles -->
          <div
            class="absolute top-0 inset-x-3 h-2 cursor-ns-resize z-30 select-none touch-none hover:bg-chat-primary/20 transition-colors"
            :title="t('board.resize')"
            @pointerdown="startResize('n', $event)"
          />
          <div
            class="absolute bottom-0 inset-x-3 h-2 cursor-ns-resize z-30 select-none touch-none hover:bg-chat-primary/20 transition-colors"
            :title="t('board.resize')"
            @pointerdown="startResize('s', $event)"
          />
          <div
            class="absolute left-0 inset-y-3 w-2 cursor-ew-resize z-30 select-none touch-none hover:bg-chat-primary/20 transition-colors"
            :title="t('board.resize')"
            @pointerdown="startResize('w', $event)"
          />
          <div
            class="absolute right-0 inset-y-3 w-2 cursor-ew-resize z-30 select-none touch-none hover:bg-chat-primary/20 transition-colors"
            :title="t('board.resize')"
            @pointerdown="startResize('e', $event)"
          />

          <!-- Corner handles -->
          <div
            class="absolute top-0 left-0 size-4 cursor-nwse-resize z-30 select-none touch-none"
            :title="t('board.resize')"
            @pointerdown="startResize('nw', $event)"
          />
          <div
            class="absolute top-0 right-0 size-4 cursor-nesw-resize z-30 select-none touch-none"
            :title="t('board.resize')"
            @pointerdown="startResize('ne', $event)"
          />
          <div
            class="absolute bottom-0 left-0 size-4 cursor-nesw-resize z-30 select-none touch-none"
            :title="t('board.resize')"
            @pointerdown="startResize('sw', $event)"
          />
          <div
            class="absolute bottom-0 right-0 size-4 cursor-nwse-resize z-30 select-none touch-none"
            :title="t('board.resize')"
            @pointerdown="startResize('se', $event)"
          />

          <!-- Visual Corner Grip Affordance at bottom-end corner -->
          <div
            class="absolute bottom-1 end-1 z-30 p-1 flex items-end justify-end pointer-events-none select-none text-gray-400 dark:text-gray-500 opacity-40 group-hover:opacity-90 transition-opacity"
            aria-hidden="true"
          >
            <svg
              class="size-2.5"
              viewBox="0 0 10 10"
              fill="currentColor"
            >
              <circle cx="8.5" cy="8.5" r="1" />
              <circle cx="5" cy="8.5" r="1" />
              <circle cx="8.5" cy="5" r="1" />
              <circle cx="1.5" cy="8.5" r="1" />
              <circle cx="5" cy="5" r="1" />
              <circle cx="8.5" cy="1.5" r="1" />
            </svg>
          </div>
        </template>

        <!-- Body Area: Unified Whiteboard Toolbar & Canvas, with Dockable Members Sidebar -->
        <div :dir="dir" class="flex-1 w-full h-full min-h-0 relative overflow-hidden flex flex-row">
          <!-- Whiteboard Container with Unified Top Header -->
          <div
            class="flex-1 h-full min-w-0 relative overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-900"
          >
            <Whiteboard
              ref="whiteboardRef"
              :visible="isVisible"
              :initial-tool="initialTool"
              :initial-color="initialColor"
              :title="title"
              :show-close="true"
              :maximizable="maximizable"
              :is-full-window="isFullWindow"
              :stream-active="streamActive"
              :allow-stream="allowStream"
              :has-participants="displayParticipants.length > 0"
              :participants-count="displayParticipants.length"
              :is-sidebar-open="!isSidebarCollapsed && displayParticipants.length > 0"
              :draggable-dialog="isDesktop && !isFullWindow && props.draggable"
              @stream-start="emit('streamStart', $event)"
              @stream-stop="emit('streamStop')"
              @update:stream-active="emit('update:streamActive', $event)"
              @full-window="toggleFullWindow"
              @maximize="toggleFullWindow"
              @toggle-sidebar="toggleSidebar"
              @close="close"
            />
            <!-- Notice when another member shares whiteboard in parallel -->
            <div
              v-if="otherWhiteboards.length > 0"
              class="absolute top-3 start-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-950/80 border border-indigo-500/40 backdrop-blur-md shadow-lg text-indigo-200 text-xs select-none"
            >
              <CallIcon name="whiteboard" class="size-3.5 text-indigo-400" />
              <span>{{ t("chat.call.stage.alsoSharingWhiteboard", { name: nameOf(otherWhiteboards[0]) }) }}</span>
              <button
                type="button"
                class="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[11px] transition-colors cursor-pointer"
                @click="isSidebarCollapsed = false; selectedMemberStream[otherWhiteboards[0].id] = 'whiteboard'"
              >
                {{ t("chat.call.stage.viewWhiteboard") }}
              </button>
            </div>
            <!-- Your own camera, while the members list isn't showing it. -->
            <div
              v-if="selfTile"
              class="absolute top-[calc(3.5rem+env(safe-area-inset-top,0px))] end-3 md:top-auto md:bottom-4 md:end-4 z-20 w-24 sm:w-32 md:w-40 aspect-video rounded-xl overflow-hidden bg-gray-950 border border-gray-700/60 shadow-lg pointer-events-none select-none transition-all"
              :class="!isSidebarCollapsed && 'md:hidden'"
              data-testid="whiteboard-self-view"
            >
              <CallStageVideo v-if="cameraOn(selfTile)" :stream="streamOf(selfTile)" :mirrored="isMirrored(selfTile)" />
              <div v-else class="absolute inset-0 flex items-center justify-center text-gray-400">
                <CallIcon name="videocamOff" class="size-5" />
              </div>
              <span class="absolute bottom-0 inset-x-0 px-2 py-0.5 text-[10px] text-white bg-gradient-to-t from-black/80 to-transparent truncate">
                {{ t("chat.call.you") }}
              </span>
            </div>
          </div>

          <!-- Mobile Backdrop Overlay for Members Drawer -->
          <div
            v-if="displayParticipants.length > 0 && !isSidebarCollapsed"
            class="fixed inset-0 bg-black/45 backdrop-blur-xs z-30 md:hidden transition-opacity"
            aria-hidden="true"
            @click="toggleSidebar"
          />

          <!-- Members Media Cards: Docked on desktop (md+), Overlay Drawer on mobile (< md) -->
          <aside
            v-if="displayParticipants.length > 0 && !isSidebarCollapsed"
            :dir="dir"
            class="fixed md:static inset-y-0 end-0 z-40 md:z-10 w-72 sm:w-80 max-w-[85vw] h-full shrink-0 flex flex-col border-inline-start border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-2xl md:shadow-none transition-all duration-200"
            data-testid="whiteboard-members-sidebar"
          >
            <!-- Sidebar Header -->
            <div class="px-3.5 py-2.5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0 select-none">
              <div class="flex items-center gap-2 min-w-0">
                <CallIcon name="group" class="size-4.5 text-gray-500 dark:text-gray-400 shrink-0" />
                <span class="text-xs font-bold text-gray-800 dark:text-gray-200 truncate uppercase tracking-wider">
                  {{ t("board.members") }}
                </span>
                <span class="px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                  {{ displayParticipants.length }}
                </span>
              </div>
              <button
                v-tooltip.bottom="tt(t('board.collapseMembers'))"
                type="button"
                class="size-7 p-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex items-center justify-center cursor-pointer"
                :aria-label="t('board.collapseMembers')"
                @click="toggleSidebar"
              >
                <BIcon icon="PhSidebarSimple" class="size-4" />
              </button>
            </div>

            <!-- Scrollable Cards List -->
            <div class="flex-1 overflow-y-auto p-3 space-y-3">
              <article
                v-for="tile in displayParticipants"
                :key="tile.id"
                :data-id="tile.id"
                data-testid="whiteboard-member-card"
                class="relative rounded-xl overflow-hidden bg-gray-950 border border-gray-700/60 shadow-md aspect-video flex flex-col justify-end group shrink-0 transition-all duration-200"
                :class="{
                  'ring-2 ring-emerald-500 shadow-emerald-500/20': micOn(tile) && !tile.isSelf,
                }"
              >
                <!-- Video stream when active (camera, screen, or whiteboard) -->
                <CallStageVideo
                  v-if="(selectedMemberStream[tile.id] === 'screen' ? hasTileScreen(tile) : selectedMemberStream[tile.id] === 'whiteboard' ? hasTileWhiteboard(tile) : cameraOn(tile)) && getMemberStream(tile)"
                  :stream="getMemberStream(tile)"
                  :mirrored="(selectedMemberStream[tile.id] ?? 'camera') === 'camera' && isMirrored(tile)"
                />

                <!-- Stream Switcher on card -->
                <div
                  v-if="hasTileScreen(tile) || hasTileWhiteboard(tile)"
                  class="absolute top-1.5 end-1.5 z-20 flex items-center gap-1 bg-black/60 backdrop-blur-xs rounded-lg p-0.5 pointer-events-auto"
                >
                  <button
                    type="button"
                    class="px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-0.5 cursor-pointer"
                    :class="(selectedMemberStream[tile.id] ?? 'camera') === 'camera' ? 'bg-white/25 text-white' : 'text-gray-400 hover:text-white'"
                    :title="t('chat.call.stage.viewCamera')"
                    @click.stop="selectedMemberStream[tile.id] = 'camera'"
                  >
                    <CallIcon name="videocam" class="size-3" />
                  </button>
                  <button
                    v-if="hasTileScreen(tile)"
                    type="button"
                    class="px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-0.5 text-emerald-400 cursor-pointer"
                    :class="selectedMemberStream[tile.id] === 'screen' ? 'bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-400' : 'hover:bg-white/10'"
                    :title="t('chat.call.stage.viewScreen')"
                    @click.stop="selectedMemberStream[tile.id] = 'screen'"
                  >
                    <CallIcon name="presentToAll" class="size-3" />
                  </button>
                  <button
                    v-if="hasTileWhiteboard(tile)"
                    type="button"
                    class="px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-0.5 text-indigo-400 cursor-pointer"
                    :class="selectedMemberStream[tile.id] === 'whiteboard' ? 'bg-indigo-500/30 text-indigo-300 ring-1 ring-indigo-400' : 'hover:bg-white/10'"
                    :title="t('chat.call.stage.viewWhiteboard')"
                    @click.stop="selectedMemberStream[tile.id] = 'whiteboard'"
                  >
                    <CallIcon name="whiteboard" class="size-3" />
                  </button>
                </div>

                <!-- Camera Off fallback with avatar -->
                <div
                  v-else
                  class="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-gray-300 select-none"
                >
                  <div
                    class="size-11 rounded-full flex items-center justify-center font-bold text-base text-white shadow-inner bg-gray-800 border border-gray-700"
                  >
                    {{ initialsOf(tile) || nameOf(tile).charAt(0) }}
                  </div>
                  <span class="mt-1.5 text-[11px] text-gray-400 flex items-center gap-1 font-medium">
                    <CallIcon name="videocamOff" class="size-3.5 text-gray-500" />
                    {{ t("chat.call.cameraOff") }}
                  </span>
                </div>

                <!-- Reconnecting indicator -->
                <div
                  v-if="isDisconnected(tile)"
                  class="absolute inset-0 z-20 bg-black/70 flex items-center justify-center gap-1.5 text-xs text-white"
                >
                  <CallIcon name="refresh" class="size-4 animate-spin motion-reduce:animate-none" />
                  <span>{{ t("chat.call.reconnecting") }}</span>
                </div>

                <!-- Unreachable error with retry button -->
                <div
                  v-else-if="isUnreachable(tile)"
                  class="absolute inset-0 z-20 bg-black/80 flex flex-col items-center justify-center p-2 text-center text-xs text-red-300 gap-1.5"
                >
                  <span>{{ t("chat.call.cantConnect", { name: nameOf(tile) }) }}</span>
                  <button
                    v-if="session"
                    type="button"
                    class="px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                    @click="session.retryPeer(tile.id)"
                  >
                    <CallIcon name="refresh" class="size-3.5" />
                    {{ t("chat.call.controls.retry") }}
                  </button>
                </div>

                <!-- Card Footer: Participant Name & Mic Status -->
                <div
                  class="relative z-10 w-full px-2.5 py-1.5 bg-gradient-to-t from-black/90 via-black/55 to-transparent flex items-center justify-between gap-1 select-none pointer-events-none"
                >
                  <div class="min-w-0 flex items-center gap-1">
                    <span class="truncate text-xs font-semibold text-white drop-shadow-sm">
                      <bdi>{{ nameOf(tile) }}</bdi>
                    </span>
                    <span v-if="tile.isSelf" class="text-[10px] text-gray-300 shrink-0 font-normal">
                      ({{ t("chat.call.you") }})
                    </span>
                    <span
                      v-if="tile.screen?.getVideoTracks().length || (tile.isSelf && session?.media.isScreenSharing.value)"
                      class="text-emerald-400 shrink-0"
                      :title="t('chat.call.stage.screenTile', { name: nameOf(tile) })"
                    >
                      <CallIcon name="presentToAll" class="size-3.5" />
                    </span>
                    <span
                      v-if="tile.whiteboard?.getVideoTracks().length || (tile.isSelf && session?.media.isWhiteboardSharing.value)"
                      class="text-indigo-400 shrink-0"
                      :title="t('chat.call.stage.whiteboardTile', { name: nameOf(tile) })"
                    >
                      <CallIcon name="whiteboard" class="size-3.5" />
                    </span>
                  </div>

                  <div
                    class="size-5 rounded-full flex items-center justify-center shrink-0 shadow-sm"
                    :class="micOn(tile) ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'"
                    :title="micOn(tile) ? t('chat.call.microphoneOn') : t('chat.call.microphoneOff')"
                  >
                    <CallIcon :name="micOn(tile) ? 'mic' : 'micOff'" class="size-3" />
                  </div>
                </div>
              </article>
            </div>
          </aside>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.whiteboard-dialog-mask {
  background-color: rgba(0, 0, 0, 0.65);
}
</style>
