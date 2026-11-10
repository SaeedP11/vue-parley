<script setup lang="ts">
/**
 * A cinema-grade video player for the media viewer with PrimeVue & custom controls:
 * - Smart auto-hiding controls overlay with bottom gradient
 * - Full-width seek slider with buffered progress indicator and hover preview tooltip
 * - Center play/pause/skip feedback ripples & end-of-video replay button
 * - Double-click / double-tap to seek (±5s)
 * - Playback speed cycling (1x, 1.25x, 1.5x, 2x, 0.5x)
 * - Volume control with hover slider and mouse wheel adjustment
 * - Picture-in-Picture (PiP) support
 * - Time remaining / elapsed toggle
 * - Comprehensive keyboard shortcuts (Space, J/K/L, Arrows, M, F)
 * - Transparent background blob streaming fallback for non-Range servers
 */
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from "vue";
import Slider from "primevue/slider";
import ProgressSpinner from "primevue/progressspinner";
import { useEventListener, useSwipe } from "@vueuse/core";
import IconButton from "~/components/general/IconButton.vue";
import BIcon from "~/components/global/BIcon.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { formatDuration } from "~/utils/media";
import { useMediaStore } from "~/stores/mediaStore";
import { mediaViewer } from "@i18n/locales";

const props = defineProps<{ src: string }>();

const emit = defineEmits<{ swipe: [direction: "left" | "right"] }>();

const { t } = useLocalI18n(mediaViewer);
const mediaStore = useMediaStore();

const frame = useTemplateRef<HTMLElement>("frame");
const video = useTemplateRef<HTMLVideoElement>("video");
const sliderContainer = useTemplateRef<HTMLElement>("sliderContainer");

const playbackSrc = ref(props.src);
const isSeekable = ref(false);
const pendingSeek = ref<number | null>(null);
let objectUrl: string | null = null;
let abortController: AbortController | null = null;

const isPlaying = ref(false);
const isEnded = ref(false);
const isMuted = ref(false);
const volume = ref(1);
const isFullscreen = ref(false);
const isWaiting = ref(true);
const failed = ref(false);
const current = ref(0);
const duration = ref(0);
const scrubbing = ref(false);
const bufferedPercent = ref(0);
const showRemainingTime = ref(false);
const supportsPiP = ref(false);
const showVolumeSlider = ref(false);

// Controls visibility & auto-hiding
const showControls = ref(true);
let hideControlsTimer: ReturnType<typeof setTimeout> | null = null;

const resetControlsTimeout = () => {
  showControls.value = true;
  if (hideControlsTimer) clearTimeout(hideControlsTimer);
  if (isPlaying.value && !scrubbing.value && !showVolumeSlider.value) {
    hideControlsTimer = setTimeout(() => {
      showControls.value = false;
    }, 2800);
  }
};

const onMouseMove = () => {
  resetControlsTimeout();
};

const onMouseLeave = () => {
  if (isPlaying.value && !scrubbing.value && !showVolumeSlider.value) {
    if (hideControlsTimer) clearTimeout(hideControlsTimer);
    showControls.value = false;
  }
};

watch(isPlaying, (playing) => {
  if (!playing) {
    if (hideControlsTimer) clearTimeout(hideControlsTimer);
    showControls.value = true;
  } else {
    resetControlsTimeout();
  }
});

watch(scrubbing, (isScrubbing) => {
  if (isScrubbing) {
    if (hideControlsTimer) clearTimeout(hideControlsTimer);
    showControls.value = true;
  } else {
    resetControlsTimeout();
  }
});

// Center feedback ripples
type FeedbackType = "play" | "pause" | "skip-forward" | "skip-back";
const feedbackState = ref<{ type: FeedbackType; id: number } | null>(null);
let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

const showFeedback = (type: FeedbackType) => {
  if (feedbackTimer) clearTimeout(feedbackTimer);
  feedbackState.value = { type, id: Date.now() };
  feedbackTimer = setTimeout(() => {
    feedbackState.value = null;
  }, 650);
};

