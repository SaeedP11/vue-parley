<script setup lang="ts">
import vLoading from "~/directives/loading";
import profileBackground from "~/assets/lib-images/chat/profile-background.webp";
import { useProfileStore } from "~/stores/profileStore.js";
import ContactAvatar from "./contact/ContactAvatar.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { useChatStore } from "~/stores/chatStore.js";
import { useCallStore } from "~/stores/callStore.js";
import { chatProfileOverview } from "@i18n/locales";
import FileDisplay from "./profile/FileDisplay.vue";
import { useDate } from "~/composables/useDate.js";
import { ref, computed, watch } from "vue";
import type { Contact } from "~/types";

interface Action {
  title: string;
  icon: string;
  key: "end" | "voice-call" | "video-call";
  active: boolean | null;
  color?: string;
}

const props = withDefaults(
  defineProps<{
    profile?: Contact | null;
  }>(),
  {
    profile: null,
  },
);

const { getYearsPassed } = useDate();
const callStore = useCallStore();
const chatStore = useChatStore();
const profileStore = useProfileStore();
const { t } = useLocalI18n(chatProfileOverview);
// FIX: Renamed from `imageList` to `imagesSection` to actually match the template ref="imagesSection"
const imagesSection = ref<HTMLElement | null>(null);

const conversationId = computed(() => chatStore.activeConversationId ?? "");
const isOpen = ref(false);
const localProfile = ref<Contact>();
const currentTab = ref(0);

const mediaAttachements = computed<string[]>(
  () =>
    (conversationId.value && profileStore.mediaMap[conversationId.value]) ?? [],
);
const fileAttachements = computed<string[]>(
  () =>
    (conversationId.value && profileStore.filesMap[conversationId.value]) ?? [],
);
const isLoadingMedia = computed(() => profileStore.mediaLoading);
const isLoadingAttachements = computed(() => profileStore.filesLoading);
const hasMediaNextPage = computed(
  () =>
    (conversationId.value &&
      profileStore.mediaHasNextPage[conversationId.value]) ??
    false,
);
const hasFileNextPage = computed(
  () =>
    (conversationId.value &&
      profileStore.filesHasNextPage[conversationId.value]) ??
    false,
);

const role = computed(() => chatStore.chosenRole);
const isInCall = computed(() => callStore.isActive);

const listHeight = computed(() => {
  if (!imagesSection.value) return 12;
  return imagesSection.value.clientHeight;
});

const maxImageCounts = computed(() =>
  Math.max(Math.floor(listHeight.value / 62) * 4, 12),
);
const imagesPerPage = computed(() => maxImageCounts.value * 4);
const filesPerPage = computed(() => maxImageCounts.value);
const maxFileCounts = ref(2);

const tabs = computed(() => [t("info.media"), t("info.files")]);

const shouldShowTabs = computed(
  () =>
    fileAttachements.value.length > maxFileCounts.value ||
    mediaAttachements.value.length > maxImageCounts.value,
);

const isLoading = computed(() => props.profile === null);
const showPersonalInfo = computed(() => role.value !== "user");

const actionButtons = computed<Action[]>(() => [
  {
    title: t("options.end"),
    icon: "PhX",
    active: localProfile.value ? localProfile.value.isActive : false,
    key: "end",
    color: "error",
  },
  {
    title: t("options.voiceCall"),
    icon: "PhPhoneCall",
    active: localProfile.value
      ? localProfile.value.isActive &&
        localProfile.value.serviceType !== "chat" &&
        !isInCall.value
      : false,
    key: "voice-call",
  },
  {
    title: t("options.videoCall"),
    icon: "PhVideoCamera",
    active: localProfile.value
      ? localProfile.value.isActive &&
        localProfile.value.serviceType === "video-call" &&
        !isInCall.value
      : false,
    key: "video-call",
  },
]);

const chunkedMedia = computed(() => {
  const rows = [];
  for (let i = 0; i < mediaAttachements.value.length; i += 4) {
    rows.push(mediaAttachements.value.slice(i, i + 4));
  }
  return rows;
});

