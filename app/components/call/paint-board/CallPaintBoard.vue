<script setup lang="ts">
import { ref } from "vue";
import Whiteboard, { type WhiteboardExposed } from "~/components/whiteboard/Whiteboard.vue";
import WhiteboardDialog from "~/components/whiteboard/WhiteboardDialog.vue";
import type { WhiteboardTool } from "~/components/whiteboard/types";

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    initialTool?: WhiteboardTool;
    maximizable?: boolean;
    asDialog?: boolean;
  }>(),
  {
    isOpen: false,
    initialTool: "pen",
    maximizable: true,
    asDialog: false,
  },
);

const emit = defineEmits<{
  (e: "close"): void;
}>();

const whiteboardRef = ref<WhiteboardExposed | null>(null);

defineExpose({
  getStream: (fps = 30) => whiteboardRef.value?.getStream(fps) ?? null,
  downloadImage: (format?: "png" | "jpeg") => whiteboardRef.value?.downloadImage(format),
  clear: () => whiteboardRef.value?.clear(),
  undo: () => whiteboardRef.value?.undo(),
  redo: () => whiteboardRef.value?.redo(),
});
</script>

<template>
  <WhiteboardDialog
    v-if="asDialog"
    :visible="isOpen"
    :initial-tool="initialTool"
    :maximizable="maximizable"
    @close="emit('close')"
  />
  <div
    v-else
    class="relative w-full h-full min-h-[400px] flex flex-col overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl bg-white dark:bg-gray-900"
  >
    <Whiteboard
      ref="whiteboardRef"
      :initial-tool="initialTool"
      :maximizable="maximizable"
      show-close
      @close="emit('close')"
    />
  </div>
</template>
