import { ChatHandlers, Contact, StateKeys, UserRoleKey } from "~/types";
import { defineStore } from "pinia";
import { shallowReadonly } from "vue";

const FILTERS: StateKeys[] = ["", "online", "ended", "active"];

interface ListState {
  /** Contact ids in the order the server returned them. */
  ids: string[];
  loading: boolean;
  /** A page-1 load (first load, search, filter), as opposed to loading more. */
  refreshing: boolean;
  page: number;
  hasNextPage: boolean;
}

/** One conversation list as `conversationStates` exposes it. */
export interface ConversationListView {
  /** Read-only: add contacts with `addContact`, change them with `updateContact`. */
  data: readonly Contact[];
  loading: boolean;
  refreshing?: boolean;
  page: number;
  hasNextPage: boolean;
}

const byLastMessage = (a: Contact, b: Contact) =>
  (b.lastMessage ? new Date(b.lastMessage.date).getTime() : 0) -
  (a.lastMessage ? new Date(a.lastMessage.date).getTime() : 0);

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

  const chatsPerPage = computed(() => {
    const h = windowHeight.value || 800;
    return Math.floor((h - 138) / 76) + 1;
  });

  /** @deprecated Host-specific; kept for compatibility. */
  const chosenRole = ref<UserRoleKey>("user");
  /** @deprecated Host-specific; kept for compatibility. */
  const currentUserBirthDate = ref<Date | null>(null);
  const activeConversationId = ref<string | null>(null);
  const profileViewOpen = ref(false);
  const typingByConversation = ref<Record<string, string | null>>({});

  // --- Normalised conversations: each contact stored once, lists hold ids ---
  const contactsById = ref<Record<string, Contact>>({});
  const emptyList = (): ListState => ({
    ids: [],
    loading: false,
    refreshing: false,
    page: 0,
    hasNextPage: true,
  });
  const lists = ref<Record<StateKeys, ListState>>({
    "": emptyList(),
    online: emptyList(),
    ended: emptyList(),
    active: emptyList(),
  });

  const contactsOf = (list: ListState) =>
    list.ids.map((id) => contactsById.value[id]).filter((c): c is Contact => !!c);

  /**
   * Each list with its contacts resolved; the shape hosts already read. The lists are read-only
   * (writing to them warns in development), since they are rebuilt from `contactsById`.
   */
  const conversationStates = computed(
    () =>
      Object.fromEntries(
        FILTERS.map((key) => {
          const list = lists.value[key];
          return [
            key,
            {
              data: shallowReadonly(contactsOf(list)),
              loading: list.loading,
              refreshing: list.refreshing,
              page: list.page,
              hasNextPage: list.hasNextPage,
            },
          ];
        }),
      ) as Record<StateKeys, ConversationListView>,
  );

  /** Each list sorted newest-first, recomputed only when its contacts change. */
  const displayedContacts = computed(
    () =>
      Object.fromEntries(
        FILTERS.map((key) => [key, [...conversationStates.value[key].data].sort(byLastMessage)]),
      ) as Record<StateKeys, Contact[]>,
  );

  const getDisplayedContacts = (filter: StateKeys): Contact[] =>
    displayedContacts.value[filter];

  const getContactById = (id: string): Contact | null =>
    contactsById.value[id] ?? null;

  /**
   * Adds a contact the lists haven't fetched (e.g. a conversation opened from a link) to the top
   * of a list, or refreshes it if it is already known.
   */
  const addContact = (contact: Contact, filter: StateKeys = "") => {
    contactsById.value[contact.id] = contact;
    const list = lists.value[filter];
    if (!list.ids.includes(contact.id)) list.ids.unshift(contact.id);
  };

  /** Changes a contact everywhere it is listed. */
  const updateContact = (id: string, updates: Partial<Contact>) => {
    const contact = contactsById.value[id];
    if (contact) Object.assign(contact, updates);
  };

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

  const queued: Partial<Record<StateKeys, string>> = {};

  const fetchConversations = async (
    filterState: StateKeys = "",
    page = 1,
    search = "",
  ) => {
    const list = lists.value[filterState];

    if (list.loading) {
      // A new search or filter must not be dropped because a load is in flight; run the
      // latest one when it finishes. Loading more while busy is safely ignored.
      if (page === 1) queued[filterState] = search;
      return;
    }
    list.loading = true;
    list.refreshing = page === 1;
    try {
      const result = await handlers.fetchConversations({
        pageSize: chatsPerPage.value,
        state: filterState,
        search,
        page,
      });

      // The newest copy of a contact wins, whichever list it came in with.
      for (const contact of result.data) contactsById.value[contact.id] = contact;
      const ids = result.data.map((c) => c.id);
      list.ids = page === 1 ? ids : [...list.ids, ...ids.filter((id) => !list.ids.includes(id))];
      list.page = page;
      list.hasNextPage = result.hasNextPage;
    } finally {
      list.loading = false;
      list.refreshing = false;
      const next = queued[filterState];
      if (next !== undefined) {
        delete queued[filterState];
        void fetchConversations(filterState, 1, next);
      }
    }
  };

  const loadNextPage = async (filter: StateKeys) => {
    const list = lists.value[filter];
    if (list.hasNextPage && !list.loading) {
      await fetchConversations(filter, list.page + 1);
    }
  };

  const endConversation = async (id: string) => {
    if (!handlers.endConversation) return;
    await handlers.endConversation(id);
    updateContact(id, { isActive: false });
  };

  const deleteConversation = async (id: string) => {
    const contact = contactsById.value[id];
    // Where it was listed, to put it back if the server refuses.
    const positions = FILTERS.map((key) => [key, lists.value[key].ids.indexOf(id)] as const)
      .filter(([, index]) => index !== -1);

    for (const [key] of positions)
      lists.value[key].ids = lists.value[key].ids.filter((x) => x !== id);
    delete contactsById.value[id];

    const wasActive = activeConversationId.value === id;
    if (wasActive) {
      activeConversationId.value = null;
      profileViewOpen.value = false;
    }
    delete typingByConversation.value[id];

    try {
      await handlers.deleteConversation(id);
    } catch (error) {
      if (contact) contactsById.value[id] = contact;
      for (const [key, index] of positions) lists.value[key].ids.splice(index, 0, id);
      if (wasActive) activeConversationId.value = id;
      throw error;
    }
  };

  const unreadCount = computed(
    () =>
      Object.values(contactsById.value).filter(
        (c) => c.lastMessage && c.lastMessage.isRead === false,
      ).length,
  );

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
    updateContact,
    addContact,
    calls,
  };
});
