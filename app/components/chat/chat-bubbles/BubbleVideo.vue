<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useMessagesStore } from "~/stores/messageStores";

const props = withDefaults(
  defineProps<{
    videoUrl?: string;
    thumbnail?: string;
    mode?: "playback" | "recording";
    stream?: MediaStream | null;
    messageId?: string;
    isSent?: boolean;
    isPaused?: boolean;
    recordingTime?: number;
    maxDuration?: number;
  }>(),
  {
    videoUrl: "",
    thumbnail: "",
    mode: "playback",
    stream: null,
    isSent: true,
    isPaused: false,
    recordingTime: 0,
    maxDuration: 60,
  },
);

const messagesStore = useMessagesStore();
const videoRef = ref<HTMLVideoElement | null>(null);
const isPlaying = ref(false);
const isMuted = ref(false);
const isLoaded = ref(false);
const progress = ref(0);

const uploadData = computed(() =>
  props.messageId ? messagesStore.uploadProgress.get(props.messageId) : null,
);
const isUploading = computed(() => !props.isSent && uploadData.value);

const circumference = 2 * Math.PI * 113;
const dashOffset = computed(() => {
  if (isUploading.value && uploadData.value) {
    return circumference - (uploadData.value.progress / 100) * circumference;
  }

  if (props.mode === "recording") {
    const progressPercent = Math.min(
      (props.recordingTime / props.maxDuration) * 100,
      100,
    );
    return circumference - (progressPercent / 100) * circumference;
  }

  return circumference - (progress.value / 100) * circumference;
});

const togglePlay = () => {
  if (props.mode === "recording" || !videoRef.value || isUploading.value)
    return;

  if (isPlaying.value) {
    videoRef.value.pause();
  } else {
    videoRef.value.play();
  }
};

const knownDuration = ref(0);

const handleMetadata = () => {
  const el = videoRef.value;
  if (!el) return;
  const d = el.duration;
  if (Number.isFinite(d) && d > 0) {
    knownDuration.value = d;
  } else if (d === Infinity) {
    const onTime = () => {
      el.removeEventListener("timeupdate", onTime);
      const resolved =
        Number.isFinite(el.duration) && el.duration > 0
          ? el.duration
          : el.currentTime;
      if (Number.isFinite(resolved) && resolved > 0) {
        knownDuration.value = resolved;
      }
      el.currentTime = 0;
    };
    el.addEventListener("timeupdate", onTime, { once: true });
    el.currentTime = 1e101;
  }
};

const handleTimeUpdate = () => {
  if (!videoRef.value || props.mode === "recording" || isUploading.value)
    return;
  const current = videoRef.value.currentTime;
  let total = videoRef.value.duration;
  if (!Number.isFinite(total) || total <= 0) {
    total = knownDuration.value;
  }
  if (total && Number.isFinite(total) && total > 0) {
    progress.value = Math.min((current / total) * 100, 100);
  }
};

const handleEnded = () => {
  isPlaying.value = false;
  progress.value = 0;
  if (videoRef.value) videoRef.value.currentTime = 0;
};

const handlePlay = () => {
  isPlaying.value = true;
};
const handlePause = () => {
  isPlaying.value = false;
};

watch(
  () => props.stream,
  (newStream) => {
    if (props.mode === "recording" && videoRef.value) {
      if (newStream) {
        videoRef.value.srcObject = newStream;
        videoRef.value.play();
      } else {
        videoRef.value.srcObject = null;
      }
    }
  },
  { immediate: true },
);

watch(
  () => props.isPaused,
  (paused) => {
    if (
      props.mode === "recording" &&
      videoRef.value &&
      videoRef.value.srcObject
    ) {
      if (paused) {
        videoRef.value.pause();
      } else {
        videoRef.value.play();
      }
    }
  },
);

onBeforeUnmount(() => {
  if (videoRef.value) {
    videoRef.value.srcObject = null;
  }
});
</script>

<template>
  <div
    class="relative w-60.5 h-60.5 p-2 shrink-0 group select-none flex items-center justify-center"
  >
    <svg
      class="absolute w-57.5 h-57.5 -rotate-90 pointer-events-none z-20"
      viewBox="0 0 230 230"
    >
      <circle
        cx="115"
        cy="115"
        r="113"
        :class="[
          isUploading ? 'stroke-white/30' : 'stroke-white dark:stroke-chat-background',
        ]"
        stroke-width="4"
        fill="none"
      />

      <circle
        cx="115"
        cy="115"
        r="113"
        class="stroke-chat-primary transition-all ease-linear"
        :class="[isPlaying || isUploading ? 'duration-200' : 'duration-75']"
        stroke-width="4"
        fill="none"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
      />
    </svg>

    <div
      class="relative w-54.5 h-54.5 shrink-0 rounded-full overflow-hidden bg-[#1C1E22] z-10"
      :class="[isUploading ? 'cursor-default' : 'cursor-pointer']"
      @click="togglePlay"
    >
      <video
        ref="videoRef"
        :src="mode === 'playback' ? videoUrl : undefined"
        :poster="thumbnail"
        playsinline
        loop
        :muted="mode === 'recording' || isMuted"
        class="w-full h-full object-cover transition-opacity duration-300"
        :class="[
          isLoaded || mode === 'recording' ? 'opacity-100' : 'opacity-0',
        ]"
        @timeupdate="handleTimeUpdate"
        @ended="handleEnded"
        @play="handlePlay"
        @pause="handlePause"
        @loadeddata="isLoaded = true"
        @loadedmetadata="handleMetadata"
        @durationchange="handleMetadata"
      ></video>

      <div
        v-if="!isLoaded && mode === 'playback'"
        class="absolute inset-0 flex items-center justify-center bg-chat-background"
      ></div>

      <div
        v-if="mode === 'playback' && !isUploading"
        class="absolute inset-0 flex items-center justify-center transition-all duration-300"
        :class="[
          isPlaying ? 'bg-transparent opacity-0' : '  bg-black/30 opacity-100',
        ]"
      >
        <BIcon
          :icon="isPlaying ? 'PhPause' : 'PhPlay'"
          weight="light"
          class="w-5 h-5 text-white transition-transform duration-300"
          :class="[isPlaying ? 'scale-75' : 'scale-100 ml-1']"
        />
      </div>

      <div
        v-if="isUploading"
        class="absolute inset-0 flex items-center justify-center bg-black/40 z-20"
      >
        <BIcon icon="PhUploadSimple" class="w-6 h-6 text-white" />
      </div>

      <div
        v-if="mode === 'recording'"
        class="absolute top-4 left-1/2 -translate-x-1/2 flex items-center justify-center gap-x-1"
      >
        <div class="w-2 h-2 rounded-full bg-chat-error animate-pulse"></div>
      </div>
    </div>
  </div>
</template>
