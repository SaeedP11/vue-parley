<script setup lang="ts">
import { useCallStore } from "~/stores/callStore";
import { useChatStore } from "~/stores/chatStore";
import useLocalI18n from "~/composables/useLocalI18n";
import { chat } from "@i18n/locales";
import useCall from "~/composables/useCall";
import { useEventListener } from "@vueuse/core";
import { computed, ref } from "vue";
import CallParticipants from "./CallParticipants.vue";
import CallStage, { type CallStageAction } from "./CallStage.vue";
import CallStageMini from "./CallStageMini.vue";

/** The running call: `CallStage` on screen, `CallStageMini` while minimized. */
const props = defineProps<{
  stage?: {
    title?: string;
    subtitle?: string;
    featuredId?: string;
    featuredLabel?: string;
    action?: CallStageAction | null;
    beforeEnd?: () => unknown;
  };
}>();
const emit = defineEmits<{ stageAction: [] }>();

const callStore = useCallStore();
const { t } = useLocalI18n(chat);

// Named after the conversation the call belongs to: the other person, or the group.
const chatStore = useChatStore();
const callTitle = computed(() => {
  const contact = callStore.channelId ? chatStore.getContactById(callStore.channelId) : null;
  const name = contact ? `${contact.name} ${contact.lastName ?? ""}`.trim() : "";
  return name || t("chat.call.title");
});
const stage = computed(() => props.stage ?? {});

const { participants, remoteVideos, remoteRefs, reattach, soundBlocked, enableSound, toggleAudio, toggleVideo } =
  useCall();

// The stage's videos are muted views; the others' sound plays from these, whatever is on screen.
const bindSound = (id: string, el: unknown) => {
  const video = (el as HTMLVideoElement | null) ?? null;
  if (remoteRefs.value[id] === video) return;
  remoteRefs.value[id] = video;
  if (video) void reattach();
};

// Ctrl+D the microphone, Ctrl+E the camera (⌘ on a Mac), while the call is open.
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (!callStore.isActive || callStore.isMinimized) return;
  if (!(isMac ? event.metaKey : event.ctrlKey) || event.altKey || event.shiftKey) return;
  const key = event.key.toLowerCase();
  if (key !== "d" && key !== "e") return;
  event.preventDefault();
  if (key === "d") toggleAudio();
  else toggleVideo();
});

const peopleOpen = ref(false);
</script>

<template>
  <!-- Off screen but rendered: iOS pauses a display:none video. -->
  <div aria-hidden="true" class="pointer-events-none fixed top-0 left-0 size-px overflow-hidden opacity-0">
    <video
      v-for="id in Object.keys(remoteVideos)"
      :key="id"
      :ref="(el) => bindSound(id, el)"
      autoplay
      playsinline
      data-testid="call-sound"
    />
  </div>

  <CallStage
    v-if="callStore.isActive && !callStore.isMinimized"
    v-bind="stage"
    :title="stage.title ?? callTitle"
    :sound-blocked="soundBlocked"
    @action="emit('stageAction')"
    @enable-sound="enableSound"
    @people="peopleOpen = true"
  >
    <template v-if="$slots.stageHeaderEnd" #header-end><slot name="stageHeaderEnd" /></template>
    <template #controls><slot name="stageControls" /></template>
  </CallStage>
  <CallStageMini
    v-if="callStore.isActive && callStore.isMinimized"
    :title="stage.subtitle ?? stage.title ?? callTitle"
    :before-end="stage.beforeEnd"
  />

  <CallParticipants v-model:visible="peopleOpen" :participants="participants" />
</template>
