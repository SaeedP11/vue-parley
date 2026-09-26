<script setup lang="ts">
/**
 * The primary action beside the input: the microphone/camera button (hold to record, tap to
 * switch between voice and video), or the send button once there is text or a locked recording.
 * While recording it floats the lock pill above itself, which becomes pause/resume once locked.
 */
import { computed } from "vue";
import Button from "primevue/button";
import IconButton from "~/components/general/IconButton.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { chatInput } from "@i18n/locales";

const props = defineProps<{
  isRecording: boolean;
  isLocked: boolean;
  isPaused: boolean;
  hasText: boolean;
  icon: string;
  disabled?: boolean;
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

const { t } = useLocalI18n(chatInput);

const showSend = computed(() => props.isLocked || props.hasText);
</script>

<template>
  <div
    class="relative z-30 mb-0.5 flex shrink-0 items-center justify-center"
    :style="{
      transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      transition: isDragging
        ? 'none'
        : 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    }"
  >
    <div
      v-if="isRecording"
      class="absolute -top-20 flex w-10 flex-col items-center justify-center rounded-full bg-chat-background shadow-floating transition-opacity"
      :class="[
        isLocked ? 'pointer-events-auto py-1' : 'pointer-events-none gap-y-3 py-3',
      ]"
      :style="{ opacity: lockOpacity }"
    >
      <BIcon v-if="!isLocked" icon="PhLockKey" class="size-5" />
      <IconButton
        v-else
        :icon="isPaused ? 'PhPlayCircle' : 'PhPauseCircle'"
        :label="isPaused ? t('actions.resume') : t('actions.pause')"
        icon-class="size-6"
        @click="emit('togglePause')"
      />
      <BIcon icon="PhCaretUp" class="size-4 animate-bounce opacity-60" />
    </div>

    <Button
      v-if="showSend"
      rounded
      :aria-label="t('actions.sendMessage')"
      :disabled="disabled"
      @click="emit('send')"
    >
      <template #icon>
        <BIcon icon="PhPaperPlaneTilt" class="size-6 rtl:-scale-x-100" />
      </template>
    </Button>
    <!-- Hold to record; a tap switches between voice and video. -->
    <Button
      v-else
      rounded
      :text="!isRecording"
      :severity="isRecording ? undefined : 'secondary'"
      :aria-label="icon === 'PhCamera' ? t('actions.recordVideo') : t('actions.recordVoice')"
      :disabled="disabled"
      class="touch-none"
      @pointerdown="emit('pointerdown', $event)"
      @click="emit('toggleType')"
    >
      <template #icon>
        <BIcon
          :icon="icon"
          :weight="isRecording ? 'fill' : 'regular'"
          class="size-6"
        />
      </template>
    </Button>
  </div>
</template>
