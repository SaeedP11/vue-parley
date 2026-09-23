<script setup lang="ts">
import NoChatSelected from "../assets/lib-images/chat/no-chat-selected.webp";
import NoDataDisplay from "./general/NoDataDisplay.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { useChatStore } from "../stores/chatStore";
import ChatList from "./chat/contact/ChatList.vue";
import { useCallStore } from "~/stores/callStore";
import ChatView from "./chat/ChatView.vue";
import { chatPage } from "@i18n/locales";
import Call from "./call/Call.vue";
import { computed, useSlots } from "vue";
import type { Contact } from "~/types";

defineSlots<{
  /** Replaces the "no conversation selected" placeholder. */
  empty?: () => unknown;
  /** Extra actions in the conversation header, beside the call button. */
  "header-actions"?: (props: { contact: Contact | null }) => unknown;
  /** Between the header and the messages. */
  "conversation-top"?: (props: {
    conversationId: string | null;
    contact: Contact | null;
  }) => unknown;
  /** Above the input, only while the conversation is active. */
  "above-input"?: (props: {
    conversationId: string | null;
    contact: Contact | null;
  }) => unknown;
}>();

const slots = useSlots();

const { width } = useWindowSize();
const chatStore = useChatStore();
const callStore = useCallStore();
const { t } = useLocalI18n(chatPage);

const isMobile = computed(() => width.value < 768);
const isInChat = computed(() => chatStore.activeConversationId !== null);

const showContactList = computed(() => {
  if (isMobile.value) return !isInChat.value;
  return true;
});

const showMessagingSection = computed(() => {
  if (isMobile.value) return isInChat.value;
  return true;
});
</script>
<template>
  <div
    class="flex w-full h-full max-h-full overflow-hidden font-chat-family text-chat-base text-chat-on-background bg-chat-background"
  >
    <div v-if="showMessagingSection" class="h-full flex-1 relative">
      <!-- Each is forwarded only when filled, so ChatView's `$slots[...]` checks stay accurate. -->
      <ChatView v-if="isInChat">
        <template v-if="slots['header-actions']" #header-actions="scope">
          <slot name="header-actions" v-bind="scope" />
        </template>
        <template v-if="slots['conversation-top']" #conversation-top="scope">
          <slot name="conversation-top" v-bind="scope" />
        </template>
        <template v-if="slots['above-input']" #above-input="scope">
          <slot name="above-input" v-bind="scope" />
        </template>
      </ChatView>
      <div v-else class="w-full h-full flex items-center justify-center">
        <slot name="empty">
          <NoDataDisplay
            :image-path="NoChatSelected"
            :title="t('noConversationSelected')"
          />
        </slot>
      </div>
    </div>

    <div
      v-if="showContactList"
      class="md:w-80 w-full h-full shrink-0 border-l border-chat-outline-variant"
    >
      <ChatList />
    </div>
  </div>
  <Call v-if="callStore.channelId" />
</template>
