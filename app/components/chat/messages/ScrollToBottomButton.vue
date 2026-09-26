<script setup lang="ts">
/** Jumps back to the newest message; shows how many arrived while the user was scrolled up. */
import Badge from "primevue/badge";
import IconButton from "~/components/general/IconButton.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { chatMessages } from "@i18n/locales";

defineProps<{ visible: boolean; unseen: number }>();
const emit = defineEmits<{ click: [] }>();

const { t } = useLocalI18n(chatMessages);
</script>

<template>
  <div class="relative w-14 pr-3 pb-1">
    <div
      :class="[
        visible
          ? 'pointer-events-auto scale-100 opacity-100'
          : 'pointer-events-none scale-0 opacity-0',
      ]"
      class="origin-bottom transition-all duration-200 ease-in-out"
    >
      <IconButton
        icon="PhArrowDown"
        icon-class="size-6"
        :label="t('actions.scrollToLatest')"
        :text="false"
        raised
        size="large"
        :tabindex="visible ? undefined : -1"
        @click="emit('click')"
      />
    </div>
    <Badge
      v-if="visible && unseen > 0"
      dir="ltr"
      :value="unseen > 99 ? '99+' : unseen"
      class="pointer-events-none absolute! -top-2 right-3"
    />
  </div>
</template>