const displayedInfo = computed(() => {
  const items = [
    {
      title: t("info.nationalCode"),
      value: localProfile.value?.nationalCode,
      canDisplay: showPersonalInfo.value,
    },
    {
      title: t("info.phoneNumber"),
      value: localProfile.value?.phoneNumber,
      canDisplay: showPersonalInfo.value,
    },
    {
      title: t("info.age"),
      value: getYearsPassed(localProfile.value?.birthDate || new Date()),
      canDisplay: true,
    },
  ];
  return items.filter((item) => item.canDisplay);
});

// --- Watchers ---
watch(
  () => chatStore.profileViewOpen,
  (isProfileOpen) => {
    if (isProfileOpen) {
      if (props.profile) {
        localProfile.value = props.profile;
      }
      isOpen.value = true;
      const id = conversationId.value;
      if (id) {
        profileStore.fetchMedia(id, 1, imagesPerPage.value);
        profileStore.fetchFiles(id, 1, filesPerPage.value);
      }
    } else {
      isOpen.value = false;
    }
  },
  { immediate: true },
);

watch(
  () => props.profile,
  (newVal) => {
    if (newVal) {
      localProfile.value = newVal;
    }
  },
);

watch(
  () => conversationId.value,
  (newId, oldId) => {
    if (!newId || newId === oldId || !isOpen.value) return;
    profileStore.fetchMedia(newId, 1, imagesPerPage.value);
    profileStore.fetchFiles(newId, 1, filesPerPage.value);
  },
);

// --- Methods ---
const closeSidebar = () => {
  chatStore.closeProfile();
};

const handleAction = (action: Action) => {
  if (!action.active) return;
  switch (action.key) {
    case "end":
      break;
    case "voice-call":
    case "video-call":
      if (chatStore.activeConversationId && props.profile) {
        callStore.startCall(chatStore.activeConversationId);
      }
      break;
  }
};

const fetchMoreMedia = async () => {
  const id = conversationId.value;
  if (!id) return;
  const nextPage = (profileStore.mediaPage[id] ?? 0) + 1;
  await profileStore.fetchMedia(id, nextPage, imagesPerPage.value);
};

const fetchMoreFiles = async () => {
  const id = conversationId.value;
  if (!id) return;
  const nextPage = (profileStore.filesPage[id] ?? 0) + 1;
  await profileStore.fetchFiles(id, nextPage, filesPerPage.value);
};
</script>

