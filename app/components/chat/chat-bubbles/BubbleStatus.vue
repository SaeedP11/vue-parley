<script setup lang="ts">
/**
 * The footer under a message: send state and time, or a retry prompt when the send failed.
 */
import { computed } from "vue";
import type { Message } from "~/types";
import { useMessagesStore } from "~/stores/messageStores.js";
import useLocalI18n from "~/composables/useLocalI18n";
import { useDate } from "~/composables/useDate.js";
import { chatBubble } from "@i18n/locales";

const props = defineProps<{ message: Message; isMine: boolean }>();

const { t } = useLocalI18n(chatBubble);
const { formatTime } = useDate();
const messagesStore = useMessagesStore();

const checkIcon = computed(() => {
  if (props.message.isFailed) return "PhWarningCircle";
  if (props.message.isSent)
    return props.message.isRead ? "PhChecks" : "PhCheck";
  return "PhClock";
});
</script>

<template>
  <div
    v-if="isMine && message.isFailed"
    role="button"
    class="w-full pt-2 flex items-center gap-x-2 cursor-pointer justify-start"
    @click.stop="messagesStore.retryMessage(message)"
  >
    <BIcon :icon="checkIcon" class="w-4 h-4 fill-error" />
    <div class="select-none text-body-sm text-error">
      {{ t("sendFailed") }}
    </div>
  </div>
  <div
    v-else
    class="w-full pt-2 flex items-center gap-x-2.5"
    :class="{ 'justify-start': isMine, 'justify-end': !isMine }"
  >
    <BIcon
      v-if="isMine"
      :icon="checkIcon"
      class="w-4 h-4"
      :class="{
        'fill-primary': message.isRead && message.isSent,
        'fill-on-surface/50': !(message.isRead && message.isSent),
      }"
    />
    <div class="select-none text-body-sm text-on-surface/50">
      {{ formatTime(message.date) }}
    </div>
  </div>
</template>
