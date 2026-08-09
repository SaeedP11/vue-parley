<template>
  <div
    class="pointer-events-none fixed left-0 top-0 z-20 h-dvh w-dvw overflow-visible md:absolute md:h-0 md:w-full md:backdrop-blur-none"
    :class="[
      isOpen
        ? 'bg-chat-on-background/10 backdrop-blur-lg md:bg-transparent'
        : 'backdrop-blur-none',
    ]"
  >
    <div
      class="pointer-events-none flex h-full flex-col items-center justify-between py-26 md:h-auto md:-translate-y-full md:items-end md:pr-4 md:py-4"
    >
      <!-- Spacer for mobile layout to push video up -->
      <div class="md:hidden" />

      <!-- Video Bubble -->
      <div
        class="transition-all duration-200 ease-in-out"
        :class="[
          isOpen
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none translate-y-1/4 scale-0 opacity-0',
        ]"
      >
        <BubbleVideo
          mode="recording"
          :stream="stream"
          :is-paused="isPaused"
          :recording-time="recordingTime"
          :max-duration="60"
        />
      </div>

      <!-- Mobile Bottom Toolbar -->
      <div
        class="origin-bottom flex items-center gap-x-6 rounded-full bg-chat-background px-4 py-3 shadow-floating md:hidden"
        :class="[
          isOpen
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none translate-y-1/4 scale-0 opacity-0',
        ]"
      >
        <BIcon
          v-for="option in mobileOptions"
          :key="option.key"
          :icon="option.icon"
          class="h-6 w-6 fill-chat-on-background"
          :class="[
            option.disabled
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer opacity-100',
          ]"
          @click="handleOption(option.key)"
        />
      </div>
    </div>
  </div>
</template>

<!-- Normal script block used to export the interface for parent components to import -->
<script lang="ts">
export interface VideoRecordDisplayExposed {
  open: () => void;
  close: () => void;
}
</script>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import BubbleVideo from "../chat-bubbles/BubbleVideo.vue";

const props = withDefaults(
  defineProps<{
    stream?: MediaStream | null;
    isPaused?: boolean;
    recordingTime?: number;
  }>(),
  {
    stream: null,
    isPaused: false,
    recordingTime: 0,
  },
);

const emit = defineEmits<{
  "flip-camera": [];
}>();


const isOpen = ref(false);
const isFlashOn = ref(false);
const hasMultipleCameras = ref(false);
const supportsTorch = ref(false);

const flashIcon = computed(() =>
  isFlashOn.value ? "PhLightningSlash" : "PhLightning",
);

onMounted(async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((d) => d.kind === "videoinput");
    hasMultipleCameras.value = videoInputs.length > 1;
  } catch (err) {
    console.error("Failed to enumerate devices for camera count", err);
  }
});

watch(
  () => props.stream,
  (newStream) => {
    if (newStream) {
      const track = newStream.getVideoTracks()[0];
      if (track && track.getCapabilities) {
        const caps = track.getCapabilities();
        supportsTorch.value = "torch" in caps;
      } else {
        supportsTorch.value = false;
      }
    } else {
      supportsTorch.value = false;
      isFlashOn.value = false;
    }
  },
  { immediate: true },
);

const mobileOptions = computed(() => [
  {
    icon: "PhArrowsClockwise",
    key: "flip-camera" as const,
    disabled: !hasMultipleCameras.value,
  },
  {
    icon: flashIcon.value,
    key: "toggle-flash" as const,
    disabled: !supportsTorch.value,
  },
]);

const handleOption = async (key: string) => {
  const option = mobileOptions.value.find((o) => o.key === key);
  if (option?.disabled) return;

  switch (key) {
    case "toggle-flash": {
      const track = props.stream?.getVideoTracks()[0];
      if (track) {
        try {
          isFlashOn.value = !isFlashOn.value;
          // Apply the native torch constraint to the existing track.
          // `torch` is a non-standard Chromium-only MediaTrackConstraint, so TS doesn't know it;
          // cast through `unknown` to satisfy the type checker without silencing it broadly.
          await track.applyConstraints({
            advanced: [{ torch: isFlashOn.value }],
          } as unknown as MediaTrackConstraints);
        } catch (err) {
          console.error("Failed to toggle flash:", err);
          isFlashOn.value = !isFlashOn.value; // Revert UI if hardware rejects it
        }
      }
      break;
    }
    case "flip-camera":
      emit("flip-camera");
      break;
  }
};

const open = () => {
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

defineExpose<VideoRecordDisplayExposed>({
  open,
  close,
});
</script>
