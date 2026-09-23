import { onMounted, watch, type Ref } from "vue";
import { useChatStore } from "~/stores/chatStore";
import { useMessagesStore } from "~/stores/messageStores";

interface DraftEditor {
  messageText: Ref<string>;
  setText: (text: string) => void;
}

/**
 * Keeps the input's unsent text per conversation: saved as it is typed, swapped when the open
 * conversation changes, and restored on mount. Text typed while editing a message is not a draft.
 */
export function useInputDraft(editor: DraftEditor, isEditing: () => boolean) {
  const chatStore = useChatStore();
  const messagesStore = useMessagesStore();

  /** Puts the open conversation's draft (or nothing) back into the input. */
  const restoreDraft = () => {
    const id = chatStore.activeConversationId;
    editor.setText((id && messagesStore.drafts[id]) || "");
  };

  watch(editor.messageText, (text) => {
    const id = chatStore.activeConversationId;
    if (id && !isEditing()) messagesStore.setDraft(id, text);
  });

  watch(
    () => chatStore.activeConversationId,
    () => {
      // An edit belongs to the conversation it started in.
      if (isEditing()) messagesStore.clearActions();
      restoreDraft();
    },
  );

  onMounted(() => {
    const id = chatStore.activeConversationId;
    if (id && messagesStore.drafts[id]) restoreDraft();
  });

  return { restoreDraft };
}
