<script setup lang="ts">
/**
 * The list's header: its title over a search field that is always there, so finding a
 * conversation is one step rather than two. The clear button only shows once there is a query.
 */
import { ref, type ComponentPublicInstance } from "vue";
import IconField from "primevue/iconfield";
import InputIcon from "primevue/inputicon";
import InputText from "primevue/inputtext";
import IconButton from "~/components/general/IconButton.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { chatListSearch } from "@i18n/locales";
const model = defineModel<string>({ default: "" });

const { t } = useLocalI18n(chatListSearch);
const inputRef = ref<ComponentPublicInstance | null>(null);

const clear = () => {
  model.value = "";
  (inputRef.value?.$el as HTMLInputElement | undefined)?.focus();
};
</script>
<template>
  <div
    class="flex w-full flex-col gap-y-3 border-b border-b-chat-outline-variant px-4 pt-4 pb-3 md:pt-5"
  >
    <h2 class="m-0 truncate text-label-lg text-chat-on-background select-none">
      {{ t("title") }}
    </h2>

    <div class="relative w-full">
      <IconField class="w-full">
        <InputIcon class="flex! items-center text-chat-muted">
          <BIcon icon="PhMagnifyingGlass" class="size-4.5" />
        </InputIcon>
        <InputText
          ref="inputRef"
          v-model="model"
          type="search"
          autocomplete="off"
          data-testid="chat-search"
          :placeholder="t('placeholder')"
          :aria-label="t('search')"
          class="h-11! w-full rounded-xl! pe-11! [&::-webkit-search-cancel-button]:hidden"
        />
      </IconField>
      <IconButton
        v-if="model"
        icon="PhX"
        icon-class="size-4"
        :label="t('clear')"
        data-testid="chat-search-clear"
        size="small"
        class="absolute! end-1 top-1/2 size-9! -translate-y-1/2"
        @click="clear"
      />
    </div>
  </div>
</template>
