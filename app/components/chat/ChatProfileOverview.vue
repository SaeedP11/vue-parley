<script setup lang="ts">
/**
 * The contact info panel beside the conversation: who it is, how to reach them, what they shared.
 * A header row lines up with the conversation header; then the person, their call actions, the
 * details the viewer may see, the shared media and files, and ending the conversation, set apart
 * at the foot because it cannot be undone.
 */
import Button from "primevue/button";
import Tab from "primevue/tab";
import TabList from "primevue/tablist";
import Tabs from "primevue/tabs";
import Tag from "primevue/tag";
import vLoading from "~/directives/loading";
import IconButton from "~/components/general/IconButton.vue";
import MediaImage from "~/components/general/MediaImage.vue";
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

const props = withDefaults(
  defineProps<{
    profile?: Contact | null;
  }>(),
  {
    profile: null,
  },
);

const emit = defineEmits<{
  /** Asks to end the conversation; the parent confirms it first. */
  end: [];
}>();

// Enough to fill the panel on a tall screen; more load as the list scrolls.
const MEDIA_PER_PAGE = 48;
const FILES_PER_PAGE = 20;
const MEDIA_COLUMNS = 3;

const { getYearsPassed, formatRelativeDate } = useDate();
const callStore = useCallStore();
const chatStore = useChatStore();
const profileStore = useProfileStore();
const { t } = useLocalI18n(chatProfileOverview);

const conversationId = computed(() => chatStore.activeConversationId ?? "");
const isOpen = ref(false);
const localProfile = ref<Contact>();
const currentTab = ref<"media" | "files">("media");

