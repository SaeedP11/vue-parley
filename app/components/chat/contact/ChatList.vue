<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import NoData from "~/assets/lib-images/dashboard/no-contacts.webp";
import NoDataDisplay from "~/components/general/NoDataDisplay.vue";
import type { ChatFilter, StateKeys } from "~/types";
import ChatContactDisplay from "./ChatContactDisplay.vue";
import { useChatStore } from "~/stores/chatStore.js";
import ChatListSearch from "./ChatListSearch.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { chatList } from "@i18n/locales";
const { t } = useLocalI18n(chatList);
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

const filters = computed<ChatFilter[]>(() => [
  { key: "active", label: t("filters.active") },
  { key: "ended", label: t("filters.ended") },
]);

const setFilter = (type: StateKeys) => {
  if (activeFilter.value === type) return;
  activeFilter.value = type;
};

const filterProps = (type: StateKeys) => {
  return activeFilter.value === type
    ? { color: "primary" as const, icon: "PhX" }
    : { color: "neutral" as const, icon: "" };
};

// Handle Filter Changes
watch(activeFilter, (newFilter) => {
  // 1. Scroll to top
  const scrollEl = listRef.value;
  if (scrollEl) scrollEl.scrollTop = 0;

  // 2. Fetch if category is empty
  if (chatStore.conversationStates[newFilter].data.length === 0) {
    chatStore.fetchConversations(newFilter, 1);
  }
});

// Handle Search with Debounce
watch(searchText, (newQuery) => {
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
    class="vue-chat flex h-full w-full flex-col overflow-hidden border border-chat-outline-variant bg-chat-background"
  >
    <ChatListSearch v-model="searchText" class="shrink-0" />

    <div class="flex w-full flex-1 flex-col overflow-hidden">
      <div class="flex w-full shrink-0 items-center gap-x-2 px-5 py-2">
        <BLabel
          v-for="filter in filters"
          :key="filter.key"
          size="lg"
          :text="filter.label"
          :icon="filterProps(filter.key).icon"
          :color="filterProps(filter.key).color"
          class="cursor-pointer"
          @click="setFilter(filter.key)"
          @action="setFilter('')"
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
          class="h-full w-full"
          @load-more="chatStore.loadNextPage(activeFilter)"
        >
          <template #item="{ item }">
            <ChatContactDisplay
              :contact="item"
              :loading="currentState.loading && (currentState.page === 0 || !!currentState.refreshing)"
            />
          </template>
        </BVirtualVerticalList>
      </div>

      <div v-else class="flex w-full flex-1 items-center justify-center">
        <NoDataDisplay :image-path="NoData" :title="t('noMessages')" />
      </div>
    </div>
  </div>
</template>
