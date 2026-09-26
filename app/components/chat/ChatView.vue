<template>
  <div class="vue-chat h-full w-full bg-chat-surface">
    <div class="flex h-full w-full">
      <ChatProfileOverview :profile="selectedChat" />

      <!-- On phones the open profile takes the whole screen. -->
      <div
        v-show="chatId"
        class="h-full flex-1 flex-col items-center justify-between"
        :class="isProfile ? 'hidden md:flex' : 'flex'"
      >
        <div class="h-16 w-full bg-chat-background md:h-20">
          <ChatPageBar
            :contact="selectedChat"
            :options="medicOptions"
            @open-profile="openProfile"
          >
            <template v-if="$slots['header-actions']" #actions="{ contact }">
              <slot name="header-actions" :contact="contact" />
            </template>
          </ChatPageBar>
        </div>
        <!-- Host content between the header and the messages, e.g. a toolbar for this chat. -->
        <div v-if="$slots['conversation-top']" class="w-full">
          <slot
            name="conversation-top"
            :conversation-id="chatId"
            :contact="selectedChat"
          />
        </div>
        <div class="min-h-0 w-full flex-1 overflow-hidden">
          <!-- Renders nothing without a contact, so no v-show: it can't apply to an empty root. -->
          <ChatMessages
            :contact="selectedChat"
            :options="medicOptions"
          />
          <!-- The open conversation's contact is still being fetched (e.g. a deep link). -->
          <div
            v-if="isResolving"
            class="flex h-full w-full items-center justify-center"
          >
            <ProgressSpinner class="size-12!" stroke-width="4" />
          </div>
        </div>
        <slot
          v-if="selectedChat?.isActive"
          name="above-input"
          :conversation-id="chatId"
          :contact="selectedChat"
        />
        <ChatInput
          v-if="selectedChat?.isActive"
          ref="chatInput"
          :is-active="true"
        />
        <div
          v-else-if="selectedChat"
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
    <Toast :group="TOAST_GROUP" position="bottom-center" class="vue-chat" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, watch } from "vue";
import ProgressSpinner from "primevue/progressspinner";
import Toast from "primevue/toast";
import PermissionPopup from "~/components/chat/chat-input/PermissionPopup.vue";
import ChatProfileOverview from "~/components/chat/ChatProfileOverview.vue";
import type { ChatTextField } from "~/types/components/chat-input";
import type { MenuOption } from "~/types/components/menu-options";
import ChatMessages from "~/components/chat/ChatMessages.vue";
import ChatPageBar from "~/components/chat/ChatPageBar.vue";
import ChatInput from "~/components/chat/ChatInput.vue";
import NoDataDisplay from "~/components/general/NoDataDisplay.vue";
import ChatEnded from "~/assets/lib-images/chat/empty-state.webp";
import { TOAST_GROUP } from "~/composables/useAppToast";
import useLocalI18n from "~/composables/useLocalI18n";
import { useChatStore } from "~/stores/chatStore";
import { chatView } from "@i18n/locales";

const chatStore = useChatStore();
const { t } = useLocalI18n(chatView);
// Template Refs
const chatInput = ref<ChatTextField | null>(null);

const chatId = computed(() => chatStore.activeConversationId);
const isProfile = computed(() => chatStore.profileViewOpen);

const selectedChat = computed(() => {
  if (!chatId.value) return null;
  return chatStore.getContactById(chatId.value);
});

// Until the contact arrives the pane would otherwise read as an ended chat.
const isResolving = computed(() => !!chatId.value && !selectedChat.value);

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