const mediaAttachements = computed<string[]>(
  () =>
    (conversationId.value && profileStore.mediaMap[conversationId.value]) || [],
);
const fileAttachements = computed<string[]>(
  () =>
    (conversationId.value && profileStore.filesMap[conversationId.value]) || [],
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

const isLoading = computed(() => props.profile === null);
const isInCall = computed(() => callStore.isActive);
const showPersonalInfo = computed(() => chatStore.chosenRole !== "user");

const fullName = computed(() =>
  `${localProfile.value?.name ?? ""} ${localProfile.value?.lastName ?? ""}`.trim(),
);

// The same rule as the conversation header: no calls once ended, none on a chat-only service,
// and both when the host does not say.
const canVoiceCall = computed(
  () => !!localProfile.value?.isActive && localProfile.value.serviceType !== "chat",
);
const canVideoCall = computed(
  () => canVoiceCall.value && localProfile.value?.serviceType !== "voice-call",
);
const canEnd = computed(() => !!localProfile.value?.isActive && chatStore.canEndConversation);

// Hosts without a birth date send the epoch, which would read as an age of fifty-odd.
const age = computed(() => {
  const birthDate = localProfile.value?.birthDate;
  if (!birthDate || new Date(birthDate).getTime() <= 0) return undefined;
  return getYearsPassed(new Date(birthDate));
});

const details = computed(() =>
  [
    {
      key: "age",
      icon: "PhCake",
      label: t("info.age"),
      value: age.value === undefined ? undefined : t("info.years", { count: age.value }),
      show: true,
    },
    {
      key: "nationalCode",
      icon: "PhIdentificationCard",
      label: t("info.nationalCode"),
      value: localProfile.value?.nationalCode,
      show: showPersonalInfo.value,
    },
    {
      key: "phoneNumber",
      icon: "PhPhone",
      label: t("info.phoneNumber"),
      value: localProfile.value?.phoneNumber,
      show: showPersonalInfo.value,
      ltr: true,
    },
    {
      key: "status",
      icon: localProfile.value?.isActive ? "PhChatCircleDots" : "PhLockKey",
      label: t("info.status"),
      value: localProfile.value
        ? localProfile.value.isActive
          ? t("status.active")
          : t("status.ended")
        : undefined,
      show: true,
    },
  ].filter((item) => item.show && item.value !== undefined && item.value !== ""),
);

const mediaRows = computed(() => {
  const rows: string[][] = [];
  for (let i = 0; i < mediaAttachements.value.length; i += MEDIA_COLUMNS) {
    rows.push(mediaAttachements.value.slice(i, i + MEDIA_COLUMNS));
  }
  return rows;
});

const hasShared = computed(
  () => mediaAttachements.value.length > 0 || fileAttachements.value.length > 0,
);
const isLoadingShared = computed(
  () => (isLoadingMedia.value || isLoadingAttachements.value) && !hasShared.value,
);

const fetchShared = (id: string) => {
  profileStore.fetchMedia(id, 1, MEDIA_PER_PAGE);
  profileStore.fetchFiles(id, 1, FILES_PER_PAGE);
};

// --- Watchers ---
watch(
  () => chatStore.profileViewOpen,
  (isProfileOpen) => {
    if (isProfileOpen) {
      if (props.profile) {
        localProfile.value = props.profile;
      }
      isOpen.value = true;
      if (conversationId.value) fetchShared(conversationId.value);
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
    fetchShared(newId);
  },
);

// Open on whichever kind the conversation has: files when it shared no media.
watch([mediaAttachements, fileAttachements], ([media, files]) => {
  if (currentTab.value === "media" && !media.length && files.length) currentTab.value = "files";
});

// --- Methods ---
const closeSidebar = () => {
  chatStore.closeProfile();
};

const startCall = (video: boolean) => {
  if (chatStore.activeConversationId && props.profile) {
    callStore.startCall(chatStore.activeConversationId, { video });
  }
};

const fetchMoreMedia = async () => {
  const id = conversationId.value;
  if (!id) return;
  const nextPage = (profileStore.mediaPage[id] ?? 0) + 1;
  await profileStore.fetchMedia(id, nextPage, MEDIA_PER_PAGE);
};

const fetchMoreFiles = async () => {
  const id = conversationId.value;
  if (!id) return;
  const nextPage = (profileStore.filesPage[id] ?? 0) + 1;
  await profileStore.fetchFiles(id, nextPage, FILES_PER_PAGE);
};
</script>

<template>
  <aside
    class="h-full shrink-0 overflow-hidden bg-chat-background transition-none md:transition-all md:duration-300 md:ease-in-out border-chat-outline-variant ltr:border-r rtl:border-l motion-reduce:transition-none"
    :class="[isOpen ? 'w-dvw md:w-80' : 'w-0 border-none!']"
    :aria-label="t('title')"
    :aria-hidden="!isOpen"
    :inert="!isOpen"
    data-testid="chat-profile"
  >
    <div class="flex h-full w-dvw flex-col md:w-80">
      <!-- Lines up with the conversation header beside it. -->
      <div
        class="flex h-16 shrink-0 items-center justify-between gap-x-2 border-b border-b-chat-outline-variant px-4 md:h-20"
      >
        <h2 class="m-0 truncate text-label-lg text-chat-on-background select-none">
          {{ t("title") }}
        </h2>
        <IconButton
          icon="PhX"
          :label="t('actions.close')"
          data-testid="chat-profile-close"
          @click="closeSidebar"
        />
      </div>

      <div class="flex min-h-0 flex-1 flex-col">
        <div class="flex shrink-0 flex-col items-center gap-y-1.5 px-6 pt-6 pb-4 text-center">
          <span v-loading="isLoading" class="relative mb-1.5 block size-22 overflow-hidden rounded-full">
            <ContactAvatar v-if="profile" :contact="profile" :show-online="false" />
          </span>
          <p
            v-loading="isLoading"
            class="m-0 min-w-24 max-w-full truncate text-title-md text-chat-on-background select-none"
          >
            {{ fullName }}
          </p>
          <p v-if="!isLoading" class="m-0 text-body-sm select-none">
            <span v-if="localProfile?.isOnline" class="font-medium text-chat-primary">
              {{ t("online") }}
            </span>
            <span v-else-if="localProfile?.lastSeen" class="text-chat-muted">
              {{ t("lastSeen", { time: formatRelativeDate(localProfile.lastSeen) }) }}
            </span>
          </p>
          <Tag
            v-if="localProfile?.tag && !isLoading"
            severity="secondary"
            :value="localProfile.tag"
            :pt="{
              root: { class: 'mt-1 rounded-md! px-2! py-0.5! bg-chat-on-background/6! text-chat-muted!' },
              label: { class: 'text-[12px]! font-semibold!' },
            }"
          />
        </div>

        <div
          v-if="canVoiceCall || canVideoCall"
          class="flex shrink-0 items-center justify-center gap-x-2 px-6 pb-4"
        >
          <Button
            v-if="canVoiceCall"
            :label="isInCall ? t('actions.returnToCall') : t('options.voiceCall')"
            icon-pos="top"
            severity="secondary"
            variant="text"
            data-testid="chat-profile-voice-call"
            class="h-16 w-24 gap-y-1! rounded-xl! bg-chat-on-background/6! px-1! py-2! text-[12px]! text-chat-on-background! hover:bg-chat-on-background/10!"
            @click="startCall(false)"
          >
            <template #icon>
              <BIcon icon="PhPhone" weight="fill" class="size-5.5 text-chat-primary" />
            </template>
          </Button>
          <Button
            v-if="canVideoCall"
            :label="isInCall ? t('actions.returnToCall') : t('options.videoCall')"
            icon-pos="top"
            severity="secondary"
            variant="text"
            data-testid="chat-profile-video-call"
            class="h-16 w-24 gap-y-1! rounded-xl! bg-chat-on-background/6! px-1! py-2! text-[12px]! text-chat-on-background! hover:bg-chat-on-background/10!"
            @click="startCall(true)"
          >
            <template #icon>
              <BIcon icon="PhVideoCamera" weight="fill" class="size-5.5 text-chat-primary" />
            </template>
          </Button>
        </div>

        <dl
          v-if="details.length"
          class="mx-4 mt-0 mb-4 shrink-0 divide-y divide-chat-outline-variant overflow-hidden rounded-xl border border-chat-outline-variant"
        >
          <div
            v-for="item in details"
            :key="item.key"
            class="flex items-center justify-between gap-x-3 px-3.5 py-3 select-none"
          >
            <dt class="flex min-w-0 items-center gap-x-2 text-body-sm text-chat-muted">
              <BIcon :icon="item.icon" class="size-4.5 shrink-0" />
              <span class="truncate">{{ item.label }}</span>
            </dt>
            <dd
              :dir="item.ltr ? 'ltr' : undefined"
              class="m-0 truncate text-body-md font-medium text-chat-on-background"
            >
              {{ item.value }}
            </dd>
          </div>
        </dl>

        <section
          :aria-label="t('info.shared')"
          class="flex min-h-0 flex-1 flex-col border-t border-t-chat-outline-variant select-none"
        >
          <Tabs v-model:value="currentTab" class="shrink-0">
            <TabList :pt="{ tabList: { class: 'bg-transparent!' } }">
              <Tab value="media" class="flex-1">{{ t("info.media") }}</Tab>
              <Tab value="files" class="flex-1">{{ t("info.files") }}</Tab>
            </TabList>
          </Tabs>

          <div class="min-h-0 flex-1 px-4 pt-3">
            <div v-if="isLoadingShared" class="grid grid-cols-3 gap-2" aria-hidden="true">
              <div v-for="n in 6" :key="n" v-loading="true" class="aspect-square rounded-xl" />
            </div>

            <template v-else>
              <div v-show="currentTab === 'media'" class="h-full">
                <BVirtualVerticalList
                  v-if="mediaAttachements.length"
                  :items="mediaRows"
                  :loading="isLoadingMedia"
                  :has-next-page="hasMediaNextPage"
                  class="h-full"
                  @load-more="fetchMoreMedia"
                >
                  <template #item="{ item: row }">
                    <div class="grid w-full grid-cols-3 gap-2 pb-2">
                      <div
                        v-for="(media, idx) in row"
                        :key="idx"
                        class="aspect-square overflow-hidden rounded-xl bg-chat-surface"
                      >
                        <MediaImage :src="media" class="size-full" />
                      </div>
                    </div>
                  </template>
                </BVirtualVerticalList>
                <p
                  v-else
                  class="m-0 flex flex-col items-center gap-y-2 py-8 text-center text-body-sm text-chat-muted"
                >
                  <BIcon icon="PhImages" class="size-7" />
                  {{ t("empty.media") }}
                </p>
              </div>

              <div v-show="currentTab === 'files'" class="h-full">
                <BVirtualVerticalList
                  v-if="fileAttachements.length"
                  :items="fileAttachements"
                  :loading="isLoadingAttachements"
                  :has-next-page="hasFileNextPage"
                  class="h-full"
                  @load-more="fetchMoreFiles"
                >
                  <template #item="{ item: file }">
                    <div class="pb-2">
                      <FileDisplay :url="file" :loading="false" />
                    </div>
                  </template>
                </BVirtualVerticalList>
                <p
                  v-else
                  class="m-0 flex flex-col items-center gap-y-2 py-8 text-center text-body-sm text-chat-muted"
                >
                  <BIcon icon="PhFiles" class="size-7" />
                  {{ t("empty.files") }}
                </p>
              </div>
            </template>
          </div>
        </section>

        <div v-if="canEnd" class="shrink-0 border-t border-t-chat-outline-variant p-4">
          <Button
            :label="t('options.end')"
            severity="danger"
            variant="outlined"
            data-testid="chat-profile-end"
            class="w-full"
            @click="emit('end')"
          >
            <template #icon>
              <BIcon icon="PhXSquare" class="size-5" />
            </template>
          </Button>
        </div>
      </div>
    </div>
  </aside>
</template>
