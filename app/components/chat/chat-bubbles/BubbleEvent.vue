<script setup lang="ts">
import { computed } from "vue";
import type { ExtendedMessage } from "~/types";
import BIcon from "../../global/BIcon.vue";
import { useDate } from "~/composables/useDate";
import useLocalI18n from "~/composables/useLocalI18n";
import { chatBubble } from "@i18n/locales";

const props = defineProps<{
  message: ExtendedMessage;
}>();

const { t } = useLocalI18n(chatBubble);
const { formatTime } = useDate();

const event = computed(() => props.message.event);
const eventType = computed(() => event.value?.type || props.message.type || "");

const iconName = computed(() => {
  const type = eventType.value;
  const isVoice = event.value?.callType === "voice";

  switch (type) {
    case "call_started":
      return isVoice ? "PhoneCall" : "VideoCamera";
    case "call_ended":
      return isVoice ? "PhoneX" : "VideoCameraSlash";
    case "member_added":
      return "User";
    case "member_removed":
      return "User";
    case "pinned_message":
    case "unpinned_message":
      return "ChatCircleDots";
    case "conversation_ended":
      return "LockKey";
    default:
      return "Info";
  }
});

const formattedDuration = computed(() => {
  const duration = event.value?.duration;
  if (typeof duration !== "number" || duration <= 0) return null;
  const mins = Math.floor(duration / 60);
  const secs = Math.floor(duration % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}:${String(remMins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
});

const labelText = computed(() => {
  // If the backend already provided a formatted message string, prefer it.
  if (props.message.text?.trim()) return props.message.text.trim();

  const type = eventType.value;
  const ev = event.value;
  const isVoice = ev?.callType === "voice";
  const callTypeLabel = isVoice ? t("events.voiceCall") : t("events.videoCall");

  switch (type) {
    case "call_started":
      return ev?.actorName
        ? t("events.callStarted", { actor: ev.actorName, callType: callTypeLabel })
        : t("events.callStartedGeneric", { callType: callTypeLabel });
    case "call_ended":
      return t("events.callEnded", { callType: callTypeLabel });
    case "member_added":
      if (ev?.actorName && ev?.targetName) {
        return t("events.memberAdded", { actor: ev.actorName, target: ev.targetName });
      }
      return t("events.memberJoined", { target: ev?.targetName || ev?.actorName || t("events.user") });
    case "member_removed":
      if (ev?.actorName && ev?.targetName) {
        return t("events.memberRemoved", { actor: ev.actorName, target: ev.targetName });
      }
      return t("events.memberLeft", { target: ev?.targetName || t("events.user") });
    case "pinned_message":
      return ev?.actorName
        ? t("events.pinnedMessage", { actor: ev.actorName })
        : t("events.messagePinned");
    case "unpinned_message":
      return ev?.actorName
        ? t("events.unpinnedMessage", { actor: ev.actorName })
        : t("events.messageUnpinned");
    case "conversation_ended":
      return t("events.conversationEnded");
    default:
      return props.message.text || t("events.notice");
  }
});

const timeString = computed(() => {
  if (!props.message.date) return "";
  try {
    return formatTime(props.message.date);
  } catch {
    return "";
  }
});
</script>

<template>
  <div class="py-2.5 w-full flex items-center justify-center select-none" data-testid="chat-event-bubble">
    <div
      class="inline-flex items-center gap-1.5 rounded-full bg-on-surface/8 dark:bg-on-surface/12 px-3.5 py-1 text-xs font-medium text-chat-on-background/85 shadow-xs border border-chat-outline-variant/30 backdrop-blur-xs max-w-[90%] transition-colors"
    >
      <BIcon v-if="iconName" :icon="iconName" class="size-3.5 shrink-0 text-primary" />
      <span class="break-words leading-normal">
        {{ labelText }}
      </span>
      <span v-if="formattedDuration" class="tabular-nums font-normal text-chat-on-background/70 ms-0.5">
        ({{ formattedDuration }})
      </span>
      <span v-if="timeString" class="text-[10px] text-chat-on-background/45 ms-1 font-normal tabular-nums">
        {{ timeString }}
      </span>
    </div>
  </div>
</template>
