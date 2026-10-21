<template>
  <div :dir="dir" class="vue-chat relative z-20 w-full">
    <!-- A size container (`chat-header`): the header folds by its own width, not the screen's, since
         the list, the contact panel and a host's sidebar all take from it. -->
    <header
      v-if="selectedChat"
      ref="header"
      class="@container/chat-header relative z-50 flex h-16 w-full items-center gap-x-2 border-b border-b-chat-outline-variant bg-chat-background px-3 md:h-20 md:gap-x-3 md:px-5"
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
        <!-- Host actions for the open conversation, before the calls. When the header is narrow
             (`compact`) a host can list them in the menu instead, through `hostOptions`. -->
        <slot name="actions" :contact="selectedChat" :compact="compact" />

        <span
          v-if="$slots.actions && !compact && (canVoiceCall || canVideoCall)"
          aria-hidden="true"
          class="mx-1 h-6 w-px shrink-0 bg-chat-outline-variant"
        />

        <!-- Others are in a call here: joining it replaces starting one. A full call keeps the
             button, disabled, with the reason; the wrapper carries the tooltip, since a disabled
             button gets no pointer events. -->
        <span v-if="canJoin" v-tooltip.bottom="isFull ? { value: fullHint, class: 'vue-chat font-chat-family' } : undefined" class="inline-flex shrink-0">
          <Button
            rounded
            :severity="isFull ? 'secondary' : 'success'"
            size="small"
            :disabled="isFull"
            :aria-label="isFull ? `${t('joinFull')}. ${fullHint}` : joinVideo ? t('joinVideoCall') : t('joinVoiceCall')"
            data-testid="chat-join-call"
            class="min-h-10 shrink-0 gap-x-2! px-3.5!"
            @click="initCall(joinVideo)"
          >
            <span v-if="!isFull" aria-hidden="true" class="relative flex size-2">
              <span
                class="absolute inset-0 animate-ping rounded-full bg-current opacity-75 motion-reduce:animate-none"
              />
              <span class="relative size-2 rounded-full bg-current" />
            </span>
            <BIcon :icon="joinVideo ? 'PhVideoCamera' : 'PhPhone'" weight="fill" class="size-4.5" />
            <span class="text-label-md font-semibold">{{ isFull ? t("joinFull") : t("join") }}</span>
          </Button>
        </span>

        <!-- During a call either button brings the running call back into view. -->
        <IconButton
          v-else-if="canVoiceCall"
          icon="PhPhone"
          icon-class="size-5.5"
          :label="isInCall ? t('actions.returnToCall') : t('actions.call')"
          :data-testid="canVideoCall ? 'chat-start-voice-call' : 'chat-start-call'"
          @click="initCall(false)"
        />
        <!-- When narrow the voice call keeps its button and the video call moves into the menu. -->
        <IconButton
          v-if="canVideoCall && !canJoin && !compact"
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
          v-if="menuItems.length"
          icon="PhDotsThreeVertical"
          icon-class="size-5.5"
          :label="t('actions.moreOptions')"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          data-testid="chat-more-options"
          :class="menuOpen && 'bg-chat-primary/10! text-chat-primary!'"
          @click="optionsMenuRef?.toggle($event)"
        />
        <!-- A card like the message menu: rows a thumb can hit, each led by a tinted icon chip. -->
        <Menu
          ref="optionsMenu"
          :model="menuItems"
          popup
          :dir="dir"
          :pt="menuPt"
          class="vue-chat"
          data-testid="chat-more-menu"
          @show="menuOpen = true"
          @hide="menuOpen = false"
        >
          <template #item="{ item, props: itemProps }">
            <a
              v-bind="itemProps.action"
              :data-testid="`chat-menu-${item.key}`"
              class="flex min-h-11 cursor-pointer items-center gap-x-3 px-2 py-1.5"
            >
              <span
                aria-hidden="true"
                class="flex size-8 shrink-0 items-center justify-center rounded-full"
                :class="chipClass(item)"
              >
                <BIcon
                  v-if="typeof item.phIcon === 'string'"
                  :icon="item.phIcon"
                  class="size-4.5"
                />
                <component :is="item.phIcon" v-else-if="item.phIcon" class="size-4.5" />
              </span>
              <span
                class="min-w-0 flex-1 truncate text-label-md"
                :class="item.danger ? 'text-chat-error' : 'text-chat-on-background'"
              >
                {{ item.label }}
              </span>
            </a>
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
import Tooltip from "primevue/tooltip";
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
import { computed, ref, useTemplateRef } from "vue";
import { useElementSize } from "@vueuse/core";

