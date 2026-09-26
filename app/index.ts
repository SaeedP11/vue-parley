import "./assets/css/main.css";
import { defineAsyncComponent } from "vue";
import { useCallStore } from "./stores/callStore";
import { useChatStore } from "./stores/chatStore";
import { useMessagesStore } from "./stores/messageStores";
import { useMediaStore } from "./stores/mediaStore";
import { useProfileStore } from "./stores/profileStore";

export { default as ChatPage } from "./components/ChatPage.vue";
// Async, so hosts that never call don't download it. Render it while `callStore.session` is set.
export const Call = defineAsyncComponent(() => import("./components/call/Call.vue"));

// Building blocks, for hosts that compose their own layout instead of <ChatPage />. They read
// the same stores, so they work together as long as the handlers are registered.
export { default as ChatList } from "./components/chat/contact/ChatList.vue";
export { default as ChatConversation } from "./components/chat/ChatView.vue";
export { default as ChatHeader } from "./components/chat/ChatPageBar.vue";
export { default as ChatMessages } from "./components/chat/ChatMessages.vue";
export { default as ChatInput } from "./components/chat/ChatInput.vue";
export { default as ChatBubble } from "./components/chat/ChatBubble.vue";

export { default as BVirtualVerticalList } from "./components/global/BVirtualVerticalList.vue";
export { default as BEmojiPicker } from "./components/global/BEmojiPicker.vue";
export { default as BIcon } from "./components/global/BIcon.vue";

export * from "./types";
export * from "./stores/messageStores";
export * from "./stores/chatStore";
export * from "./stores/mediaStore";
export * from "./stores/profileStore";

export { provideCallHandlers } from "./provider/callProvider";
export { createChat } from "./plugin";
export type { ChatOptions, ChatUser } from "./plugin";

export {
  useChatStore,
  useCallStore,
  useMessagesStore,
  useMediaStore,
  useProfileStore,
};
