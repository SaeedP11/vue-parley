import {
  ExtendedMessage,
  Message,
  MessagesHandlers,
  StateKeys,
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

  const markAsRead = (conversationId: string) => {
    for (const key in chatStore.conversationStates) {
      const contact = chatStore.conversationStates[key as StateKeys].data.find(
        (c) => c.id === conversationId,
      );
      if (contact) {
        contact.unreadCount = 0;
        if (contact.lastMessage) contact.lastMessage.isRead = true;
      }
    }
    // void adapter.chat.markRead(conversationId);
  };

  const updateLastMessage = (conversationId: string, message: Message) => {
    for (const key in chatStore.conversationStates) {
      const state = chatStore.conversationStates[key as StateKeys];
      const contact = state.data.find((c) => c.id === conversationId);
      if (contact) contact.lastMessage = { ...message };
    }
  };

  const patchLastMessage = (
    conversationId: string,
    messageId: string,
    updates: Partial<Message>,
  ) => {
    for (const key in chatStore.conversationStates) {
      const contact = chatStore.conversationStates[key as StateKeys].data.find(
        (c) => c.id === conversationId,
      );
      if (
        contact &&
        contact.lastMessage &&
        contact.lastMessage.id === messageId
      ) {
        contact.lastMessage = { ...contact.lastMessage, ...updates };
      }
    }
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

    await Promise.all(
      tempMessages.map(async (tempMsg) => {
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
          const updates = { id: canonical.id, isSent: true };
          updateBus.emit({ id: tempMsg.id, updates });
          patchLastMessage(tempMsg.conversationId, tempMsg.id, updates);
        } catch {
          uploadProgress.value.delete(tempMsg.id);
          updateBus.emit({ id: tempMsg.id, updates: { isSent: false } });
          patchLastMessage(tempMsg.conversationId, tempMsg.id, {
            isSent: false,
          });
        }
      }),
    );
  };

  const saveEditMessage = async (id: string, text: string) => {
    const conversationId = editingMessage.value?.conversationId;

    updateBus.emit({ id, updates: { text, isSent: false } });
    if (conversationId)
      patchLastMessage(conversationId, id, { text, isSent: false });

    clearActions();

    try {
      await handlers.editMessage(id, text);
      updateBus.emit({
        id,
        updates: { isSent: true, isEdited: true },
      });
      if (conversationId)
        patchLastMessage(conversationId, id, {
          isSent: true,
          isEdited: true,
        });
    } catch {
      updateBus.emit({ id, updates: { isSent: false } });
      if (conversationId)
        patchLastMessage(conversationId, id, { isSent: false });
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
    sendMessage,
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
