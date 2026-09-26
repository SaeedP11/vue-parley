<script setup lang="ts">
import { nextTick, ref, type ComponentPublicInstance } from "vue";
import InputText from "primevue/inputtext";
import IconButton from "~/components/general/IconButton.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { chatListSearch } from "@i18n/locales";
const model = defineModel<string>({ default: "" });

const { t } = useLocalI18n(chatListSearch);
const isOpen = ref(false);
const inputRef = ref<ComponentPublicInstance | null>(null);

const toggleSearch = async () => {
  isOpen.value = !isOpen.value;
  if (!isOpen.value) {
    model.value = "";
    return;
  }
  await nextTick();
  (inputRef.value?.$el as HTMLInputElement | undefined)?.focus();
};
</script>
<template>
  <div class="w-full">
    <div
      class="flex h-16 w-full shrink-0 items-center justify-between gap-x-2 border-b border-b-chat-outline-variant px-5 md:h-20"
    >
      <div
        v-if="!isOpen"
        class="truncate text-label-lg text-chat-on-background select-none"
      >
        {{ t("title") }}
      </div>
      <InputText
        v-else
        ref="inputRef"
        v-model="model"
        data-testid="chat-search"
        :placeholder="t('search')"
        size="small"
        class="min-w-0 flex-1"
      />

      <IconButton
        :icon="isOpen ? 'PhX' : 'PhMagnifyingGlass'"
        :label="t('search')"
        data-testid="chat-search-toggle"
        class="shrink-0"
        @click="toggleSearch"
      />
    </div>
  </div>
</template>
