<script setup lang="ts">
/**
 * The retry prompt under a message that failed to send. The time and send state of every other
 * message sit inside the bubble, in BubbleMeta.
 */
import Button from "primevue/button";
import type { Message } from "~/types";
import { useMessagesStore } from "~/stores/messageStores.js";
import useLocalI18n from "~/composables/useLocalI18n";
import { chatBubble } from "@i18n/locales";

defineProps<{ message: Message }>();

const { t } = useLocalI18n(chatBubble);
const messagesStore = useMessagesStore();
</script>

<template>
  <div class="flex w-full justify-start pt-1">
    <Button
      text
      size="small"
      severity="danger"
      :label="t('sendFailed')"
      @click.stop="messagesStore.retryMessage(message)"
    >
      <template #icon>
        <BIcon icon="PhWarningCircle" class="size-4" />
      </template>
    </Button>
  </div>
</template>