// Playback Speed
const playbackRates = [1, 1.25, 1.5, 2, 0.5];
const currentRateIndex = ref(0);
const playbackRate = computed(() => playbackRates[currentRateIndex.value] ?? 1);

const cycleSpeed = () => {
  currentRateIndex.value = (currentRateIndex.value + 1) % playbackRates.length;
  if (video.value) {
    video.value.playbackRate = playbackRate.value;
  }
  resetControlsTimeout();
};

// Hover preview tooltip on timeline
const hoverPercent = ref<number | null>(null);
const hoverTime = ref<number | null>(null);

const onSliderMouseMove = (e: MouseEvent) => {
  const el = sliderContainer.value;
  if (!el || !duration.value || duration.value <= 0) {
    hoverTime.value = null;
    hoverPercent.value = null;
    return;
  }
  const rect = el.getBoundingClientRect();
  const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  const percent = (offsetX / rect.width) * 100;
  hoverPercent.value = percent;
  hoverTime.value = (percent / 100) * duration.value;
};

const onSliderMouseLeave = () => {
  hoverTime.value = null;
  hoverPercent.value = null;
};

// Buffered range calculation
const updateBuffered = () => {
  const el = video.value;
  if (!el || !duration.value || duration.value <= 0) {
    bufferedPercent.value = 0;
    return;
  }
  if (playbackSrc.value.startsWith("blob:") || playbackSrc.value.startsWith("data:")) {
    bufferedPercent.value = 100;
    return;
  }
  const buf = el.buffered;
  if (!buf || buf.length === 0) {
    bufferedPercent.value = 0;
    return;
  }
  const cur = el.currentTime;
  let end = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf.start(i) <= cur && cur <= buf.end(i)) {
      end = buf.end(i);
      break;
    }
    if (buf.end(i) > end) {
      end = buf.end(i);
    }
  }
  bufferedPercent.value = Math.min(100, (end / duration.value) * 100);
};

// Volume & Wheel handling
const setVolume = (val: number) => {
  const clamped = Math.max(0, Math.min(1, val));
  volume.value = clamped;
  if (video.value) {
    video.value.volume = clamped;
    video.value.muted = clamped === 0;
  }
  isMuted.value = clamped === 0;
};

const toggleMute = () => {
  if (!video.value) return;
  if (video.value.muted || volume.value === 0) {
    video.value.muted = false;
    if (volume.value === 0) setVolume(1);
    else isMuted.value = false;
  } else {
    video.value.muted = true;
    isMuted.value = true;
  }
  resetControlsTimeout();
};

const onWheel = (e: WheelEvent) => {
  e.preventDefault();
  const step = e.deltaY < 0 ? 0.05 : -0.05;
  setVolume(volume.value + step);
  resetControlsTimeout();
};

// Source setup and Range fallback
const releaseObjectUrl = () => {
  abortController?.abort();
  abortController = null;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
};

const setupSource = async (url: string) => {
  releaseObjectUrl();
  pendingSeek.value = null;
  isEnded.value = false;

  if (!url) {
    playbackSrc.value = "";
    isSeekable.value = false;
    return;
  }

  // Local blobs are seekable in memory immediately.
  if (url.startsWith("blob:") || url.startsWith("data:")) {
    playbackSrc.value = url;
    isSeekable.value = true;
    bufferedPercent.value = 100;
    return;
  }

  // Check if already present in media cache.
  try {
    const cached = await mediaStore.getCachedBlob(url);
    if (cached) {
      objectUrl = URL.createObjectURL(cached);
      playbackSrc.value = objectUrl;
      isSeekable.value = true;
      bufferedPercent.value = 100;
      return;
    }
  } catch {
    // Best-effort cache check
  }

  // Start with streaming URL so playback can start without waiting for download.
  playbackSrc.value = url;

  const ac = new AbortController();
  abortController = ac;

  try {
    // Probe HTTP Range support: a 206 Partial Content means server supports byte-range seeking.
    const probe = await fetch(url, {
      headers: { Range: "bytes=0-" },
      signal: ac.signal,
    });

    if (probe.status === 206) {
      isSeekable.value = true;
      return;
    }

    // Server ignores range requests (returns 200). Fetch the full blob in background.
    const blob = await mediaStore.download(url, { signal: ac.signal });
    if (abortController !== ac) return;

    objectUrl = URL.createObjectURL(blob);
    const media = video.value;
    const at = pendingSeek.value !== null ? pendingSeek.value : (media?.currentTime ?? 0);
    const wasPlaying = isPlaying.value;

    playbackSrc.value = objectUrl;
    isSeekable.value = true;
    bufferedPercent.value = 100;
    pendingSeek.value = null;

    if (media) {
      media.addEventListener(
        "loadedmetadata",
        () => {
          media.currentTime = at;
          media.playbackRate = playbackRate.value;
          if (wasPlaying) media.play().catch(() => {});
        },
        { once: true },
      );
    }
  } catch (error: any) {
    if (error?.name !== "AbortError") {
      isSeekable.value = false;
    }
  }
};

