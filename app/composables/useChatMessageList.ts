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
  const reversedMessages = computed<ExtendedMessage[]>(() => {
    const raw = messages.value;
    const enriched: ExtendedMessage[] = raw.map((msg, idx) => {
      const prev = raw[idx - 1];
      const next = raw[idx + 1];
      const isFirstInDate =
        !prev ||
        new Date(msg.date).toDateString() !==
          new Date(prev.date).toDateString();

      return {
        ...msg,
        prevMessage: prev,
        nextMessage: next,
        isFirstInDate,
        contact: chatStore.getContactById(msg.senderId),
      };
    });
    return enriched.reverse();
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

    const id = chatId.value;
    if (id) {
      messagesStore.messagesMap[id] = [
        ...(messagesStore.messagesMap[id] ?? []),
        ...newMsgs,
      ];
    }

    return hasMyMessage; // Return boolean so component knows whether to scroll down
  };

  const executeDelete = (idsToDelete: string[], onDone: () => void) => {
    setTimeout(() => {
      idsToDelete.forEach((id) => deletingIds.value.add(id));

      setTimeout(() => {
        const id = chatId.value;
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
  let unsubUpdate: () => void;

  const subscribeToBus = (callbacks: {
    onSend: (hasMyMessage: boolean) => void;
    onDelete: (ids: string[]) => void;
  }) => {
    unsubSend = messagesStore.sendBus.on((newMsgs) => {
      const hasMyMessage = addMessages(newMsgs);
      if (hasMyMessage) callbacks.onSend(true);
    });

    unsubDelete = messagesStore.deleteBus.on((ids) => callbacks.onDelete(ids));

    unsubUpdate = messagesStore.updateBus.on(({ id: msgId, updates }) => {
      const convId = chatId.value;
      if (!convId) return;
      const list = messagesStore.messagesMap[convId];
      if (!list) return;
      const index = list.findIndex((m) => m.id === msgId);
      if (index !== -1) {
        messagesStore.messagesMap[convId] = [
          ...list.slice(0, index),
          { ...list[index], ...updates },
          ...list.slice(index + 1),
        ];
      }
    });
  };

  // Auto-unsubscribe when the component scope is destroyed
  onScopeDispose(() => {
    if (unsubSend) unsubSend();
    if (unsubDelete) unsubDelete();
    if (unsubUpdate) unsubUpdate();
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
