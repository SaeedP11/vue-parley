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
    streamActive?: boolean;
    allowStream?: boolean;
  }>(),
  {
    isOpen: false,
    initialTool: "pen",
    maximizable: true,
    asDialog: false,
    streamActive: false,
    allowStream: true,
  },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "streamStart", stream: MediaStream): void;
  (e: "streamStop"): void;
}>();

const whiteboardRef = ref<WhiteboardExposed | null>(null);

defineExpose({
  getStream: (fps = 10) => whiteboardRef.value?.getStream(fps) ?? null,
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
    :stream-active="streamActive"
    :allow-stream="allowStream"
    @stream-start="emit('streamStart', $event)"
    @stream-stop="emit('streamStop')"
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
      :stream-active="streamActive"
      :allow-stream="allowStream"
      show-close
      @stream-start="emit('streamStart', $event)"
      @stream-stop="emit('streamStop')"
      @close="emit('close')"
    />
  </div>
</template>
