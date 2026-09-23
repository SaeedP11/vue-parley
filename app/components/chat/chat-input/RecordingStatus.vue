<script setup lang="ts">
/** Replaces the text field while recording: swipe-to-cancel hint (or Cancel once locked) and the timer. */
import useLocalI18n from "~/composables/useLocalI18n";
import { chat, chatInput } from "@i18n/locales";

defineProps<{ locked: boolean; cancelOpacity: number; time: string }>();
const emit = defineEmits<{ cancel: [] }>();

const { t } = useLocalI18n(chatInput, chat);
</script>

<template>
  <div class="flex-1 justify-between -translate-y-2 flex items-center">
    <div></div>
    <div
      class="flex justify-center items-center text-body-md text-on-surface/70 transition-opacity"
      :style="{ opacity: cancelOpacity }"
    >
      <span v-if="!locked">{{ t("chat.swipeToCancel") }}</span>
      <span
        v-else
        class="text-primary cursor-pointer px-4 z-20"
        @click="emit('cancel')"
        >{{ t("chat.cancel") }}</span
      >
    </div>

    <div class="left-6 flex items-center gap-x-2 shrink-0 z-10">
      <div class="w-2.5 h-2.5 relative">
        <div class="w-2.5 h-2.5 rounded-full bg-error"></div>
        <div
          class="w-2.5 h-2.5 rounded-full bg-error animate-ping absolute top-0 left-0 inset-0"
        ></div>
      </div>
      <span
        class="text-body-md min-w-12 text-center text-on-surface tabular-nums mt-0.5"
        dir="ltr"
        >{{ time }}</span
      >
    </div>
  </div>
</template>
