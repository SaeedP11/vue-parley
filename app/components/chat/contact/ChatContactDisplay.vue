<script setup lang="ts">
/**
 * One conversation row: who and when on the first line; then the conversation's tag (what tells
 * two conversations with the same person apart), the last message or the draft, and the unread
 * count. The row is a button, so it is reached with Tab and opened with Enter or Space.
 */
import Badge from "primevue/badge";
import Button from "primevue/button";
import Tag from "primevue/tag";
import vLoading from "~/directives/loading";
import SafeEmojiText from "~/components/general/SafeEmojiText.vue";
import { useProfileStore } from "~/stores/profileStore.js";
import useLocalI18n from "~/composables/useLocalI18n";
import { useChatStore } from "~/stores/chatStore.js";
import { useMessagesStore } from "~/stores/messageStores.js";
import { chatContactDisplay } from "@i18n/locales";
import ContactAvatar from "./ContactAvatar.vue";
import { useDate } from "~/composables/useDate";
import type { Contact } from "~/types";
import { computed } from "vue";

const props = defineProps<{
  contact: Contact;
  loading?: boolean;
}>();

const { t } = useLocalI18n(chatContactDisplay);
const chatStore = useChatStore();
const messagesStore = useMessagesStore();
const profileStore = useProfileStore();
const currentUserId = computed(() => profileStore.userId);

const isActive = computed(
  () => chatStore.activeConversationId === props.contact.id,
);

const isLoading = computed(() => props.loading);
const unreadCount = computed(() => props.contact.unreadCount ?? 0);
const hasUnread = computed(() => unreadCount.value > 0 && !isLoading.value);
const fullName = computed(() =>
  `${props.contact.name} ${props.contact.lastName}`.trim(),
);

const openChat = () => {
  chatStore.setSelectedChat(props.contact.id);
};

// The open chat shows its draft in the input already.
const draft = computed(() =>
  isActive.value ? "" : (messagesStore.drafts[props.contact.id] ?? ""),
);

const isFromMe = computed(
  () => props.contact.lastMessage?.senderId === currentUserId.value,
);

const lastMessageIcon = computed(() => {
  const msg = props.contact.lastMessage;
  if (!msg || !isFromMe.value) return { color: "", icon: "", label: "" };

  if (msg.isFailed)
    return { color: "fill-error", icon: "PhWarningCircle", label: t("status.failed") };
  if (!msg.isSent)
    return { color: "fill-chat-on-background/30", icon: "PhClock", label: t("status.sending") };
  if (!msg.isRead)
    return { color: "fill-chat-muted", icon: "PhCheck", label: t("status.sent") };
  return { color: "fill-chat-primary", icon: "PhChecks", label: t("status.seen") };
});

const attachmentIcon = computed(() => {
  const msg = props.contact.lastMessage;
  if (!msg) return null;

  if (msg.request) return "PhSubtitles";

  const icons: Record<string, string> = {
    image: "PhImage",
    file: "PhFile",
    voice: "PhMicrophone",
    video: "PhVideo",
  };

  if (msg.type !== "text") {
    return icons[msg.type] || null;
  }

  return null;
});

const { formatTime, formatDateShort } = useDate();

/** Today's activity shows its time; older activity its date. */
const lastMessageTime = computed(() => {
  const date = props.contact.lastMessage?.date ?? props.contact.lastActivity;
  if (!date) return "";
  return new Date(date).toDateString() === new Date().toDateString()
    ? formatTime(date)
    : formatDateShort(date);
});

const lastMessageText = computed(() => {
  const msg = props.contact.lastMessage;
  if (!msg) return "";

  if (msg.text) return msg.text;
  if (msg.request) return t("attachementTypes.request");
  if (msg.type !== "text") return t(`attachementTypes.${msg.type}`);
  return "";
});

const lastMessageColor = computed(() => {
  const msg = props.contact.lastMessage;
  if (!msg) return "text-chat-muted";

  if ((!msg.text && msg.type !== "text") || msg.request)
    return "text-chat-primary font-medium";

  if (unreadCount.value > 0)
    return "text-chat-on-background font-medium";

  return "text-chat-muted";
});

