<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useEventListener } from "@vueuse/core";
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
  }>(),
  {
    visible: undefined,
    modelValue: undefined,
    initialTool: "pen",
    initialColor: "#2563eb",
    maximizable: true,
    fullWindow: false,
    dismissableMask: true,
    modal: true,
    title: "",
    streamActive: false,
    allowStream: true,
    participants: undefined,
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
}>();

const isVisible = computed({
  get: () => (props.visible !== undefined ? props.visible : (props.modelValue ?? false)),
  set: (val: boolean) => {
    emit("update:visible", val);
    emit("update:modelValue", val);
  },
});

const isFullWindow = ref(props.fullWindow ?? false);
const isMaximized = computed({
  get: () => isFullWindow.value,
  set: (val: boolean) => {
    isFullWindow.value = val;
  },
});

const isSidebarCollapsed = ref(false);

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

const whiteboardRef = ref<WhiteboardExposed | null>(null);

watch(isVisible, async (open) => {
  if (open) {
    await nextTick();
    window.dispatchEvent(new Event("resize"));
  }
});

const toggleFullWindow = () => {
  isFullWindow.value = !isFullWindow.value;
  emit("fullWindow", isFullWindow.value);
  emit("update:fullWindow", isFullWindow.value);
  if (isFullWindow.value) {
    emit("maximize");
  } else {
    emit("unmaximize");
  }
  nextTick(() => {
    window.dispatchEvent(new Event("resize"));
  });
};

const toggleMaximize = toggleFullWindow;

const toggleSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;
  nextTick(() => {
    window.dispatchEvent(new Event("resize"));
  });
};

const close = () => {
  isVisible.value = false;
  emit("close");
};

const onMaskClick = (e: MouseEvent) => {
  if (props.dismissableMask && e.target === e.currentTarget) {
    close();
  }
};

useEventListener(window, "keydown", (e: KeyboardEvent) => {
  if (isVisible.value && e.key === "Escape") {
    e.stopPropagation();
    close();
  }
});

defineExpose({
  getStream: (fps = 30) => whiteboardRef.value?.getStream(fps) ?? null,
  downloadImage: (format?: "png" | "jpeg") => whiteboardRef.value?.downloadImage(format),
  clear: () => whiteboardRef.value?.clear(),
  undo: () => whiteboardRef.value?.undo(),
  redo: () => whiteboardRef.value?.redo(),
  visible: isVisible,
  isFullWindow,
  isMaximized,
  toggleFullWindow,
  toggleMaximize,
  whiteboard: whiteboardRef,
});
</script>

<template>
  <Teleport to="body">
    <div
      class="vue-chat font-chat-family whiteboard-dialog-mask fixed inset-0 flex items-center justify-center transition-all duration-200"
      :class="[
        isVisible
          ? 'z-[100] opacity-100 pointer-events-auto backdrop-blur-xs'
          : '-z-10 opacity-0 pointer-events-none invisible',
        isFullWindow ? 'p-0' : 'p-2 sm:p-4 md:p-6',
      ]"
      :style="{ zIndex: isVisible ? 100 : -1 }"
      :dir="dir"
      :aria-hidden="!isVisible"
      @click="onMaskClick"
    >
      <div
        class="whiteboard-dialog-root rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col transition-all duration-200"
        :class="[
          isFullWindow
            ? '!w-screen !h-screen !max-w-none !rounded-none border-none'
            : 'w-[94vw] max-w-[1360px] h-[88vh]',
        ]"
      >
        <!-- Header -->
        <div
          class="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xs flex items-center justify-between shrink-0 select-none"
        >
          <div class="flex items-center gap-2">
            <div
              class="size-8 rounded-xl bg-chat-primary/10 text-chat-primary flex items-center justify-center"
            >
              <BIcon icon="PhPaintBrush" class="size-4.5" />
            </div>
            <div class="flex flex-col">
              <span class="text-sm font-bold text-gray-800 dark:text-gray-100 leading-tight">
                {{ title || t("board.title") }}
              </span>
              <span class="text-[11px] text-gray-400 dark:text-gray-500 leading-tight">
                {{ t("board.shapes") }} &middot; {{ t("board.customRgb") }}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-1">
            <button
              v-if="maximizable"
              type="button"
              class="size-8 p-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors flex items-center justify-center cursor-pointer"
              :aria-label="isFullWindow ? t('board.exitFullWindow') : t('board.fullWindow')"
              :title="isFullWindow ? t('board.exitFullWindow') : t('board.fullWindow')"
              data-testid="whiteboard-full-window-button"
              @click="toggleFullWindow"
            >
              <BIcon :icon="isFullWindow ? 'PhCornersIn' : 'PhCornersOut'" class="size-4" />
            </button>
            <button
              type="button"
              class="size-8 p-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors flex items-center justify-center cursor-pointer"
              :aria-label="t('board.close')"
              :title="t('board.close')"
              @click="close"
            >
              <BIcon icon="PhX" class="size-4.5" />
            </button>
          </div>
        </div>

        <!-- Body Area: Whiteboard on Left, Members Cards on Right in Full Window Mode -->
        <div dir="ltr" class="flex-1 w-full h-full min-h-0 relative overflow-hidden flex flex-row">
          <!-- Whiteboard Container (Kept alive at all times to preserve canvas & WebRTC stream) -->
          <div
            :dir="dir"
            class="flex-1 h-full min-w-0 relative overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-900"
          >
            <Whiteboard
              ref="whiteboardRef"
              :initial-tool="initialTool"
              :initial-color="initialColor"
              :show-close="false"
              :stream-active="streamActive"
              :allow-stream="allowStream"
              @stream-start="emit('streamStart', $event)"
              @stream-stop="emit('streamStop')"
            />
          </div>

          <!-- Members Media Cards: Displayed in full window mode on the right of the whiteboard -->
          <aside
            v-if="isFullWindow && displayParticipants.length > 0 && !isSidebarCollapsed"
            :dir="dir"
            class="w-64 sm:w-72 md:w-80 h-full shrink-0 flex flex-col border-l border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md z-10 transition-all duration-200"
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
                type="button"
                class="size-7 p-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex items-center justify-center cursor-pointer"
                :title="t('board.collapseMembers')"
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
                class="relative rounded-xl overflow-hidden bg-gray-950 border border-gray-700/60 shadow-md aspect-video flex flex-col justify-end group shrink-0"
              >
                <!-- Video stream when camera is active -->
                <CallStageVideo
                  v-if="cameraOn(tile)"
                  :stream="streamOf(tile)"
                  :mirrored="isMirrored(tile)"
                />

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

          <!-- Floating expand button when sidebar is collapsed in full window mode -->
          <button
            v-else-if="isFullWindow && displayParticipants.length > 0 && isSidebarCollapsed"
            type="button"
            class="absolute top-3 right-3 z-20 p-2 rounded-xl bg-white/90 dark:bg-gray-800/90 shadow-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:text-chat-primary transition-all flex items-center gap-1.5 cursor-pointer backdrop-blur-xs"
            :title="t('board.expandMembers')"
            @click="toggleSidebar"
          >
            <CallIcon name="group" class="size-4 text-gray-500" />
            <span class="text-xs font-medium">{{ displayParticipants.length }}</span>
            <BIcon icon="PhSidebarSimple" class="size-4" />
          </button>
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