watch(() => props.src, setupSource, { immediate: true });

const togglePlay = () => {
  const el = video.value;
  if (!el) return;
  if (isEnded.value) {
    el.currentTime = 0;
    isEnded.value = false;
    el.play().catch(() => {});
    showFeedback("play");
    return;
  }
  if (el.paused || el.ended) {
    el.play().catch(() => {});
    showFeedback("play");
  } else {
    el.pause();
    showFeedback("pause");
  }
};

const replay = () => {
  const el = video.value;
  if (!el) return;
  el.currentTime = 0;
  isEnded.value = false;
  el.play().catch(() => {});
  showFeedback("play");
  resetControlsTimeout();
};

const skip = (delta: number) => {
  const el = video.value;
  if (!el) return;
  const target = Math.max(0, Math.min(duration.value || 0, el.currentTime + delta));
  seek(target);
  showFeedback(delta > 0 ? "skip-forward" : "skip-back");
  resetControlsTimeout();
};

const toggleFullscreen = () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else frame.value?.requestFullscreen?.().catch(() => {});
};

const togglePiP = async () => {
  const el = video.value;
  if (!el) return;
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await el.requestPictureInPicture();
    }
  } catch {
    // Best-effort PiP
  }
};

const seek = (value: number | number[]) => {
  const time = Array.isArray(value) ? value[0]! : value;
  current.value = time;
  if (video.value) {
    if (isSeekable.value) {
      video.value.currentTime = time;
    } else {
      pendingSeek.value = time;
    }
  }
};

const onTimeUpdate = () => {
  if (!scrubbing.value && video.value) {
    current.value = video.value.currentTime;
    if ((!duration.value || !Number.isFinite(duration.value)) && video.value.currentTime > 0) {
      duration.value = Math.max(duration.value || 0, video.value.currentTime);
    }
  }
  updateBuffered();
};

const resolveWebMDuration = () => {
  const el = video.value;
  if (!el) return;
  const d = el.duration;
  if (Number.isFinite(d) && d > 0) {
    duration.value = d;
    return;
  }
  if (d === Infinity || (!Number.isFinite(d) && isSeekable.value)) {
    const onTime = () => {
      el.removeEventListener("timeupdate", onTime);
      const resolved =
        Number.isFinite(el.duration) && el.duration > 0
          ? el.duration
          : el.currentTime;
      if (Number.isFinite(resolved) && resolved > 0) {
        duration.value = resolved;
      }
      el.currentTime = 0;
    };
    el.addEventListener("timeupdate", onTime, { once: true });
    el.currentTime = 1e101;
  }
};

const onMetadata = () => {
  resolveWebMDuration();
  updateBuffered();
  if (video.value) {
    video.value.playbackRate = playbackRate.value;
  }
};

const onEnded = () => {
  isPlaying.value = false;
  isEnded.value = true;
  showControls.value = true;
  if (video.value && (!duration.value || !Number.isFinite(duration.value))) {
    duration.value = video.value.currentTime;
  }
};

// Double-click / single-click detection
let lastClickTime = 0;
let clickTimer: ReturnType<typeof setTimeout> | null = null;

