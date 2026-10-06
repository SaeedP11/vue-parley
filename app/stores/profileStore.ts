import { ProfileAttachmentsPage, ProfileHandlers } from "~/types";
import { defineStore } from "pinia";

const DEFAULT_PAGE_SIZE = 20;

export const useProfileStore = defineStore("profile-store", () => {
  let handlers: ProfileHandlers;

  function setHandlers(val: ProfileHandlers) {
    handlers = val;
  }

  const userId = ref<string>("");
  const userName = ref<string>("");
  const userAvatar = ref<Blob | undefined>(undefined);
  const mediaMap = ref<Record<string, string[]>>({});
  const filesMap = ref<Record<string, string[]>>({});
  const mediaPage = ref<Record<string, number>>({});
  const filesPage = ref<Record<string, number>>({});
  const mediaHasNextPage = ref<Record<string, boolean>>({});
  const filesHasNextPage = ref<Record<string, boolean>>({});
  const pageSize = ref(DEFAULT_PAGE_SIZE);
  const mediaLoading = ref(false);
  const filesLoading = ref(false);
  /** Bumped by `reset`, so a page started for the previous user is dropped when it lands. */
  let generation = 0;

  const fetchMedia = async (
    conversationId: string,
    page: number = 1,
    size: number = pageSize.value,
  ) => {
    if (mediaLoading.value) return;
    if (page > 1 && !mediaHasNextPage.value[conversationId]) return;
    const started = generation;
    mediaLoading.value = true;
    try {
      const batch: ProfileAttachmentsPage = await handlers.fetchMedia({
        conversationId,
        page,
        pageSize: size,
      });
      if (started !== generation) return;
      const existing = mediaMap.value[conversationId] ?? [];
      mediaMap.value[conversationId] =
        page === 1 ? batch.data : [...existing, ...batch.data];
      mediaPage.value[conversationId] = page;
      mediaHasNextPage.value[conversationId] = batch.hasNextPage;
    } finally {
      if (started === generation) mediaLoading.value = false;
    }
  };

  const fetchFiles = async (
    conversationId: string,
    page: number = 1,
    size: number = pageSize.value,
  ) => {
    if (filesLoading.value) return;
    if (page > 1 && !filesHasNextPage.value[conversationId]) return;
    const started = generation;
    filesLoading.value = true;
    try {
      const batch: ProfileAttachmentsPage = await handlers.fetchFiles({
        conversationId,
        page,
        pageSize: size,
      });
      if (started !== generation) return;
      const existing = filesMap.value[conversationId] ?? [];
      filesMap.value[conversationId] =
        page === 1 ? batch.data : [...existing, ...batch.data];
      filesPage.value[conversationId] = page;
      filesHasNextPage.value[conversationId] = batch.hasNextPage;
    } finally {
      if (started === generation) filesLoading.value = false;
    }
  };

  /**
   * Forgets the signed-in user and every conversation's media and files, for a host whose user
   * changes. The handlers stay. A page still loading for the previous user is dropped.
   */
  const reset = () => {
    generation++;
    userId.value = "";
    userName.value = "";
    userAvatar.value = undefined;
    mediaMap.value = {};
    filesMap.value = {};
    mediaPage.value = {};
    filesPage.value = {};
    mediaHasNextPage.value = {};
    filesHasNextPage.value = {};
    mediaLoading.value = false;
    filesLoading.value = false;
  };

  const clear = (conversationId: string) => {
    delete mediaMap.value[conversationId];
    delete filesMap.value[conversationId];
    delete mediaPage.value[conversationId];
    delete filesPage.value[conversationId];
    delete mediaHasNextPage.value[conversationId];
    delete filesHasNextPage.value[conversationId];
  };

  return {
    reset,
    setHandlers,
    fetchMedia,
    fetchFiles,
    clear,
    mediaMap,
    filesMap,
    mediaPage,
    filesPage,
    mediaHasNextPage,
    userId,
    userName,
    userAvatar,
    filesHasNextPage,
    mediaLoading,
    filesLoading,
    pageSize,
  };
});
