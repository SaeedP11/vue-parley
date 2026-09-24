<script setup lang="ts">
import vLoading from "~/directives/loading";
import SafeEmojiText from "~/components/general/SafeEmojiText.vue";
import { useProfileStore } from "~/stores/profileStore.js";
import useLocalI18n from "~/composables/useLocalI18n";
import { useChatStore } from "~/stores/chatStore.js";
import { useMessagesStore } from "~/stores/messageStores.js";
import { chatContactDisplay } from "@i18n/locales";
import ContactAvatar from "./ContactAvatar.vue";
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
  if (!msg || !isFromMe.value) return { color: "", icon: "" };

  if (msg.isFailed) return { color: "fill-error", icon: "PhWarningCircle" };
  if (!msg.isSent)
    return { color: "fill-chat-on-background/30", icon: "PhClock" };
  if (!msg.isRead)
    return { color: "fill-chat-on-background/50", icon: "PhCheck" };
  return { color: "fill-chat-primary", icon: "PhChecks" };
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

const lastMessageText = computed(() => {
  const msg = props.contact.lastMessage;
  if (!msg) return "";

  // Handle content (Text or Attachment Title)
  let content = msg.text;
  if (!content && msg.request) {
    content = t("attachementTypes.request");
  }
  if (!content && msg.type !== "text") {
    content = t(`attachementTypes.${msg.type}`);
  }

  // Handle Name Prefix
  if (!isFromMe.value) {
    return `${props.contact.name}: ${content}`;
  }

  return content;
});

const lastMessageColor = computed(() => {
  const msg = props.contact.lastMessage;
  if (!msg) return "text-chat-on-background/50";

  if ((!msg.text && msg.type !== "text") || msg.request)
    return "text-chat-primary font-medium";

  if (props.contact.unreadCount > 0)
    return "text-chat-on-background font-medium";

  return "text-chat-on-background/50";
});
</script>
<template>
  <div
    data-testid="chat-contact"
    :data-contact-id="contact.id"
    @click="openChat"
    :class="[isActive ? 'bg-chat-surface' : 'bg-chat-surface/0']"
    class="rounded-xl w-full transition-all duration-200 ease-in-out cursor-pointer p-2.5 flex justify-between gap-x-3 items-center h-19"
  >
    <div v-loading="isLoading" class="relative shrink-0 h-11 w-11">
      <ContactAvatar :contact="contact" />
    </div>

    <div class="select-none flex-1 overflow-hidden">
      <div class="w-full flex items-center justify-between">
        <div
          class="text-label-md text-chat-on-background min-w-20 truncate"
          v-loading="isLoading"
        >
          {{ contact.name }} {{ contact.lastName }}
        </div>
        <div
          v-if="contact.lastMessage"
          class="flex gap-x-1.5 items-center shrink-0"
        >
          <div
            v-loading="isLoading"
            class="text-chat-on-background/50 text-[11px]"
          >
            {{ contact.lastMessage.date }}
          </div>
          <BIcon
            v-if="lastMessageIcon.icon !== ''"
            :icon="lastMessageIcon.icon"
            :class="lastMessageIcon.color"
            class="w-4 h-4"
          />
        </div>
      </div>

      <div class="w-full flex items-center justify-between mt-0.5">
        <div class="flex items-center gap-x-1.5 flex-1 overflow-hidden">
          <div
            v-if="draft"
            class="max-w-full truncate text-body-sm flex items-center gap-x-1"
          >
            <span class="text-error shrink-0">{{ t("draft") }}:</span>
            <SafeEmojiText
              truncate
              :text="draft"
              class="text-chat-on-background/50"
            />
          </div>

          <BIcon
            v-if="!draft && attachmentIcon && contact.lastMessage"
            weight="bold"
            :icon="attachmentIcon"
            class="w-4 h-4 fill-chat-primary shrink-0"
          />

          <div
            v-loading="isLoading"
            v-if="!draft && contact.lastMessage"
            :class="[
              'max-w-full truncate text-body-sm transition-colors',
              lastMessageColor,
            ]"
          >
            <SafeEmojiText truncate :text="lastMessageText" />
          </div>
        </div>

        <div class="h-full flex items-center shrink-0 ms-2">
          <div
            v-loading="isLoading"
            v-if="contact.unreadCount > 0"
            class="rounded-full justify-center min-w-6 px-1.5 h-5 flex bg-gradient-error items-center select-none"
          >
            <div dir="ltr" class="text-white text-[10px] font-bold text-center">
              {{ contact.unreadCount > 99 ? "+99" : contact.unreadCount }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