const vTooltip = Tooltip;

const props = withDefaults(
  defineProps<{
    contact: Contact | null;
    /** Actions for the open conversation, listed in the header's "more options" menu. */
    options: MenuOption[];
    /** The host's actions as menu items, listed before `options` while the header is compact. */
    hostOptions?: MenuOption[];
  }>(),
  {
    contact: null,
    options: () => [],
    hostOptions: () => [],
  },
);

const emit = defineEmits<{
  call: [];
  "open-profile": [];
  select: [key: string];
}>();

const optionsMenuRef = useTemplateRef<InstanceType<typeof Menu>>("optionsMenu");

// Below this the header cannot fit a host's actions beside the calls and the contact's name.
const COMPACT_BELOW = 640;
const headerRef = useTemplateRef<HTMLElement>("header");
const { width: headerWidth } = useElementSize(headerRef);
const compact = computed(() => headerWidth.value < COMPACT_BELOW);

const menuOpen = ref(false);

const menuPt = {
  root: {
    class:
      "w-64! max-w-[calc(100vw-1.5rem)]! rounded-2xl! border-chat-outline-variant/60! bg-chat-background/95! p-1.5! shadow-xl! backdrop-blur-md!",
  },
  list: { class: "gap-y-0.5! p-0!" },
  itemContent: { class: "rounded-xl!" },
  separator: { class: "mx-2! my-1! border-chat-outline-variant/70!" },
  // Drops out of the button, which sits at the header's end.
  transition: {
    enterFromClass: "opacity-0 scale-95",
    enterActiveClass:
      "transition duration-150 ease-out origin-top-right rtl:origin-top-left motion-reduce:transition-none",
    leaveActiveClass: "transition-opacity duration-100 ease-in motion-reduce:transition-none",
    leaveToClass: "opacity-0",
  },
};

// The call is the one primary action in the menu, ending the chat the one destructive one.
const chipClass = (item: MenuItem) =>
  item.danger
    ? "bg-chat-error/10 text-chat-error"
    : item.accent
      ? "bg-chat-primary/12 text-chat-primary"
      : "bg-chat-surface text-chat-on-surface";

const toItem = (option: MenuOption): MenuItem => ({
  key: option.key,
  label: option.label,
  phIcon: option.icon,
  accent: option.color === "primary",
  danger: option.color === "error",
  disabled: option.disabled,
  command: () => (option.command ? option.command() : emit("select", option.key)),
});

// When compact the menu takes what the header has no room for, in groups set off by a line: the
// video call, the host's actions, then the conversation's own, so ending it comes last.
const menuItems = computed<MenuItem[]>(() => {
  if (!compact.value) return props.options.map(toItem);
  const video: MenuOption[] =
    canVideoCall.value && !canJoin.value
      ? [
          {
            key: "video-call",
            label: isInCall.value ? t("actions.returnToCall") : t("videoCall"),
            icon: "PhVideoCamera",
            color: "primary",
            command: () => initCall(true),
          },
        ]
      : [];
  return [video, props.hostOptions, props.options]
    .filter((group) => group.length)
    .flatMap((group, index) => [...(index ? [{ separator: true }] : []), ...group.map(toItem)]);
});

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
// As many are in it as a call takes: Join stays visible, so the user sees why they can't.
const isFull = computed(() => canJoin.value && !!ongoingCall.value?.full);
const fullHint = computed(() => t("joinFullHint", { max: ongoingCall.value?.max ?? 0 }));

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
