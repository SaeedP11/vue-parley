<template>
  <div :dir="dir" class="vue-chat relative z-20 w-full">
    <header
      v-if="selectedChat"
      class="relative z-50 flex h-16 w-full items-center gap-x-2 border-b border-b-chat-outline-variant bg-chat-background px-3 md:h-20 md:gap-x-3 md:px-5"
    >
      <!-- At the start and pointing back, mirrored for right-to-left. -->
      <IconButton
        icon="PhArrowLeft"
        icon-class="size-6 rtl:-scale-x-100"
        :label="t('actions.back')"
        class="shrink-0 md:hidden!"
        @click="goBack"
      />

      <!-- Who the conversation is with; opens their contact info. -->
      <Button
        unstyled
        data-testid="chat-header-contact"
        :aria-label="t('contactInfo', { name: fullName })"
        class="flex min-w-0 flex-1 cursor-pointer items-center gap-x-3 rounded-xl p-1.5 text-start transition-colors hover:bg-chat-surface/60 focus-visible:outline-2 focus-visible:outline-chat-primary motion-reduce:transition-none"
        @click="openProfile"
      >
        <span class="relative block size-10 shrink-0 md:size-11">
          <ContactAvatar v-if="contact" :contact="contact" />
        </span>
        <span class="flex min-w-0 flex-col select-none">
          <span class="truncate text-label-md font-semibold text-chat-on-background">
            {{ fullName }}
          </span>
          <span class="flex min-w-0 items-center gap-x-1.5 text-body-sm">
            <span
              v-if="selectedChat.isOnline"
              data-testid="chat-header-status"
              class="shrink-0 font-medium text-chat-primary"
            >
              {{ t("online") }}
            </span>
            <span
              v-else-if="selectedChat.lastSeen"
              data-testid="chat-header-status"
              class="min-w-0 truncate text-chat-muted"
            >
              {{ t("lastSeen", { time: formatRelativeDate(selectedChat.lastSeen) }) }}
            </span>
            <template v-if="selectedChat.tag">
              <span aria-hidden="true" class="shrink-0 text-chat-muted">·</span>
              <span class="min-w-0 truncate text-chat-muted">{{ selectedChat.tag }}</span>
            </template>
          </span>
        </span>
      </Button>

      <div
        class="flex shrink-0 items-center gap-x-1 transition-transform duration-200 ease-in-out motion-reduce:transition-none md:gap-x-2"
        :class="[isSelectMode ? 'invisible' : 'visible']"
      >
        <!-- Host actions for the open conversation, before the calls. -->
        <slot name="actions" :contact="selectedChat" />

        <span
          v-if="$slots.actions && (canVoiceCall || canVideoCall)"
          aria-hidden="true"
          class="mx-1 hidden h-6 w-px bg-chat-outline-variant md:block"
        />

        <!-- Others are in a call here: joining it replaces starting one. -->
        <Button
          v-if="canJoin"
          rounded
          severity="success"
          size="small"
          :aria-label="joinVideo ? t('joinVideoCall') : t('joinVoiceCall')"
          data-testid="chat-join-call"
          class="min-h-10 shrink-0 gap-x-2! px-3.5!"
          @click="initCall(joinVideo)"
        >
          <span aria-hidden="true" class="relative flex size-2">
            <span
              class="absolute inset-0 animate-ping rounded-full bg-current opacity-75 motion-reduce:animate-none"
            />
            <span class="relative size-2 rounded-full bg-current" />
          </span>
          <BIcon :icon="joinVideo ? 'PhVideoCamera' : 'PhPhone'" weight="fill" class="size-4.5" />
          <span class="text-label-md font-semibold">{{ t("join") }}</span>
        </Button>

        <!-- During a call either button brings the running call back into view. -->
        <IconButton
          v-else-if="canVoiceCall"
          icon="PhPhone"
          icon-class="size-5.5"
          :label="isInCall ? t('actions.returnToCall') : t('actions.call')"
          :data-testid="canVideoCall ? 'chat-start-voice-call' : 'chat-start-call'"
          @click="initCall(false)"
        />
        <IconButton
          v-if="canVideoCall && !canJoin"
          icon="PhVideoCamera"
          icon-class="size-5.5"
          :label="isInCall ? t('actions.returnToCall') : t('videoCall')"
          data-testid="chat-start-call"
          @click="initCall(true)"
        />
        <IconButton
          icon="PhSidebarSimple"
          icon-class="size-5.5 ltr:-scale-x-100"
          :label="t('toggleInfo')"
          :aria-pressed="isProfileOpen"
          data-testid="chat-toggle-info"
          class="hidden! md:inline-flex!"
          :class="isProfileOpen && 'bg-chat-primary/10! text-chat-primary!'"
          @click="toggleProfile"
        />
        <IconButton
          v-if="options.length"
          icon="PhDotsThreeVertical"
          icon-class="size-5.5"
          :label="t('actions.moreOptions')"
          aria-haspopup="true"
          data-testid="chat-more-options"
          @click="optionsMenuRef?.toggle($event)"
        />
        <Menu ref="optionsMenu" :model="menuItems" popup :dir="dir" class="vue-chat">
          <template #itemicon="{ item }">
            <BIcon
              :icon="item.phIcon"
              class="size-5"
              :class="item.danger ? 'text-chat-error' : 'text-chat-muted'"
            />
          </template>
        </Menu>
      </div>
    </header>

    <!-- A conversation is open but its contact is still being fetched (e.g. a deep link). -->
    <div
      v-else-if="currentConversationId"
      class="relative z-50 flex h-16 w-full items-center gap-x-3 border-b border-b-chat-outline-variant bg-chat-background px-5 md:h-20"
    >
      <Skeleton shape="circle" size="2.75rem" class="shrink-0" />
      <div class="flex flex-col gap-y-2">
        <Skeleton width="8rem" height="0.875rem" />
        <Skeleton width="5rem" height="0.625rem" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from "primevue/button";
