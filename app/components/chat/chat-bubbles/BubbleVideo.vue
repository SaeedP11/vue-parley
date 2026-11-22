<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useMessagesStore } from "~/stores/messageStores";
import { useMediaStore } from "~/stores/mediaStore";
import { formatBytes } from "~/utils/format";
import useLocalI18n from "~/composables/useLocalI18n";
import { chatBubble } from "@i18n/locales";

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
    fileSize?: number;
    compress?: number;
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
const mediaStore = useMediaStore();
const { t } = useLocalI18n(chatBubble);
const videoRef = ref<HTMLVideoElement | null>(null);
const isPlaying = ref(false);
const isMuted = ref(false);
const isLoaded = ref(false);
const isBuffering = ref(false);
const progress = ref(0);

const uploadData = computed(() =>
  props.messageId ? messagesStore.uploadProgress.get(props.messageId) : null,
);
const isUploading = computed(() => !props.isSent && uploadData.value);
const isCompressing = computed(() => !props.isSent && props.compress !== undefined);

const fetchedSize = ref<number | null>(null);
const resolvedSize = computed(() => props.fileSize ?? fetchedSize.value);

const formattedSize = computed(() => {
  const size = resolvedSize.value;
  if (isUploading.value && uploadData.value) {
    const realTotal = size || uploadData.value.total;
    if (realTotal > 0) {
      const currentUploaded = (uploadData.value.progress / 100) * realTotal;
      return `${formatBytes(currentUploaded)} / ${formatBytes(realTotal)}`;
    }
  }
  return size !== null && size !== undefined && size > 0
    ? formatBytes(size)
    : "";
});

const getFileSize = async () => {
  if (props.fileSize !== undefined && props.fileSize !== null) {
    fetchedSize.value = props.fileSize;
    return;
  }
  if (!props.videoUrl) return;
  if (props.videoUrl.startsWith("blob:")) {
    try {
      const res = await fetch(props.videoUrl);
      const blob = await res.blob();
      fetchedSize.value = blob.size;
    } catch {
      fetchedSize.value = 0;
    }
    return;
  }
  try {
    const size = await mediaStore.fetchFileSize(props.videoUrl);
    fetchedSize.value = size ?? 0;
  } catch {
    fetchedSize.value = 0;
  }
};

onMounted(() => {
  if (props.mode === "playback") {
    getFileSize();
  }
});

watch(
  () => props.fileSize,
  (newSize) => {
    if (typeof newSize === "number") {
      fetchedSize.value = newSize;
    }
  },
);

watch(
  () => props.videoUrl,
  () => {
    if (props.mode === "playback") {
      getFileSize();
    }
  },
);

const circumference = 2 * Math.PI * 113;
const dashOffset = computed(() => {
  if (isCompressing.value) {
    return circumference - ((props.compress ?? 0) / 100) * circumference;
  }

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

const cancelUpload = () => {
  if (props.messageId) {
    messagesStore.cancelSending(props.messageId);
  }
};

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
          isUploading || isCompressing ? 'stroke-white/30' : 'stroke-white dark:stroke-chat-background',
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
        @waiting="isBuffering = true"
        @stalled="isBuffering = true"
        @seeking="isBuffering = true"
        @seeked="isBuffering = false"
        @playing="isBuffering = false; isPlaying = true"
        @canplay="isBuffering = false"
        @loadeddata="isLoaded = true; isBuffering = false"
        @loadedmetadata="handleMetadata"
        @durationchange="handleMetadata"
      ></video>

      <div
        v-if="!isLoaded && mode === 'playback'"
        class="absolute inset-0 flex items-center justify-center bg-chat-background"
      ></div>

      <!-- Loading spinner when chunk is not prepared or is downloading / buffering -->
      <div
        v-if="mode === 'playback' && !isUploading && (isBuffering || !isLoaded)"
        class="absolute inset-0 flex items-center justify-center bg-black/40 z-20 pointer-events-none"
      >
        <div class="size-7 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      </div>

      <div
        v-if="mode === 'playback' && !isUploading && !isBuffering && isLoaded"
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
        <button
          type="button"
          :aria-label="t('actions.cancelUpload')"
          data-testid="bubble-video-cancel"
          class="flex items-center justify-center size-12 rounded-full bg-black/55 hover:bg-black/75 active:scale-95 transition-all cursor-pointer text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chat-primary"
          @click.stop="cancelUpload"
        >
          <BIcon icon="PhX" class="size-6 text-white" />
        </button>
      </div>

      <div
        v-if="mode === 'recording'"
        class="absolute top-4 left-1/2 -translate-x-1/2 flex items-center justify-center gap-x-1"
      >
        <div class="w-2 h-2 rounded-full bg-chat-error animate-pulse"></div>
      </div>
    </div>

    <!-- Video file size badge -->
    <div
      v-if="formattedSize && mode === 'playback'"
      data-testid="bubble-video-size"
      class="pointer-events-none absolute start-2 bottom-2 z-20 flex select-none items-center gap-x-1 rounded-full bg-black/45 px-2 py-1 text-[11px] leading-none text-white backdrop-blur-sm"
    >
      <BIcon icon="PhVideo" class="size-3 text-white/80" />
      <span>{{ formattedSize }}</span>
    </div>
  </div>
</template>
