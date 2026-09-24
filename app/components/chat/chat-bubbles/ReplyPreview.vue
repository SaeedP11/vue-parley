<script setup lang="ts">
/** The quoted message shown at the top of a bubble that replies to another message. */
import { computed } from "vue";
import type { Contact, ExtendedMessage } from "~/types";
import SafeEmojiText from "~/components/general/SafeEmojiText.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { chatBubble } from "@i18n/locales";

const props = defineProps<{
  message: ExtendedMessage;
  contact?: Contact | null;
  isMine: boolean;
  currentUserId: string;
}>();

const { t } = useLocalI18n(chatBubble);

const replied = computed(() => props.message.repliedTo!);

const senderName = computed(() =>
  replied.value.senderId === props.currentUserId
    ? t("you")
    : `${props.contact?.name ?? ""} ${props.contact?.lastName ?? ""}`.trim(),
);

const preview = computed(() => {
  const m = replied.value;
  if (m.text?.trim()) return m.text;
  if (m.imageUrl?.length) return t("attachementTypes.image");
  if (m.voiceUrl) return t("attachementTypes.voice");
  if (m.videoUrl) return t("attachementTypes.video");
  if (m.fileUrl) return m.fileName || t("attachementTypes.file");
  return "";
});
</script>

<template>
  <div
    data-testid="reply-preview"
    class="mx-2 mt-2 flex flex-col gap-y-0.5 overflow-hidden rounded-lg border-s-2 border-s-chat-primary px-3 py-1.5 text-body-sm"
    :class="isMine ? 'bg-on-surface/5' : 'bg-surface-variant-2'"
  >
    <div class="truncate text-label-sm text-chat-primary">{{ senderName }}</div>
    <div class="line-clamp-1 text-on-surface/70">
      <SafeEmojiText :text="preview" />
    </div>
  </div>
</template>