const onVideoClick = (e: MouseEvent) => {
  const now = Date.now();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const width = rect.width;
  const isLeft = clickX < width * 0.35;
  const isRight = clickX > width * 0.65;

  if (now - lastClickTime < 280) {
    if (clickTimer) clearTimeout(clickTimer);
    lastClickTime = 0;
    if (isLeft) {
      skip(-5);
    } else if (isRight) {
      skip(5);
    } else {
      toggleFullscreen();
    }
  } else {
    lastClickTime = now;
    clickTimer = setTimeout(() => {
      togglePlay();
      resetControlsTimeout();
    }, 250);
  }
};

useEventListener(document, "fullscreenchange", () => {
  isFullscreen.value = !!document.fullscreenElement && document.fullscreenElement === frame.value;
});

// Keyboard shortcuts: Space/K (play/pause), Left/Right/J/L (seek ±5s), Up/Down (volume ±10%), M (mute), F (fullscreen)
useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (event.defaultPrevented) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, [contenteditable='true']")) return;

  switch (event.key) {
    case " ":
    case "k":
    case "K":
      event.preventDefault();
      togglePlay();
      resetControlsTimeout();
      break;
    case "ArrowLeft":
    case "j":
    case "J":
      event.preventDefault();
      skip(-5);
      break;
    case "ArrowRight":
    case "l":
    case "L":
      event.preventDefault();
      skip(5);
      break;
    case "ArrowUp":
      event.preventDefault();
      setVolume(volume.value + 0.1);
      resetControlsTimeout();
      break;
    case "ArrowDown":
      event.preventDefault();
      setVolume(volume.value - 0.1);
      resetControlsTimeout();
      break;
    case "m":
    case "M":
      event.preventDefault();
      toggleMute();
      break;
    case "f":
    case "F":
      event.preventDefault();
      toggleFullscreen();
      break;
  }
});

useSwipe(video, {
  onSwipeEnd: (_, direction) => {
    if (direction === "left" || direction === "right") emit("swipe", direction);
  },
});

const displayedDuration = computed(() => {
  if (showRemainingTime.value) {
    const remaining = Math.max(0, (duration.value || 0) - current.value);
    return `-${formatDuration(remaining)}`;
  }
  return formatDuration(duration.value);
});

onMounted(() => {
  supportsPiP.value =
    typeof document !== "undefined" &&
    "pictureInPictureEnabled" in document &&
    !!document.pictureInPictureEnabled;
  video.value?.play().catch(() => {});
});

onBeforeUnmount(() => {
  if (clickTimer) clearTimeout(clickTimer);
  if (feedbackTimer) clearTimeout(feedbackTimer);
  if (hideControlsTimer) clearTimeout(hideControlsTimer);
  releaseObjectUrl();
  if (document.fullscreenElement === frame.value) document.exitFullscreen().catch(() => {});
});
</script>

