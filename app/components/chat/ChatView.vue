<template>
  <div class="h-full w-full bg-chat-surface">
    <div
      v-show="canShowMessagingSection || isProfile"
      class="flex h-full w-full"
    >
      <ChatProfileOverview :profile="selectedChat" />

      <div
        v-show="chatId && isChatMode"
        class="flex h-full flex-1 flex-col items-center justify-between"
      >
        <div class="h-16 w-full bg-chat-background md:h-20">
          <ChatPageBar
            :contact="selectedChat"
            :options="medicOptions"
            @open-profile="openProfile"
          />
        </div>
        <div class="min-h-0 w-full flex-1 overflow-hidden">
          <ChatMessages
            v-show="selectedChat"
            :contact="selectedChat"
            :options="medicOptions"
          />
        </div>
        <ChatInput
          v-if="selectedChat?.isActive"
          ref="chatInput"
          :is-active="true"
        />
        <div
          v-else
          class="flex w-full items-center justify-center py-6"
        >
          <NoDataDisplay :image-path="ChatEnded" :title="t('chatEnded')" />
        </div>
      </div>

      <div
        v-show="!chatId"
        class="flex h-full w-full items-center justify-center"
      />
    </div>

    <PermissionPopup />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, watch } from "vue";
import PermissionPopup from "~/components/chat/chat-input/PermissionPopup.vue";
import ChatProfileOverview from "~/components/chat/ChatProfileOverview.vue";
import type { ChatTextField } from "~/types/components/chat-input";
import type { MenuOption } from "~/types/components/menu-options";
import ChatMessages from "~/components/chat/ChatMessages.vue";
import ChatPageBar from "~/components/chat/ChatPageBar.vue";
import ChatInput from "~/components/chat/ChatInput.vue";
import NoDataDisplay from "~/components/general/NoDataDisplay.vue";
import ChatEnded from "~/assets/lib-images/chat/no-messages.webp";
import useLocalI18n from "~/composables/useLocalI18n";
import { useChatStore } from "~/stores/chatStore";
import { chatView } from "@i18n/locales";

const chatStore = useChatStore();
const { width } = useWindowSize();
const { t } = useLocalI18n(chatView);
// Template Refs
const chatInput = ref<ChatTextField | null>(null);

const isMobile = computed(() => width.value < 768);

const chatId = computed(() => chatStore.activeConversationId);
const isProfile = computed(() => chatStore.profileViewOpen);

const selectedChat = computed(() => {
  if (!chatId.value) return null;
  return chatStore.getContactById(chatId.value);
});

const canShowMessagingSection = computed(() => {
  if (isMobile.value) return !isProfile.value;
  return true;
});

const isChatMode = computed(() => {
  if (isMobile.value) return !isProfile.value;
  return canShowMessagingSection.value;
});

const medicOptions = computed<MenuOption[]>(() =>
  chatStore.canEndConversation && selectedChat.value?.isActive
    ? [
        {
          label: t("barOptions.endChat"),
          icon: "PhXSquare",
          key: "end-chat",
        },
      ]
    : [],
);

const openProfile = () => {
  chatStore.openProfile();
};

watch(
  () => chatStore.activeConversationId,
  () => {
    if (chatId.value && selectedChat.value?.isActive) {
      nextTick(() => {
        chatInput.value?.focus();
      });
    }
  },
);
</script>
