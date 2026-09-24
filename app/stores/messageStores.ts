import {
  ExtendedMessage,
  Message,
  MessagesHandlers,
  UploadProgressEvent,
} from "~/types";
import { useAppToast } from "~/composables/useAppToast";
import useLocalI18n from "~/composables/useLocalI18n";
import { useProfileStore } from "./profileStore";
import { useDate } from "~/composables/useDate";
import { useChatStore } from "./chatStore";
import { chat } from "@i18n/locales";
import { defineStore } from "pinia";

export const useMessagesStore = defineStore("messages-store", () => {
  const { t } = useLocalI18n(chat);
  const { openToast } = useAppToast();
  const { formatDateShort, formatTime } = useDate();
  const chatStore = useChatStore();
  const profileStore = useProfileStore();
  const currentUserId = computed(() => profileStore.userId);

  let handlers: MessagesHandlers;

  function setHandlers(val: MessagesHandlers) {
    handlers = val;
  }

  const isOptionMenuOpen = ref(false);
  const isSelectMode = ref(false);
  const selectedMessages = ref<Map<string, ExtendedMessage>>(new Map());
  const uploadProgress = ref<Map<string, UploadProgressEvent>>(new Map());
  const replyingTo = ref<ExtendedMessage | null>(null);

  // Unsent text per conversation, so switching chats never loses what was being typed.
  const drafts = ref<Record<string, string>>({});
  const setDraft = (conversationId: string, text: string) => {
    if (text.trim()) drafts.value[conversationId] = text;
    else delete drafts.value[conversationId];
  };

  const messagesMap = ref<Record<string, Message[]>>({});
  // Per conversation, so a fetch still running for one chat never swallows another's.
  const messagesLoadingMap = ref<Record<string, boolean>>({});
  const messagesLoading = computed(() =>
    Object.values(messagesLoadingMap.value).some(Boolean),
  );
  const messagesPageSize = ref(20);
  const messagesPage = ref<Record<string, number>>({});
  const messagesHasNextPage = ref<Record<string, boolean>>({});

  const selectedArray = computed(() =>
    Array.from(selectedMessages.value.values()),
  );

  const editWindowHours = ref(6);

  const canEdit = computed(() => {
    if (selectedMessages.value.size !== 1) return false;
    const msg = selectedArray.value[0];
    if (!msg) return false;
    const isMine = msg.senderId === currentUserId.value;
    const hoursPassed =
      (Date.now() - new Date(msg.date).getTime()) / (1000 * 60 * 60);
    return isMine && hoursPassed < editWindowHours.value;
  });

  const canDelete = computed(() => {
    if (selectedMessages.value.size === 0) return false;
    return selectedArray.value.every((msg) => {
      const isMine = msg.senderId === currentUserId.value;
      const hoursPassed =
        (Date.now() - new Date(msg.date).getTime()) / (1000 * 60 * 60);
      return isMine && hoursPassed < editWindowHours.value;
    });
  });

  const clearSelection = () => {
    isSelectMode.value = false;
    selectedMessages.value.clear();
  };

  const startSelectMode = (message: ExtendedMessage) => {
    isSelectMode.value = true;
    const newMap = new Map();
    newMap.set(message.id, message);
    selectedMessages.value = newMap;
  };

  const toggleSelection = (message: ExtendedMessage) => {
    const newMap = new Map(selectedMessages.value);
    if (newMap.has(message.id)) {
      newMap.delete(message.id);
      if (newMap.size === 0) isSelectMode.value = false;
    } else {
      newMap.set(message.id, message);
    }
    selectedMessages.value = newMap;
  };

  const triggerEdit = (message: ExtendedMessage) => {
    editingMessage.value = message;
    editBus.emit(message);
  };

  const copyMessageText = () => {
    const textToCopy = selectedArray.value
      .map((msg) => {
        const isMine = msg.senderId === currentUserId.value;
        const senderName = isMine ? t("chat.you") : msg.contact?.name || "User";
        const dateTime = `${formatDateShort(msg.date)}, ${formatTime(msg.date)}`;
        const content =
          msg.text ||
          (msg.imageUrl ? "[Image]" : msg.voiceUrl ? "[Voice]" : "[File]");
        return `${senderName} [${dateTime}]:\n${content}`;
      })
      .join("\n\n");

    navigator.clipboard.writeText(textToCopy).then(() => {
      openToast(t("chat.copiedMessage"), "success");
    });
    clearActions();
  };

  const triggerDelete = async (specificIds?: string[]) => {
    const targets = specificIds?.length
      ? specificIds
      : selectedArray.value.map((m) => m.id);
    if (targets.length === 0) return;

    // Only asks for confirmation; `confirmDelete` runs once the user accepts.
    deleteBus.emit(targets);
    clearActions();
  };

  const confirmDelete = async (targets: string[]) => {
    if (targets.length === 0) return;
    targets.forEach((id) => processingActions.value.set(id, "cancel-request"));

    try {
      await handlers.deleteMessages(targets);
    } finally {
      targets.forEach((id) => processingActions.value.delete(id));
    }
  };

  const processingActions = ref(new Map<string, string>());

  const isActionBusy = (messageId: string, actionKey: string) =>
    processingActions.value.get(messageId) === actionKey;

  const editingMessage = ref<ExtendedMessage | null>(null);

  const deleteBus = useEventBus<string[]>("chat-delete");
  const sendBus = useEventBus<Message[]>("chat-send");
  const editBus = useEventBus<ExtendedMessage>("edit-message");
  const updateBus = useEventBus<{ id: string; updates: Partial<Message> }>(
    "chat-update",
  );

  const canReply = computed(() => selectedMessages.value.size <= 1);

  const clearActions = () => {
    clearSelection();
    replyingTo.value = null;
    editingMessage.value = null;
  };

  const handleRemoteAction = async (
    messageId: string,
    actionKey: string,
    apiCall: () => Promise<void>,
  ) => {
    processingActions.value.set(messageId, actionKey);
    try {
      await apiCall();
    } finally {
      processingActions.value.delete(messageId);
    }
  };

  /**
   * Patches one message in its own conversation. Keyed by the message's conversation rather
   * than the open one, so a send that settles after the user switched chats still lands.
   * When `updates.id` swaps a temp id for one the thread already holds (the realtime event
   * beat the send response), the temp copy is dropped instead of leaving a duplicate.
   */
  const patchMessage = (
    conversationId: string,
    id: string,
    updates: Partial<Message>,
  ) => {
    const list = messagesMap.value[conversationId];
    if (!list) return;
    const index = list.findIndex((m) => m.id === id);
    if (index === -1) return;

    if (updates.id && updates.id !== id && list.some((m) => m.id === updates.id)) {
      messagesMap.value[conversationId] = list.filter((_, i) => i !== index);
      return;
    }

    messagesMap.value[conversationId] = [
      ...list.slice(0, index),
      { ...list[index]!, ...updates },
      ...list.slice(index + 1),
    ];
  };

  /** Puts messages back after a failed delete, in date order. */
  const restoreMessages = (conversationId: string, restored: Message[]) => {
    const list = messagesMap.value[conversationId];
    if (!list || restored.length === 0) return;
    const present = new Set(list.map((m) => m.id));
    const merged = [...list, ...restored.filter((m) => !present.has(m.id))].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    messagesMap.value[conversationId] = merged;
    const last = merged[merged.length - 1];
    if (last) updateLastMessage(conversationId, last);
  };

  const markAsRead = (conversationId: string) => {
    const last = chatStore.getContactById(conversationId)?.lastMessage;
    chatStore.updateContact(conversationId, {
      unreadCount: 0,
      ...(last && { lastMessage: { ...last, isRead: true } }),
    });
    handlers.markRead?.(conversationId).catch((error) =>
      console.error("[chat] failed to mark conversation as read", error),
    );
  };

  const updateLastMessage = (conversationId: string, message: Message) => {
    chatStore.updateContact(conversationId, { lastMessage: { ...message } });
  };

  const patchLastMessage = (
    conversationId: string,
    messageId: string,
    updates: Partial<Message>,
  ) => {
    const last = chatStore.getContactById(conversationId)?.lastMessage;
    if (last?.id === messageId)
      chatStore.updateContact(conversationId, { lastMessage: { ...last, ...updates } });
  };

  const sendMessage = async (messages: Message[]) => {
    const tempMessages = messages.map((m) => ({
      ...m,
      id: `tmp-${crypto.randomUUID()}`,
      isSent: false,
    }));

    sendBus.emit(tempMessages);

    if (tempMessages.length > 0) {
      const latest = tempMessages[tempMessages.length - 1]!;
      updateLastMessage(latest.conversationId, latest);
    }

    await Promise.all(tempMessages.map(deliver));
  };

  const applyUpdate = (
    conversationId: string,
    id: string,
    updates: Partial<Message>,
  ) => {
    patchMessage(conversationId, id, updates);
    patchLastMessage(conversationId, id, updates);
    updateBus.emit({ id, updates });
  };

  const deliver = async (tempMsg: Message) => {
    const { conversationId } = tempMsg;
    const tracksProgress = tempMsg.type !== "text";
    try {
      const canonical = await handlers.sendMessage(tempMsg, {
        onProgress: tracksProgress
          ? (e) => {
              if (e.progress >= 100) {
                uploadProgress.value.delete(tempMsg.id);
              } else {
                uploadProgress.value.set(tempMsg.id, {
                  progress: e.progress,
                  uploaded: e.uploaded,
                  total: e.total,
                });
              }
            }
          : undefined,
      });

      uploadProgress.value.delete(tempMsg.id);
      applyUpdate(conversationId, tempMsg.id, {
        id: canonical.id,
        isSent: true,
        isFailed: false,
      });
    } catch {
      uploadProgress.value.delete(tempMsg.id);
      applyUpdate(conversationId, tempMsg.id, { isSent: false, isFailed: true });
    }
  };

  /** Re-sends a message whose last attempt failed, keeping its place in the thread. */
  const retryMessage = async (message: Message) => {
    // The bubble hands over its enriched copy; send the stored one.
    const stored = messagesMap.value[message.conversationId]?.find(
      (m) => m.id === message.id,
    );
    if (!stored?.isFailed || !stored.id.startsWith("tmp-")) return;
    applyUpdate(stored.conversationId, stored.id, { isFailed: false });
    await deliver({ ...stored, isFailed: false });
  };

  const saveEditMessage = async (id: string, text: string) => {
    const original = editingMessage.value;
    const conversationId = original?.conversationId;
    clearActions();
    if (!conversationId) return;

    applyUpdate(conversationId, id, { text, isSent: false });

    try {
      await handlers.editMessage(id, text);
      applyUpdate(conversationId, id, { isSent: true, isEdited: true });
    } catch {
      // Put the old text back: the edit never reached the server, and an unsent edit has no retry.
      applyUpdate(conversationId, id, { text: original.text, isSent: true });
      openToast(t("chat.editFailed"), "error");
    }
  };

  const fetchMessages = async (
    conversationId: string,
    page: number = 1,
    pageSize: number = messagesPageSize.value,
  ) => {
    if (messagesLoadingMap.value[conversationId]) return;
    messagesLoadingMap.value[conversationId] = true;
    try {
      const batch = await handlers.fetchMessages({
        conversationId,
        page,
        pageSize,
      });

      const existing = messagesMap.value[conversationId] ?? [];
      messagesMap.value[conversationId] =
        page === 1 ? batch : [...batch, ...existing];
      messagesPage.value[conversationId] = page;
      messagesHasNextPage.value[conversationId] = batch.length === pageSize;
    } finally {
      delete messagesLoadingMap.value[conversationId];
    }
  };

  return {
    isOptionMenuOpen,
    isSelectMode,
    selectedMessages,
    replyingTo,
    selectedArray,
    editWindowHours,
    canEdit,
    canDelete,
    clearSelection,
    startSelectMode,
    setHandlers,
    toggleSelection,
    triggerEdit,
    copyMessageText,
    triggerDelete,
    confirmDelete,
    editingMessage,
    canReply,
    deleteBus,
    sendBus,
    updateBus,
    drafts,
    setDraft,
    sendMessage,
    retryMessage,
    patchMessage,
    restoreMessages,
    saveEditMessage,
    fetchMessages,
    markAsRead,
    updateLastMessage,
    patchLastMessage,
    messagesMap,
    messagesLoading,
    messagesLoadingMap,
    messagesPage,
    messagesPageSize,
    messagesHasNextPage,
    clearActions,
    editBus,
    processingActions,
    isActionBusy,
    handleRemoteAction,
    uploadProgress,
  };
});
