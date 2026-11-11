<script lang="ts">
// One <video> per stream, moved between the views that show it instead of rebuilt. A new element
// stays black until the stream's next frame, and an idle shared screen can send none for minutes.
const players = new WeakMap<MediaStream, HTMLVideoElement>();
const inUse = new WeakSet<HTMLVideoElement>();

function take(stream: MediaStream) {
  const cached = players.get(stream);
  if (cached && !inUse.has(cached)) return cached;
  // Already on screen elsewhere: this view gets an element of its own.
  const video = document.createElement("video");
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;
  if (!cached) players.set(stream, video);
  return video;
}
</script>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
/** A muted view of a stream the call already holds: the call's own elements play the sound. */
const props = defineProps<{ stream?: MediaStream | null; mirrored?: boolean }>();

const host = ref<HTMLElement>();
let video: HTMLVideoElement | null = null;

const classes = () => `size-full bg-black object-contain${props.mirrored ? " -scale-x-100" : ""}`;

function release() {
  if (video) inUse.delete(video);
  video = null;
}

function show() {
  if (!host.value || !props.stream) return;
  video = take(props.stream);
  inUse.add(video);
  video.className = classes();
  host.value.append(video);
  if (video.paused) video.play().catch(() => undefined);
}

onMounted(show);
// Before the next view mounts, so it can take this element over.
onBeforeUnmount(release);

watch(
  () => props.stream,
  () => {
    video?.remove();
    release();
    show();
  },
);
watch(
  () => props.mirrored,
  () => video && (video.className = classes()),
);

// Flipping the camera keeps the stream and swaps its track: Safari only listens when srcObject changes.
defineExpose({
  refresh: () => {
    if (!video) return;
    video.srcObject = null;
    video.srcObject = props.stream ?? null;
    video.play().catch(() => undefined);
  },
});
</script>

<template>
  <div ref="host" class="size-full" />
</template>
