import { ref, computed, onScopeDispose, type ComputedRef } from "vue";
import type { Message, ExtendedMessage } from "~/types";
import { useMessagesStore } from "~/stores/messageStores";
import { useChatStore } from "~/stores/chatStore";
import { useProfileStore } from "~/stores/profileStore";

export function useChatMessageList(chatId: ComputedRef<string | null>) {
  const messagesStore = useMessagesStore();
  const chatStore = useChatStore();

  const profileStore = useProfileStore();
  const currentUserId = computed(() => profileStore.userId);

  const messages = computed<Message[]>(
    () => messagesStore.messagesMap[chatId.value ?? ""] ?? [],
  );
  const isLoading = computed(
    () => !!messagesStore.messagesLoadingMap[chatId.value ?? ""],
  );

  // --- Enrichment ---
  // Any change to a thread (a new message, an id swap, a read flag) re-runs this computed. Handing
  // back the previous enriched object whenever its inputs are unchanged keeps every other bubble's
  // `message` prop identical, so only the bubbles that actually changed re-render.
  const enrichedCache = new WeakMap<Message, ExtendedMessage>();

  const reversedMessages = computed<ExtendedMessage[]>(() => {
    const raw = messages.value;
    // Contacts are keyed by conversation, and in a 1:1 chat that contact is the counterpart.
    const contact = chatStore.getContactById(chatId.value ?? "");
    const enriched = new Array<ExtendedMessage>(raw.length);

    for (let idx = 0; idx < raw.length; idx++) {
      const msg = raw[idx]!;
      const prev = raw[idx - 1];
      const next = raw[idx + 1];

      const cached = enrichedCache.get(msg);
      if (
        cached &&
        cached.prevMessage === prev &&
        cached.nextMessage === next &&
        cached.contact === contact
      ) {
        enriched[raw.length - 1 - idx] = cached;
        continue;
      }

      const isFirstInDate =
        !prev ||
        new Date(msg.date).toDateString() !==
          new Date(prev.date).toDateString();

      const value: ExtendedMessage = {
        ...msg,
        prevMessage: prev,
        nextMessage: next,
        isFirstInDate,
        contact,
      };
      enrichedCache.set(msg, value);
      enriched[raw.length - 1 - idx] = value;
    }
    return enriched;
  });

  const firstUnreadId = computed(() => {
    const unreadMsg = messages.value.find(
      (m) => !m.isRead && m.senderId !== currentUserId.value,
    );
    return unreadMsg ? unreadMsg.id : null;
  });

  // --- Fetching ---
  const fetchMessages = async (page: number) => {
    const id = chatId.value;
    if (!id || messagesStore.messagesLoadingMap[id]) return;
    if (page > 1 && !messagesStore.messagesHasNextPage[id]) return;
    await messagesStore.fetchMessages(id, page);
  };

  const loadNextPage = () => {
    const id = chatId.value;
    if (!id) return;
    const nextPage = (messagesStore.messagesPage[id] ?? 0) + 1;
    fetchMessages(nextPage);
  };

  // --- Animations & Mutations ---
  const animatingIds = ref<Set<string>>(new Set());
  const deletingIds = ref<Set<string>>(new Set());

  const addMessages = (newMsgs: Message[]) => {
    if (!newMsgs || newMsgs.length === 0) return;
    const hasMyMessage = newMsgs.some(
      (msg) => msg.senderId === currentUserId.value,
    );

    newMsgs.forEach((msg) => animatingIds.value.add(msg.id));
    setTimeout(() => {
      newMsgs.forEach((msg) => animatingIds.value.delete(msg.id));
    }, 400);

    // Each message goes to its own conversation, not whichever one is open.
    for (const msg of newMsgs) {
      const id = msg.conversationId;
      messagesStore.messagesMap[id] = [
        ...(messagesStore.messagesMap[id] ?? []),
        msg,
      ];
    }

    return hasMyMessage; // Return boolean so component knows whether to scroll down
  };

  const executeDelete = (idsToDelete: string[], onDone: () => void) => {
    // Captured now: the user may switch conversation during the animation.
    const id = chatId.value;
    setTimeout(() => {
      idsToDelete.forEach((id) => deletingIds.value.add(id));

      setTimeout(() => {
        idsToDelete.forEach((id) => deletingIds.value.delete(id));
        if (id) {
          const remainingMessages = (
            messagesStore.messagesMap[id] ?? []
          ).filter((m) => !idsToDelete.includes(m.id));
          messagesStore.messagesMap[id] = remainingMessages;

          const newLastMessage =
            remainingMessages.length > 0
              ? remainingMessages[remainingMessages.length - 1]
              : null;

          if (newLastMessage) {
            messagesStore.updateLastMessage(id, newLastMessage);
          } else {
            messagesStore.patchLastMessage(id, "-1", {
              text: "",
              date: new Date().toISOString(),
            } as unknown as Message);
          }
        }
        messagesStore.clearActions();
        onDone();
      }, 300);
    }, 300);
  };

  // --- Event Bus Subscriptions ---
  let unsubSend: () => void;
  let unsubDelete: () => void;

  const subscribeToBus = (callbacks: {
    onSend: (hasMyMessage: boolean) => void;
    onDelete: (ids: string[]) => void;
  }) => {
    unsubSend = messagesStore.sendBus.on((newMsgs) => {
      const hasMyMessage = addMessages(newMsgs);
      if (hasMyMessage) callbacks.onSend(true);
    });

    unsubDelete = messagesStore.deleteBus.on((ids) => callbacks.onDelete(ids));
    // Updates are applied by the store itself (`patchMessage`), keyed by conversation.
  };

  // Auto-unsubscribe when the component scope is destroyed
  onScopeDispose(() => {
    if (unsubSend) unsubSend();
    if (unsubDelete) unsubDelete();
  });

  return {
    messages,
    reversedMessages,
    firstUnreadId,
    isLoading,
    animatingIds,
    deletingIds,
    fetchMessages,
    loadNextPage,
    subscribeToBus,
    executeDelete,
  };
}
