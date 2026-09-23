import { ChatHandlers, Contact, StateKeys, UserRoleKey } from "~/types";
import { defineStore } from "pinia";

export const useChatStore = defineStore("chat", () => {
  const { height: windowHeight } = useWindowSize();
  let handlers: ChatHandlers;
  const calls = ref<
    { channel: string; name: string; avatar?: string; from: string }[]
  >([]);

  // `handlers` is not reactive, so the UI reads this flag instead.
  const canEndConversation = ref(false);

  function setHandlers(val: ChatHandlers) {
    handlers = val;
    canEndConversation.value = !!val.endConversation;
  }

  const endConversation = async (id: string) => {
    if (!handlers.endConversation) return;
    await handlers.endConversation(id);

    for (const key in conversationStates.value) {
      const contact = conversationStates.value[key as StateKeys].data.find(
        (c) => c.id === id,
      );
      if (contact) contact.isActive = false;
    }
  };

  const chatsPerPage = computed(() => {
    const h = windowHeight.value || 800;
    return Math.floor((h - 138) / 76) + 1;
  });

  const chosenRole = ref<UserRoleKey>("user");
  const currentUserBirthDate = ref<Date | null>(
    new Date("1999-11-25T00:00:00Z"),
  );
  const activeConversationId = ref<string | null>(null);
  const profileViewOpen = ref(false);
  const typingByConversation = ref<Record<string, string | null>>({});

  const conversationStates = ref<
    Record<
      StateKeys,
      {
        data: Contact[];
        loading: boolean;
        page: number;
        hasNextPage: boolean;
      }
    >
  >({
    "": { data: [], loading: false, page: 0, hasNextPage: true },
    online: { data: [], loading: false, page: 0, hasNextPage: true },
    ended: { data: [], loading: false, page: 0, hasNextPage: true },
    active: { data: [], loading: false, page: 0, hasNextPage: true },
  });

  const setSelectedChat = (id: string | null) => {
    activeConversationId.value = id;
    profileViewOpen.value = false;
  };

  const openProfile = () => {
    profileViewOpen.value = true;
  };

  const closeProfile = () => {
    profileViewOpen.value = false;
  };

  const fetchConversations = async (
    filterState: StateKeys = "",
    page = 1,
    search = "",
  ) => {
    const conversations = conversationStates.value[filterState];

    if (conversations.loading) return;
    conversations.loading = true;
    try {
      const result = await handlers.fetchConversations({
        pageSize: chatsPerPage.value,
        state: filterState,
        search,
        page,
      });

      conversations.data =
        page === 1 ? result.data : [...conversations.data, ...result.data];
      conversations.page = page;
      conversations.hasNextPage = result.hasNextPage;
    } finally {
      conversations.loading = false;
    }
  };

  const getDisplayedContacts = (filter: StateKeys): Contact[] => {
    const state = conversationStates.value[filter];

    return [...state.data].sort((a, b) => {
      const dateA = a.lastMessage ? new Date(a.lastMessage.date).getTime() : 0;
      const dateB = b.lastMessage ? new Date(b.lastMessage.date).getTime() : 0;
      return dateB - dateA;
    });
  };

  const loadNextPage = async (filter: StateKeys) => {
    const state = conversationStates.value[filter];
    if (state.hasNextPage && !state.loading) {
      await fetchConversations(filter, state.page + 1);
    }
  };

  const getContactById = (id: string): Contact | null => {
    for (const key in conversationStates.value) {
      const contact = conversationStates.value[key as StateKeys].data.find(
        (c) => c.id === id,
      );
      if (contact) return contact;
    }
    return null;
  };

  const removeContactFromStates = (id: string) => {
    for (const key in conversationStates.value) {
      const state = conversationStates.value[key as StateKeys];
      const index = state.data.findIndex((c) => c.id === id);
      if (index !== -1) {
        state.data.splice(index, 1);
      }
    }
  };

  const restoreContactToState = (contact: Contact, stateKey: StateKeys) => {
    const state = conversationStates.value[stateKey];
    const exists = state.data.some((c) => c.id === contact.id);
    if (!exists) {
      state.data.push(contact);
    }
  };

  const deleteConversation = async (id: string) => {
    const backup = new Map<StateKeys, Contact | undefined>();
    for (const key in conversationStates.value) {
      const stateKey = key as StateKeys;
      const contact = conversationStates.value[stateKey].data.find(
        (c) => c.id === id,
      );
      if (contact) {
        backup.set(stateKey, { ...contact });
      }
    }

    removeContactFromStates(id);

    const wasActive = activeConversationId.value === id;
    if (wasActive) {
      activeConversationId.value = null;
      profileViewOpen.value = false;
    }

    delete typingByConversation.value[id];

    try {
      await handlers.deleteConversation(id);
    } catch (error) {
      backup.forEach((contact, stateKey) => {
        if (contact) {
          restoreContactToState(contact, stateKey);
        }
      });

      if (wasActive) {
        activeConversationId.value = id;
      }

      throw error;
    }
  };

  const unreadCount = computed(() => {
    const uniqueContacts = new Map<string, Contact>();
    for (const key in conversationStates.value) {
      const state = conversationStates.value[key as StateKeys];
      state.data.forEach((c) => {
        if (!uniqueContacts.has(c.id)) uniqueContacts.set(c.id, c);
      });
    }
    return Array.from(uniqueContacts.values()).filter(
      (c) => c.lastMessage && c.lastMessage.isRead === false,
    ).length;
  });

  return {
    chosenRole,
    currentUserBirthDate,
    conversationStates,
    activeConversationId,
    profileViewOpen,
    typingByConversation,
    chatsPerPage,
    unreadCount,
    setHandlers,
    setSelectedChat,
    openProfile,
    closeProfile,
    deleteConversation,
    canEndConversation,
    endConversation,
    fetchConversations,
    loadNextPage,
    getContactById,
    getDisplayedContacts,
    calls,
  };
});
