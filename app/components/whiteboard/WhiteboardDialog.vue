<script setup lang="ts">
import { ref } from "vue";
import Dialog from "primevue/dialog";
import Whiteboard, { type WhiteboardExposed } from "./Whiteboard.vue";
import type { WhiteboardTool } from "./types";
import BIcon from "~/components/global/BIcon.vue";
import useLocalI18n, { useDirection } from "~/composables/useLocalI18n";
import { callPaintBoard } from "@i18n/locales";

const props = withDefaults(
  defineProps<{
    initialTool?: WhiteboardTool;
    initialColor?: string;
    maximizable?: boolean;
    dismissableMask?: boolean;
    modal?: boolean;
    title?: string;
  }>(),
  {
    initialTool: "pen",
    initialColor: "#2563eb",
    maximizable: true,
    dismissableMask: true,
    modal: true,
    title: "",
  },
);

const visible = defineModel<boolean>("visible", { default: false });

const emit = defineEmits<{
  (e: "close"): void;
  (e: "maximize"): void;
  (e: "unmaximize"): void;
}>();

const { t } = useLocalI18n(callPaintBoard);
const { dir } = useDirection();

const whiteboardRef = ref<WhiteboardExposed | null>(null);

const onHide = () => {
  emit("close");
};

defineExpose({
  getStream: (fps = 30) => whiteboardRef.value?.getStream(fps) ?? null,
  downloadImage: (format?: "png" | "jpeg") => whiteboardRef.value?.downloadImage(format),
  clear: () => whiteboardRef.value?.clear(),
  undo: () => whiteboardRef.value?.undo(),
  redo: () => whiteboardRef.value?.redo(),
  whiteboard: whiteboardRef,
});
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :modal="modal"
    :maximizable="maximizable"
    :dismissable-mask="dismissableMask"
    :draggable="false"
    :dir="dir"
    class="vue-chat whiteboard-dialog"
    :pt="{
      root: {
        class:
          'vue-chat whiteboard-dialog-root rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col',
      },
      header: {
        class:
          '!px-4 !py-3 border-b border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xs flex items-center justify-between',
      },
      content: {
        class:
          '!p-0 !m-0 flex-1 flex flex-col overflow-hidden relative h-full w-full bg-slate-50 dark:bg-slate-900',
      },
      headerActions: {
        class: 'flex items-center gap-1',
      },
      pcMaximizeButton: {
        root: {
          class:
            'size-8 !p-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors flex items-center justify-center',
        },
      },
      pcCloseButton: {
        root: {
          class:
            'size-8 !p-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors flex items-center justify-center',
        },
      },
    }"
    :style="{ width: '92vw', maxWidth: '1360px', height: '88vh' }"
    :breakpoints="{ '960px': '96vw', '640px': '100vw' }"
    @hide="onHide"
    @maximize="emit('maximize')"
    @unmaximize="emit('unmaximize')"
  >
    <template #header>
      <div class="flex items-center gap-2 select-none">
        <div class="size-8 rounded-xl bg-chat-primary/10 text-chat-primary flex items-center justify-center">
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
    </template>

    <template #maximizeicon="{ maximized }">
      <BIcon :icon="maximized ? 'PhCornersIn' : 'PhCornersOut'" class="size-4" />
    </template>

    <template #closeicon>
      <BIcon icon="PhX" class="size-4.5" />
    </template>

    <div class="flex-1 w-full h-full relative overflow-hidden flex flex-col">
      <Whiteboard
        ref="whiteboardRef"
        :initial-tool="initialTool"
        :initial-color="initialColor"
        :show-close="false"
      />
    </div>
  </Dialog>
</template>

<style>
/* PrimeVue maximized styling adjustments */
.whiteboard-dialog.p-dialog-maximized {
  width: 100vw !important;
  height: 100vh !important;
  max-height: 100vh !important;
  top: 0 !important;
  left: 0 !important;
  margin: 0 !important;
  border-radius: 0 !important;
}
.whiteboard-dialog.p-dialog-maximized .p-dialog-content {
  height: calc(100vh - 57px) !important;
}
</style>
