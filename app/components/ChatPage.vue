<script setup lang="ts">
import NoChatSelected from "../assets/lib-images/chat/empty-state.webp";
import NoDataDisplay from "./general/NoDataDisplay.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { useChatStore } from "../stores/chatStore";
import ChatList from "./chat/contact/ChatList.vue";
import { useCallStore } from "~/stores/callStore";
import ChatView from "./chat/ChatView.vue";
import { chatPage } from "@i18n/locales";
import { computed, defineAsyncComponent, useSlots } from "vue";

// Loaded with the first call, not with the chat.
const Call = defineAsyncComponent(() => import("./call/Call.vue"));
import type { Contact } from "~/types";

const props = withDefaults(
  defineProps<{
    /**
     * Render the call view here. Set to false and mount `<Call />` once near the app root to
     * keep the call on screen while the user navigates away from the chat.
     */
    renderCall?: boolean;
  }>(),
  { renderCall: true },
);

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

const chatStore = useChatStore();
const callStore = useCallStore();
const { t } = useLocalI18n(chatPage);

const isInChat = computed(() => chatStore.activeConversationId !== null);
</script>
<template>
  <div
    class="vue-chat flex w-full h-full max-h-full overflow-hidden font-chat-family text-chat-base text-chat-on-background bg-chat-background"
  >
    <!-- On phones only one pane shows: the list, or the open conversation. -->
    <div
      class="relative h-full flex-1"
      :class="isInChat ? 'block' : 'hidden md:block'"
    >
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
      class="h-full w-full shrink-0 border-l border-chat-outline-variant md:w-80"
      :class="isInChat ? 'hidden md:block' : 'block'"
    >
      <ChatList />
    </div>
  </div>
  <Call v-if="props.renderCall && callStore.session" />
</template>
