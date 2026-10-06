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

export { messageMedia } from "./utils/media";
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

/**
 * Forgets everything the chat loaded for the signed-in user: conversations, threads, drafts,
 * shared media, the downloaded-file cache, and the running call, which is ended. Call it when the
 * user changes (sign-out, switching accounts) while the app keeps running; the stores outlive
 * pages, so the next user would otherwise see the previous one's conversations. The handlers the
 * host registered stay. Call it before the next user's chat mounts: a list loads when it mounts
 * empty.
 */
export async function resetChat(): Promise<void> {
  useCallStore().reset();
  useMessagesStore().reset();
  useProfileStore().reset();
  useChatStore().reset();
  await useMediaStore().clearCache();
}
