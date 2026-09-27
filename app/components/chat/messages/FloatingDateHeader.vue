<script setup lang="ts">
/** The date pill that floats over the list while scrolling and fades out when it stops. */
defineProps<{ label: string | null; opacity: number }>();
</script>

<template>
  <div
    class="absolute top-4 left-0 right-0 z-20 flex justify-center pointer-events-none transition-opacity duration-200"
    :style="{ opacity }"
  >
    <div
      v-if="label"
      class="rounded-full bg-chat-on-background/10 flex items-center justify-center px-4 py-0.5"
    >
      <div class="text-chat-on-background select-none text-label-sm">
        {{ label }}
      </div>
    </div>
  </div>
</template>