// With nothing for the second line, the name centres on the avatar instead of sitting over a gap.
const hasDetails = computed(
  () => !!(props.contact.tag || draft.value || props.contact.lastMessage || hasUnread.value),
);

const unreadLabel = computed(() =>
  unreadCount.value > 99 ? "+99" : String(unreadCount.value),
);

/** Everything the row shows, in reading order, as the button's accessible name. */
const accessibleName = computed(() =>
  [
    fullName.value,
    props.contact.tag,
    lastMessageTime.value,
    draft.value ? `${t("draft")}: ${draft.value}` : lastMessageText.value,
    lastMessageIcon.value.label,
    hasUnread.value ? t("unread", { count: unreadLabel.value }) : "",
  ]
    .filter(Boolean)
    .join("، "),
);
</script>
<template>
  <Button
    unstyled
    data-testid="chat-contact"
    :data-contact-id="contact.id"
    :aria-current="isActive ? 'true' : undefined"
    :aria-label="accessibleName"
    :class="[isActive ? 'bg-chat-surface' : 'bg-chat-surface/0 hover:bg-chat-surface/50']"
    class="flex h-19 w-full cursor-pointer items-center gap-x-3 rounded-xl p-2.5 text-start transition-colors duration-200 ease-in-out focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-chat-primary motion-reduce:transition-none"
    @click="openChat"
  >
    <span v-loading="isLoading" class="relative block size-12 shrink-0">
      <ContactAvatar :contact="contact" />
    </span>

    <span class="flex min-w-0 flex-1 flex-col gap-y-1 select-none">
      <span class="flex w-full items-baseline justify-between gap-x-2">
        <span
          v-loading="isLoading"
          :class="hasUnread ? 'font-bold' : 'font-semibold'"
          class="min-w-20 truncate text-label-md text-chat-on-background"
        >
          {{ fullName }}
        </span>
        <span
          v-if="lastMessageTime"
          v-loading="isLoading"
          :class="hasUnread ? 'font-semibold text-chat-primary' : 'text-chat-muted'"
          class="shrink-0 text-[11px]"
        >
          {{ lastMessageTime }}
        </span>
      </span>

      <span v-if="hasDetails" class="flex w-full items-center gap-x-1.5">
        <Tag
          v-if="contact.tag && !isLoading"
          severity="secondary"
          :value="contact.tag"
          data-testid="chat-contact-tag"
          :pt="{
            root: {
              class:
                'max-w-24 shrink-0 rounded-md! px-1.5! py-0! bg-chat-on-background/6! text-chat-muted!',
            },
            label: { class: 'truncate text-[11px]! font-semibold! leading-5!' },
          }"
        />

        <span class="flex min-w-0 flex-1 items-center gap-x-1">
          <template v-if="draft">
            <span class="shrink-0 text-body-sm text-error">{{ t("draft") }}:</span>
            <SafeEmojiText truncate :text="draft" class="min-w-0 text-body-sm text-chat-muted" />
          </template>

          <template v-else-if="contact.lastMessage && !isLoading">
            <BIcon
              v-if="lastMessageIcon.icon"
              :icon="lastMessageIcon.icon"
              :class="lastMessageIcon.color"
              class="size-4 shrink-0"
            />
            <BIcon
              v-if="attachmentIcon"
              weight="bold"
              :icon="attachmentIcon"
              class="size-4 shrink-0 fill-chat-primary"
            />
            <span
              dir="auto"
              :class="['min-w-0 truncate text-body-sm transition-colors', lastMessageColor]"
            >
              <SafeEmojiText truncate :text="lastMessageText" />
            </span>
          </template>
        </span>

        <Badge
          v-if="hasUnread"
          dir="ltr"
          :value="unreadLabel"
          class="ms-1 shrink-0"
        />
      </span>
    </span>
  </Button>
</template>
