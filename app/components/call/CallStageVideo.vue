<script setup lang="ts">
import { ref, watchEffect } from "vue";
/** A muted view of a stream the call already holds: the call's own elements play the sound. */
const { stream } = defineProps<{ stream?: MediaStream | null; mirrored?: boolean }>();

const video = ref<HTMLVideoElement>();

watchEffect(() => {
  if (!video.value || video.value.srcObject === (stream ?? null)) return;
  video.value.srcObject = stream ?? null;
  video.value.play().catch(() => undefined);
});

// Flipping the camera keeps the stream and swaps its track: Safari only listens when srcObject changes.
defineExpose({
  refresh: () => {
    if (!video.value) return;
    video.value.srcObject = null;
    video.value.srcObject = stream ?? null;
    video.value.play().catch(() => undefined);
  },
});
</script>

<template>
  <video ref="video" muted autoplay playsinline class="size-full bg-black object-contain" :class="mirrored && '-scale-x-100'" />
</template>
