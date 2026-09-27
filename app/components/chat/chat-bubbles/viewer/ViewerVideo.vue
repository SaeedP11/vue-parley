<script setup lang="ts">
/**
 * A video in the media viewer, with PrimeVue controls: play/pause, a seek slider with the elapsed
 * and total time, mute and full screen. It starts playing when shown; a click on the picture
 * toggles playback and a horizontal swipe asks for the neighbouring item.
 */
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import Slider from "primevue/slider";
import ProgressSpinner from "primevue/progressspinner";
import { useEventListener, useSwipe } from "@vueuse/core";
import IconButton from "~/components/general/IconButton.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { formatDuration } from "~/utils/media";
import { mediaViewer } from "@i18n/locales";

defineProps<{ src: string }>();

const emit = defineEmits<{ swipe: [direction: "left" | "right"] }>();

const { t } = useLocalI18n(mediaViewer);

const frame = useTemplateRef<HTMLElement>("frame");
const video = useTemplateRef<HTMLVideoElement>("video");

const isPlaying = ref(false);
const isMuted = ref(false);
const isFullscreen = ref(false);
const isWaiting = ref(true);
const failed = ref(false);
const current = ref(0);
const duration = ref(0);
// While the slider is dragged, it drives the time rather than following playback.
const scrubbing = ref(false);

const togglePlay = () => {
  const el = video.value;
  if (!el) return;
  if (el.paused || el.ended) el.play().catch(() => {});
  else el.pause();
};

const toggleMute = () => {
  if (video.value) video.value.muted = !video.value.muted;
};

const toggleFullscreen = () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else frame.value?.requestFullscreen?.().catch(() => {});
};

const seek = (value: number | number[]) => {
  const time = Array.isArray(value) ? value[0]! : value;
  current.value = time;
  if (video.value) video.value.currentTime = time;
};

const onTimeUpdate = () => {
  if (!scrubbing.value && video.value) current.value = video.value.currentTime;
};

const onMetadata = () => {
  const d = video.value?.duration ?? 0;
  // Recordings without a duration in their header report Infinity until played through.
  duration.value = Number.isFinite(d) ? d : 0;
};

useEventListener(document, "fullscreenchange", () => {
  isFullscreen.value = !!document.fullscreenElement && document.fullscreenElement === frame.value;
});

// Space plays and pauses, unless a control that uses it has focus.
useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (event.key !== " " || event.defaultPrevented) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, [role='slider'], input, textarea")) return;
  event.preventDefault();
  togglePlay();
});

useSwipe(video, {
  onSwipeEnd: (_, direction) => {
    if (direction === "left" || direction === "right") emit("swipe", direction);
  },
});

onMounted(() => {
  // Opened by a click, so sound is allowed; if the browser still refuses, it waits for play.
  video.value?.play().catch(() => {});
});

onBeforeUnmount(() => {
  if (document.fullscreenElement === frame.value) document.exitFullscreen().catch(() => {});
});
</script>

<template>
  <div
    ref="frame"
    class="relative flex size-full max-h-[calc(100dvh-10rem)] max-w-dvw flex-col items-center justify-center md:max-w-[calc(100dvw-9rem)]"
    :class="isFullscreen && 'max-h-none! max-w-none! bg-black'"
    data-testid="viewer-video"
    :data-playing="String(isPlaying)"
  >
    <div v-if="failed" class="flex max-w-80 flex-col items-center gap-y-3 px-6 text-center text-white/80">
      <BIcon icon="PhWarningCircle" class="size-10" />
      <p class="text-body-md">{{ t("cantPlay") }}</p>
    </div>

    <template v-else>
      <video
        ref="video"
        :src="src"
        playsinline
        preload="auto"
        class="min-h-0 w-full flex-1 touch-pan-y object-contain"
        @click="togglePlay"
        @play="isPlaying = true"
        @pause="isPlaying = false"
        @ended="isPlaying = false"
        @waiting="isWaiting = true"
        @playing="isWaiting = false"
        @canplay="isWaiting = false"
        @loadedmetadata="onMetadata"
        @durationchange="onMetadata"
        @timeupdate="onTimeUpdate"
        @volumechange="isMuted = !!video?.muted"
        @error="failed = true"
      />

      <ProgressSpinner
        v-if="isWaiting && !isPlaying"
        stroke-width="3"
        class="pointer-events-none absolute! top-1/2 left-1/2 size-12! -translate-1/2 [&_circle]:stroke-white!"
      />

      <!-- Controls stay on the picture's reading-direction axis even in RTL, as players do. -->
      <div
        dir="ltr"
        class="flex w-full shrink-0 items-center gap-x-1 px-2 py-2 text-white md:gap-x-2 md:px-3"
      >
        <IconButton
          :icon="isPlaying ? 'PhPause' : 'PhPlay'"
          :label="isPlaying ? t('actions.pause') : t('actions.play')"
          weight="fill"
          class="text-white! hover:bg-white/10!"
          data-testid="viewer-play"
          @click="togglePlay"
        />
        <span class="w-10 shrink-0 text-end text-label-sm tabular-nums">
          {{ formatDuration(current) }}
        </span>
        <Slider
          :model-value="current"
          :min="0"
          :max="duration || 1"
          :step="0.1"
          :disabled="!duration"
          :aria-label="t('actions.seek')"
          class="mx-2 flex-1"
          :pt="{
            range: { class: 'bg-white!' },
            handle: { class: 'bg-white! before:bg-white!' },
          }"
          :dt="{ track: { background: 'rgba(255,255,255,0.25)' } }"
          @update:model-value="seek"
          @slidestart="scrubbing = true"
          @slideend="scrubbing = false"
        />
        <span class="w-10 shrink-0 text-label-sm tabular-nums text-white/70">
          {{ formatDuration(duration) }}
        </span>
        <IconButton
          :icon="isMuted ? 'PhSpeakerSlash' : 'PhSpeakerHigh'"
          :label="isMuted ? t('actions.unmute') : t('actions.mute')"
          class="text-white! hover:bg-white/10!"
          @click="toggleMute"
        />
        <IconButton
          :icon="isFullscreen ? 'PhCornersIn' : 'PhFrameCorners'"
          :label="isFullscreen ? t('actions.exitFullscreen') : t('actions.fullscreen')"
          class="hidden! text-white! hover:bg-white/10! md:inline-flex!"
          @click="toggleFullscreen"
        />
      </div>
    </template>
  </div>
</template>
