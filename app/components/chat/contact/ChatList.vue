<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import SelectButton from "primevue/selectbutton";
import NoData from "~/assets/lib-images/chat/empty-state.webp";
import Button from "primevue/button";
import NoDataDisplay from "~/components/general/NoDataDisplay.vue";
import type { ChatFilter, StateKeys } from "~/types";
import ChatContactDisplay from "./ChatContactDisplay.vue";
import ContactSkeleton from "./ContactSkeleton.vue";
import { useChatStore } from "~/stores/chatStore.js";
import ChatListSearch from "./ChatListSearch.vue";
import useLocalI18n, { useDirection } from "~/composables/useLocalI18n";
import { chatList } from "@i18n/locales";
const { t } = useLocalI18n(chatList);
const { dir } = useDirection();
const chatStore = useChatStore();

const activeFilter = ref<StateKeys>("");
const searchText = ref("");
const listRef = ref<HTMLElement | null>(null);

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

const currentState = computed(
  () => chatStore.conversationStates[activeFilter.value],
);

const chats = computed(() =>
  chatStore.getDisplayedContacts(activeFilter.value),
);

const query = computed(() => searchText.value.trim());

const clearSearch = () => {
  searchText.value = "";
};

const filters = computed<ChatFilter[]>(() => [
  { key: "active", label: t("filters.active") },
  { key: "ended", label: t("filters.ended") },
]);

const setFilter = (type: StateKeys) => {
  if (activeFilter.value === type) return;
  activeFilter.value = type;
};

// Handle Filter Changes
watch(activeFilter, (newFilter) => {
  // 1. Scroll to top
  const scrollEl = listRef.value;
  if (scrollEl) scrollEl.scrollTop = 0;

  // 2. Fetch if the tab is empty or was loaded for another search
  const state = chatStore.conversationStates[newFilter];
  if (state.data.length === 0 || state.search !== query.value) {
    chatStore.fetchConversations(newFilter, 1, query.value);
  }
});

// Handle Search with Debounce
watch(query, (newQuery) => {
  if (searchTimeout) clearTimeout(searchTimeout);

  searchTimeout = setTimeout(() => {
    chatStore.fetchConversations(activeFilter.value, 1, newQuery);

    const scrollEl = listRef.value;
    if (scrollEl) scrollEl.scrollTop = 0;
  }, 500);
});

onMounted(() => {
  if (chatStore.conversationStates[activeFilter.value].data.length === 0) {
    chatStore.fetchConversations(activeFilter.value, 1);
  }
});

// Cleanup timeout to prevent memory leaks or state updates on unmounted components
onBeforeUnmount(() => {
  if (searchTimeout) clearTimeout(searchTimeout);
});
</script>

<template>
  <div
    :dir="dir"
    class="vue-chat flex h-full w-full flex-col overflow-hidden border border-chat-outline-variant bg-chat-background"
  >
    <ChatListSearch v-model="searchText" class="shrink-0" />

    <div class="flex w-full flex-1 flex-col overflow-hidden">
      <div class="flex w-full shrink-0 items-center px-4 pt-3 pb-1">
        <SelectButton
          :model-value="activeFilter || null"
          :options="filters"
          option-label="label"
          option-value="key"
          :aria-label="t('filters.label')"
          class="w-full"
          :pt="{ pcToggleButton: { root: { class: 'flex-1 h-9!' } } }"
          @update:model-value="(key) => setFilter(key ?? '')"
        />
      </div>

      <div
        v-if="currentState.loading || chats.length > 0"
        class="relative w-full flex-1 overflow-hidden px-2.5 pt-2.5"
      >
        <BVirtualVerticalList
          ref="listRef"
          :items="chats"
          :loading="currentState.loading"
          :has-next-page="currentState.hasNextPage"
          scrollbar
          class="h-full w-full"
          @load-more="chatStore.loadNextPage(activeFilter)"
        >
          <template #loader>
            <ContactSkeleton v-for="n in 2" :key="n" />
          </template>
          <template #item="{ item }">
            <ChatContactDisplay
              :contact="item"
              :loading="currentState.loading && (currentState.page === 0 || !!currentState.refreshing)"
            />
          </template>
        </BVirtualVerticalList>
      </div>

      <div
        v-else-if="query"
        role="status"
        data-testid="chat-search-empty"
        class="flex w-full flex-1 flex-col items-center justify-center gap-y-3 px-6 text-center"
      >
        <span class="flex size-14 items-center justify-center rounded-full bg-chat-surface text-chat-muted">
          <BIcon icon="PhMagnifyingGlass" class="size-6.5" />
        </span>
        <p class="m-0 text-label-md text-chat-on-background">
          {{ t("noResults.title", { query }) }}
        </p>
        <p class="m-0 text-body-sm text-chat-muted">{{ t("noResults.hint") }}</p>
        <Button
          :label="t('noResults.clear')"
          severity="secondary"
          variant="text"
          size="small"
          @click="clearSearch"
        />
      </div>

      <div v-else class="flex w-full flex-1 items-center justify-center">
        <NoDataDisplay :image-path="NoData" :title="t('noMessages')" />
      </div>
    </div>
  </div>
</template>