<template>
  <div
    ref="frame"
    class="relative flex size-full max-h-[calc(100dvh-10rem)] max-w-dvw flex-col items-center justify-center overflow-hidden select-none md:max-w-[calc(100dvw-9rem)]"
    :class="[
      isFullscreen && 'max-h-none! max-w-none! bg-black',
      !showControls && isPlaying && 'cursor-none',
    ]"
    data-testid="viewer-video"
    :data-playing="String(isPlaying)"
    @mousemove="onMouseMove"
    @mouseleave="onMouseLeave"
    @wheel="onWheel"
  >
    <div
      v-if="failed"
      class="flex max-w-80 flex-col items-center gap-y-3 px-6 text-center text-white/80"
    >
      <BIcon icon="PhWarningCircle" class="size-10" />
      <p class="text-body-md">{{ t("cantPlay") }}</p>
    </div>

    <template v-else>
      <video
        ref="video"
        :src="playbackSrc"
        playsinline
        preload="auto"
        class="size-full touch-pan-y object-contain cursor-pointer"
        @click="onVideoClick"
        @play="isPlaying = true; isEnded = false"
        @pause="isPlaying = false"
        @ended="onEnded"
        @waiting="isWaiting = true"
        @playing="isWaiting = false; isPlaying = true; isEnded = false"
        @canplay="isWaiting = false"
        @loadedmetadata="onMetadata"
        @durationchange="onMetadata"
        @timeupdate="onTimeUpdate"
        @progress="updateBuffered"
        @volumechange="isMuted = !!video?.muted; volume = video?.volume ?? 1"
        @error="failed = true"
      />

      <!-- Buffering Spinner -->
      <ProgressSpinner
        v-if="isWaiting"
        stroke-width="3"
        class="pointer-events-none absolute! top-1/2 left-1/2 size-12! -translate-1/2 z-30 [&_circle]:stroke-white!"
      />

      <!-- Replay Button Overlay on Ended -->
      <button
        v-if="isEnded && !isWaiting"
        type="button"
        class="absolute top-1/2 left-1/2 -translate-1/2 z-30 flex size-16 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md shadow-2xl transition-all duration-200 hover:scale-110 hover:bg-black/80 cursor-pointer"
        aria-label="Replay"
        @click.stop="replay"
      >
        <BIcon icon="PhArrowsClockwise" weight="bold" class="size-8" />
      </button>

      <!-- Center Action Feedback Ripple -->
      <Transition name="feedback-fade">
        <div
          v-if="feedbackState && !isEnded"
          :key="feedbackState.id"
          class="pointer-events-none absolute top-1/2 left-1/2 -translate-1/2 z-30 flex items-center justify-center rounded-full bg-black/60 p-4 text-white backdrop-blur-md shadow-2xl"
        >
          <BIcon
            v-if="feedbackState.type === 'play'"
            icon="PhPlay"
            weight="fill"
            class="size-8 translate-x-0.5"
          />
          <BIcon
            v-else-if="feedbackState.type === 'pause'"
            icon="PhPause"
            weight="fill"
            class="size-8"
          />
          <div
            v-else-if="feedbackState.type === 'skip-forward'"
            class="flex items-center gap-1.5 px-2 text-label-md font-semibold"
          >
            <span>+5s</span>
            <BIcon icon="PhArrowRight" weight="bold" class="size-5" />
          </div>
          <div
            v-else-if="feedbackState.type === 'skip-back'"
            class="flex items-center gap-1.5 px-2 text-label-md font-semibold"
          >
            <BIcon icon="PhArrowLeft" weight="bold" class="size-5" />
            <span>-5s</span>
          </div>
        </div>
      </Transition>

      <!-- Bottom Controls Overlay -->
      <div
        dir="ltr"
        class="absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end bg-linear-to-t from-black/85 via-black/45 to-transparent px-3 pt-8 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white transition-opacity duration-300 md:px-5"
        :class="showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
        @mouseenter="showControls = true"
      >
        <!-- Timeline Seek Bar with Buffered Range & Hover Tooltip -->
        <div
          ref="sliderContainer"
          class="group/slider relative flex w-full items-center py-2 cursor-pointer"
          @mousemove="onSliderMouseMove"
          @mouseleave="onSliderMouseLeave"
        >
          <!-- Hover Timestamp Tooltip -->
          <div
            v-if="hoverTime !== null && duration > 0"
            class="pointer-events-none absolute -top-7 -translate-x-1/2 rounded bg-black/85 px-2 py-0.5 text-xs text-white shadow-md backdrop-blur-xs tabular-nums"
            :style="{ left: `${hoverPercent}%` }"
          >
            {{ formatDuration(hoverTime) }}
          </div>

          <!-- Track Background & Buffered Progress Bar -->
          <div class="pointer-events-none absolute inset-x-0 h-1 overflow-hidden rounded-full bg-white/25">
            <div
              class="h-full bg-white/45 transition-all duration-300"
              :style="{ width: `${bufferedPercent}%` }"
            />
          </div>

          <!-- Seek Slider -->
          <Slider
            :model-value="current"
            :min="0"
            :max="duration || 1"
            :step="0.1"
            :disabled="!duration"
            :aria-label="t('actions.seek')"
            class="relative z-10 w-full"
            :pt="{
              root: { class: 'bg-transparent! h-1!' },
              range: { class: 'bg-white! h-1!' },
              handle: {
                class:
                  'bg-white! before:bg-white! size-3! transition-transform group-hover/slider:scale-135',
              },
            }"
            :dt="{ track: { background: 'transparent' } }"
            @update:model-value="seek"
            @slidestart="scrubbing = true"
            @slideend="scrubbing = false"
          />
        </div>

        <!-- Controls Row -->
        <div class="flex w-full items-center justify-between pt-1">
          <!-- Left Controls: Play/Pause, Skip buttons, Time Display -->
          <div class="flex items-center gap-x-1 md:gap-x-1.5">
            <IconButton
              :icon="isPlaying ? 'PhPause' : 'PhPlay'"
              :label="isPlaying ? t('actions.pause') : t('actions.play')"
              weight="fill"
              class="text-white! hover:bg-white/15!"
              data-testid="viewer-play"
              @click="togglePlay"
            />
            <IconButton
              icon="PhArrowUUpLeft"
              label="Rewind 5s"
              class="text-white/85! hover:bg-white/15! hover:text-white!"
              @click="skip(-5)"
            />
            <IconButton
              icon="PhArrowUUpRight"
              label="Forward 5s"
              class="text-white/85! hover:bg-white/15! hover:text-white!"
              @click="skip(5)"
            />

            <!-- Time Display -->
            <div class="flex items-center gap-x-1 ps-1 text-label-sm tabular-nums text-white/90">
              <span>{{ formatDuration(current) }}</span>
              <span class="text-white/50">/</span>
              <button
                type="button"
                class="cursor-pointer text-white/70 hover:text-white transition-colors"
                title="Click to toggle remaining time"
                @click="showRemainingTime = !showRemainingTime"
              >
                {{ displayedDuration }}
              </button>
            </div>
          </div>

          <!-- Right Controls: Speed, Volume, PiP, Fullscreen -->
          <div class="flex items-center gap-x-1 md:gap-x-1.5">
            <!-- Playback Speed Badge -->
            <button
              type="button"
              class="flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-label-sm font-semibold text-white/85 transition hover:bg-white/15 hover:text-white cursor-pointer"
              title="Playback Speed"
              @click="cycleSpeed"
            >
              {{ playbackRate }}x
            </button>

            <!-- Volume Control with Hover Slider -->
            <div
              class="relative flex items-center group/volume"
              @mouseenter="showVolumeSlider = true"
              @mouseleave="showVolumeSlider = false"
            >
              <IconButton
                :icon="isMuted || volume === 0 ? 'PhSpeakerSlash' : 'PhSpeakerHigh'"
                :label="isMuted ? t('actions.unmute') : t('actions.mute')"
                class="text-white! hover:bg-white/15!"
                @click="toggleMute"
              />
              <div
                class="overflow-hidden transition-all duration-200 flex items-center"
                :class="
                  showVolumeSlider
                    ? 'w-18 opacity-100 me-1'
                    : 'w-0 opacity-0 pointer-events-none'
                "
              >
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  :value="isMuted ? 0 : volume"
                  class="h-1 w-16 cursor-pointer accent-white"
                  aria-label="Volume"
                  @input="setVolume(Number(($event.target as HTMLInputElement).value))"
                />
              </div>
            </div>

            <!-- Picture-in-Picture -->
            <IconButton
              v-if="supportsPiP"
              icon="PhMonitorArrowUp"
              label="Picture-in-Picture"
              class="hidden! text-white/85! hover:bg-white/15! hover:text-white! md:inline-flex!"
              @click="togglePiP"
            />

            <!-- Fullscreen -->
            <IconButton
              :icon="isFullscreen ? 'PhCornersIn' : 'PhFrameCorners'"
              :label="isFullscreen ? t('actions.exitFullscreen') : t('actions.fullscreen')"
              class="hidden! text-white! hover:bg-white/15! md:inline-flex!"
              @click="toggleFullscreen"
            />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.feedback-fade-enter-active,
.feedback-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.feedback-fade-enter-from,
.feedback-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.75);
}
.feedback-fade-enter-to,
.feedback-fade-leave-from {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}
</style>
