<script setup lang="ts">
/** Dims an image that is still uploading and shows how far along it is. */
import LoadingStatus from "~/components/general/LoadingStatus.vue";

const props = withDefaults(
  defineProps<{
    /** 0–100, as UploadProgressEvent reports it. */
    progress: number;
    size?: "sm" | "lg";
  }>(),
  { size: "lg" },
);
</script>

<template>
  <div
    data-testid="upload-progress"
    class="absolute inset-0 flex items-center justify-center bg-black/40"
  >
    <div class="rounded-full bg-chat-background/85 p-0.5">
      <LoadingStatus
        :progress="props.progress / 100"
        :size="props.size === 'lg' ? 44 : 28"
        is-uploading
      />
    </div>
  </div>
</template>
