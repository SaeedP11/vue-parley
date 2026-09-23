<script setup lang="ts">
/**
 * The primary action beside the input: the microphone/camera button (hold to record, tap to
 * switch between voice and video), or the send button once there is text or a locked recording.
 * While recording it floats the lock pill above itself, which becomes pause/resume once locked.
 */
defineProps<{
  isRecording: boolean;
  isLocked: boolean;
  isPaused: boolean;
  hasText: boolean;
  icon: string;
  iconClass: string;
  lockOpacity: number;
  dragOffset: { x: number; y: number };
  isDragging: boolean;
}>();

const emit = defineEmits<{
  pointerdown: [event: PointerEvent];
  toggleType: [];
  togglePause: [];
  send: [];
}>();
</script>

<template>
  <div
    class="relative flex items-center justify-center shrink-0 z-30 mb-0.5"
    :style="{
      transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      transition: isDragging
        ? 'none'
        : 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    }"
  >
    <div
      v-if="isRecording"
      class="absolute -top-20 flex flex-col items-center justify-center bg-surface shadow-floating rounded-full w-9 transition-opacity"
      :class="[
        isLocked ? 'pointer-events-auto py-1.5' : 'pointer-events-none py-3 gap-y-3',
      ]"
      :style="{ opacity: lockOpacity }"
    >
      <BIcon v-if="!isLocked" icon="PhLockKey" class="w-5 h-5 fill-on-surface" />
      <div
        v-else
        class="w-full h-9 flex items-center justify-center cursor-pointer"
        @click="emit('togglePause')"
      >
        <BIcon
          :icon="isPaused ? 'PhPlayCircle' : 'PhPauseCircle'"
          class="w-6 h-6 fill-on-surface"
        />
      </div>
      <BIcon icon="PhCaretUp" class="w-4 h-4 fill-on-surface/60 animate-bounce" />
    </div>

    <div
      class="flex items-center w-11 touch-none h-11 justify-center transition-all duration-200"
      :class="[
        (isRecording && !isLocked) || hasText
          ? ' rounded-full bg-primary/10'
          : 'w-6 h-6 bg-primary/0',
      ]"
      @pointerdown="!isLocked ? emit('pointerdown', $event) : null"
      @click="!isLocked ? emit('toggleType') : null"
    >
      <BIcon
        v-if="!isLocked && !hasText"
        :icon="icon"
        :weight="isRecording ? 'fill' : 'regular'"
        class="cursor-pointer w-6 h-6 shrink-0 transition-colors"
        :class="[isRecording ? ' fill-primary' : iconClass]"
      />
      <div
        v-else
        class="min-w-11 min-h-11 aspect-square rounded-full bg-gradient-primary-secondary flex items-center justify-center cursor-pointer"
      >
        <BIcon
          icon="PhPaperPlaneTilt"
          class="w-6 h-6 fill-white shrink-0"
          @click="emit('send')"
        />
      </div>
    </div>
  </div>
</template>
