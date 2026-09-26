<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    progress?: number;
    size?: number;
    strokeWidth?: number;
    isUploading?: boolean;
    isDownloading?: boolean;
  }>(),
  {
    progress: 0,
    size: 40,
    strokeWidth: 2,
    isUploading: false,
    isDownloading: false,
  },
);

// SVG Geometry Calculations
const center = computed(() => props.size / 2);

// Ensure the circle stays within the SVG box by subtracting half the stroke
const radius = computed(() => props.size / 2 - props.strokeWidth / 2);

// Math for the progress ring
const circumference = computed(() => 2 * Math.PI * radius.value);

const dashOffset = computed(() => {
  return circumference.value - props.progress * circumference.value;
});

// Dynamic Icon Sizing (40% of container size)
const iconSize = computed(() => props.size * 0.4);
</script>

<template>
  <div
    class="relative shrink-0 group flex items-center justify-center"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <svg
      class="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
      :viewBox="`0 0 ${size} ${size}`"
    >
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        class="stroke-chat-on-background/45"
        :stroke-width="strokeWidth"
        fill="none"
      />
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        class="stroke-chat-on-background transition-all duration-200 ease-linear"
        :stroke-width="strokeWidth"
        fill="none"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
      />
    </svg>

    <div class="flex items-center justify-center transition-colors">
      <BIcon
        v-if="isUploading"
        icon="PhUploadSimple"
        :style="{ width: `${iconSize}px`, height: `${iconSize}px` }"
        class="fill-chat-on-background"
      />
      <BIcon
        v-else-if="isDownloading"
        icon="PhX"
        :style="{ width: `${iconSize}px`, height: `${iconSize}px` }"
        class="fill-chat-on-background"
      />
      <BIcon
        v-else
        icon="PhDownloadSimple"
        :style="{ width: `${iconSize}px`, height: `${iconSize}px` }"
        class="fill-chat-on-background"
      />
    </div>
  </div>
</template>
