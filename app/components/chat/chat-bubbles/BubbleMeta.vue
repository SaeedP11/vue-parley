<script setup lang="ts">
/**
 * A message's time and, on your own messages, its send state, drawn inside the bubble's end corner.
 * `overlay` is the pill form laid over a photo or video, where plain text would not be readable.
 */
import { computed } from "vue";
import type { Message } from "~/types";
import { useDate } from "~/composables/useDate.js";

const props = withDefaults(
  defineProps<{ message: Message; isMine: boolean; overlay?: boolean }>(),
  { overlay: false },
);

const { formatTime } = useDate();

const checkIcon = computed(() => {
  if (props.message.isFailed) return "PhWarningCircle";
  if (props.message.isSent)
    return props.message.isRead ? "PhChecks" : "PhCheck";
  return "PhClock";
});

const iconColor = computed(() => {
  if (props.message.isFailed) return "fill-chat-error";
  if (props.overlay) return "fill-white";
  return props.message.isRead && props.message.isSent
    ? "fill-chat-primary"
    : "fill-chat-muted";
});
</script>

<template>
  <div
    class="pointer-events-none flex select-none items-center gap-x-1 text-[11px] leading-none"
    :class="
      overlay
        ? 'rounded-full bg-black/45 px-2 py-1 text-white'
        : 'text-chat-muted'
    "
  >
    <BIcon v-if="isMine" :icon="checkIcon" class="size-3.5" :class="iconColor" />
    <span>{{ formatTime(message.date) }}</span>
  </div>
</template>