import Menu from "primevue/menu";
import Skeleton from "primevue/skeleton";
import type { MenuItem } from "primevue/menuitem";
import type { MenuOption } from "~/types/components/menu-options";
import IconButton from "~/components/general/IconButton.vue";
import BIcon from "~/components/global/BIcon.vue";
import { useMessagesStore } from "~/stores/messageStores.js";
import ContactAvatar from "./contact/ContactAvatar.vue";
import useLocalI18n, { useDirection } from "~/composables/useLocalI18n";
import { useCallStore } from "~/stores/callStore.js";
import { useChatStore } from "~/stores/chatStore.js";
import { useDate } from "~/composables/useDate.js";
import { chatPageBar } from "@i18n/locales";
import type { Contact } from "~/types";
import { computed, useTemplateRef } from "vue";

const props = withDefaults(
  defineProps<{
    contact: Contact | null;
    /** Actions for the open conversation, listed in the header's "more options" menu. */
    options: MenuOption[];
  }>(),
  {
    contact: null,
    options: () => [],
  },
);

const emit = defineEmits<{
  call: [];
  "open-profile": [];
  select: [key: string];
}>();

const optionsMenuRef = useTemplateRef<InstanceType<typeof Menu>>("optionsMenu");
const menuItems = computed<MenuItem[]>(() =>
  props.options.map((option) => ({
    label: option.label,
    phIcon: option.icon,
    danger: option.color === "error",
    command: () => emit("select", option.key),
  })),
);

const messagesStore = useMessagesStore();
const { formatRelativeDate } = useDate();
const { t } = useLocalI18n(chatPageBar);
const { dir } = useDirection();
const callStore = useCallStore();
const chatStore = useChatStore();

const currentConversationId = computed(() => chatStore.activeConversationId);
const isSelectMode = computed(() => messagesStore.isSelectMode);
const isProfileOpen = computed(() => chatStore.profileViewOpen);
const isInCall = computed(() => callStore.isActive);
const selectedChat = computed(() => props.contact);

const fullName = computed(() =>
  `${selectedChat.value?.name ?? ""} ${selectedChat.value?.lastName ?? ""}`.trim(),
);

// An ended conversation takes no calls and a chat-only one none at all. A host that sets no
// `serviceType` gets both, as the single call button it had before started a video call.
const canVoiceCall = computed(
  () => !!selectedChat.value?.isActive && selectedChat.value.serviceType !== "chat",
);
const canVideoCall = computed(
  () => canVoiceCall.value && selectedChat.value?.serviceType !== "voice-call",
);

// A call others are in on this conversation. While the user is in a call themselves the buttons
// keep bringing that one back instead.
const ongoingCall = computed(() => callStore.ongoingCall(currentConversationId.value));
const canJoin = computed(() => canVoiceCall.value && !isInCall.value && !!ongoingCall.value);
// Joins the way the call was started, with the camera on only for a video call.
const joinVideo = computed(() => canVideoCall.value && !!ongoingCall.value?.video);

const openProfile = () => {
  emit("open-profile");
};

const toggleProfile = () => {
  if (isProfileOpen.value) chatStore.closeProfile();
  else openProfile();
};

const goBack = () => {
  chatStore.setSelectedChat(null);
};

const initCall = (video: boolean) => {
  if (currentConversationId.value) {
    callStore.startCall(currentConversationId.value, { video });
  }
};
</script>
