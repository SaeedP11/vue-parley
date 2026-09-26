<script setup lang="ts">
/** The strip above the input while replying to or editing a message. */
import SafeEmojiText from "~/components/general/SafeEmojiText.vue";
import IconButton from "~/components/general/IconButton.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { chatInput } from "@i18n/locales";

defineProps<{
  mode: "normal" | "edit" | "reply";
  /** Who wrote the message being replied to. */
  name: string;
  text: string;
}>();
const emit = defineEmits<{ cancel: [] }>();

const { t } = useLocalI18n(chatInput);
</script>

<template>
  <div
    :class="[mode !== 'normal' ? ' h-10' : 'h-0']"
    class="gap-x-3 px-3 w-full whitespace-nowrap overflow-hidden border-t select-none text-body-sm border-t-outline-variant flex relative z-30 justify-between items-center transition-all duration-200 ease-in-out bg-surface"
  >
    <BIcon
      :icon="mode === 'edit' ? 'PhPencilSimpleLine' : 'PhArrowBendUpLeft'"
      class="w-5 h-5 fill-on-surface shrink-0"
    />
    <div class="flex-1 flex items-center gap-x-2">
      <div v-if="mode === 'reply'" class="shrink-0 text-on-surface/50">
        {{ name }} :
      </div>
      <div class="flex-1">
        <div
          class="text-on-surface w-full overflow-hidden text-ellipsis line-clamp-1"
        >
          <SafeEmojiText :text="text" />
        </div>
      </div>
    </div>
    <IconButton
      icon="PhX"
      :label="t('cancel')"
      size="small"
      class="shrink-0"
      @click="emit('cancel')"
    />
  </div>
</template>