<template>
  <div
    class="h-full shrink-0 overflow-hidden bg-chat-background transition-none md:transition-all md:duration-300 md:ease-in-out ltr:border-r-chat-surface rtl:border-l-chat-surface ltr:border-r rtl:border-l"
    :class="[isOpen ? 'w-dvw md:w-80' : 'w-0 border-none!']"
  >
    <div class="flex h-full w-full flex-col">
      <div class="flex h-full w-full flex-col md:px-2 md:pt-16.5">
        <div class="relative w-full shrink-0">
          <div class="h-29 w-full">
            <BImage
              :src="profileBackground"
              class="h-full w-full min-h-full min-w-full max-h-full max-w-full overflow-hidden md:rounded-xl"
            >
              <div class="h-full w-full p-2">
                <BIcon
                  icon="PhX"
                  class="h-5 w-5 cursor-pointer fill-white"
                  @click="closeSidebar"
                />
              </div>
            </BImage>
          </div>
          <div
            class="flex w-full -translate-y-1/2 items-center justify-center absolute z-20"
          >
            <div class="h-25 w-25 overflow-hidden rounded-full">
              <ContactAvatar v-if="profile" :contact="profile" />
            </div>
          </div>
          <div class="h-12.5 w-full" />
        </div>

        <div
          class="flex w-full shrink-0 flex-col items-center justify-center gap-y-2 select-none mt-2"
        >
          <div
            v-loading="isLoading"
            class="text-title-md text-chat-on-background"
          >
            {{ localProfile?.name }}
          </div>
          <BLabel
            v-if="localProfile?.isOnline"
            v-loading="isLoading"
            color="primary"
            :text="t('online')"
          />
        </div>

        <div class="w-full shrink-0 px-6">
          <div class="flex w-full items-center justify-center gap-x-2 py-4">
            <div
              v-for="action in actionButtons"
              :key="action.key"
              v-loading="isLoading"
              class="flex aspect-square w-15.5 flex-col items-center justify-center gap-y-0.5 rounded-xl bg-chat-surface transition-all duration-200 ease-in-out"
              :class="[
                action.active
                  ? 'cursor-pointer opacity-100'
                  : 'cursor-not-allowed opacity-50',
              ]"
              @click="handleAction(action)"
            >
              <BIcon
                :icon="action.icon"
                weight="fill"
                class="h-6 w-6"
                :class="[
                  action.color === 'error'
                    ? 'fill-chat-error'
                    : 'fill-chat-primary',
                ]"
              />
              <div
                class="select-none text-center text-[10px] text-chat-on-background"
              >
                {{ action.title }}
              </div>
            </div>
          </div>

          <div class="w-full">
            <div class="h-0.5 w-full rounded-full bg-chat-surface" />
          </div>

          <div class="flex w-full flex-col gap-y-4 py-4">
            <div
              v-for="(info, index) in displayedInfo"
              :key="index"
              class="flex w-full flex-col select-none gap-y-1"
            >
              <div
                v-loading="isLoading"
                class="text-body-sm text-chat-on-background/50"
              >
                {{ info.title }}
              </div>
              <div
                v-loading="isLoading"
                class="text-body-md text-chat-on-background"
              >
                {{ info.value }}
              </div>
            </div>
          </div>
        </div>

        <div class="flex min-h-0 w-full flex-1 flex-col select-none">
          <div
            v-if="!shouldShowTabs"
            class="flex h-full w-full min-h-0 flex-col gap-y-1"
          >
            <div
              v-if="fileAttachements.length > 0"
              class="flex w-full shrink-0 flex-col gap-y-1"
            >
              <div class="text-body-sm text-chat-on-background/50">
                {{ t("info.files") }}
              </div>
              <FileDisplay
                v-for="(file, index) in fileAttachements"
                :key="index"
                :url="file"
                :loading="isLoadingAttachements"
              />
            </div>
            <div
              v-if="mediaAttachements.length > 0"
              class="flex flex-1 flex-col gap-y-1"
            >
              <div class="shrink-0 text-body-sm text-chat-on-background/50">
                {{ t("info.media") }}
              </div>
              <div ref="imagesSection" class="w-full flex-1">
                <div class="grid w-full grid-cols-4 gap-x-4 gap-y-3">
                  <div
                    v-for="(media, index) in mediaAttachements"
                    :key="index"
                    class="aspect-square md:h-14 md:w-14 overflow-hidden rounded-xl"
                  >
                    <BImage
                      :src="media"
                      class="h-full w-full min-h-full min-w-full max-h-full max-w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="flex h-full w-full min-h-0 flex-col gap-y-2">
            <BTab v-model="currentTab" :tabs="tabs" class="shrink-0 min-h-0" />
            <div class="w-full flex-1 min-h-0 overflow-hidden">
              <div
                class="flex h-full w-[200%] min-h-0 transition-all duration-200 ease-in-out"
                :class="[
                  currentTab === 0
                    ? 'translate-x-0'
                    : 'ltr:-translate-x-1/2 rtl:translate-x-1/2',
                ]"
              >
                <div class="h-full w-1/2 min-h-0 px-1">
                  <BVirtualVerticalList
                    :items="chunkedMedia"
                    :loading="isLoadingMedia"
                    :has-next-page="hasMediaNextPage"
                    @load-more="fetchMoreMedia"
                  >
                    <template #item="{ item: row }">
                      <div class="grid w-full grid-cols-4 gap-4 pb-3">
                        <div
                          v-for="(media, idx) in row"
                          :key="idx"
                          class="aspect-square md:h-14 md:w-14 overflow-hidden rounded-xl"
                        >
                          <BImage
                            :src="media"
                            class="h-full w-full min-h-full min-w-full max-h-full max-w-full"
                          />
                        </div>
                      </div>
                    </template>
                  </BVirtualVerticalList>
                </div>

                <div class="h-full w-1/2 min-h-0 px-1">
                  <BVirtualVerticalList
                    :items="fileAttachements"
                    :loading="isLoadingAttachements"
                    :has-next-page="hasFileNextPage"
                    @load-more="fetchMoreFiles"
                  >
                    <template #item="{ item: file }">
                      <div class="pb-2">
                        <FileDisplay
                          :url="file"
                          :loading="
                            isLoadingAttachements &&
                            fileAttachements.length === 0
                          "
                        />
                      </div>
                    </template>
                  </BVirtualVerticalList>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
