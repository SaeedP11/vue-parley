<template>
  <div class="flex w-full select-none items-center gap-x-2">
    <div class="flex min-w-0 flex-1 flex-col gap-y-0.5 text-left">
      <div class="truncate text-label-md text-chat-on-background">{{ fileName }}</div>
      <div dir="ltr" class="text-body-sm text-chat-on-background/70">
        {{ formattedSize }}
      </div>
    </div>

    <div
      class="relative shrink-0 cursor-pointer transition-transform active:scale-95"
    >
      <BIcon icon="PhFile" class="h-10 w-10 fill-white" />
      <div
        class="absolute bottom-2 right-0 flex items-center justify-center rounded-sm bg-chat-error px-1 py-0.5"
      >
        <div
          class="text-center text-[7px] font-bold uppercase leading-none tracking-wide text-white"
        >
          {{ fileExt }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { formatBytes } from "~/utils/format";

interface AttachmentFile {
  name: string;
  size: number;
  format: string;
  path: string;
}

const props = defineProps<{
  file: AttachmentFile;
}>();

const fileExt = computed(() => {
  if (!props.file?.name) return "FILE";
  const parts = props.file.name.split(".");
  return parts.length > 1 ? parts.pop()?.substring(0, 4) || "FILE" : "FILE";
});

const fileName = computed(() => props.file?.name || "Unknown File");

const formattedSize = computed(() => formatBytes(props.file?.size || 0));
</script>
