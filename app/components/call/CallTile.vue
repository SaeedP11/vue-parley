<script setup lang="ts">
/**
 * One tile of the call screen: someone's camera, the user's own, or a screen share. It shows the
 * video with the person's name, a mic-off badge, their initial when the camera is off (FR-009),
 * the speaking ring, and a "can't connect" state with Retry (FR-022). The <video> stays mounted
 * whatever shows over it: it also plays the person's sound.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import Avatar from "primevue/avatar";
import BIcon from "~/components/global/BIcon.vue";
import Button from "primevue/button";
import Tooltip from "primevue/tooltip";
import useLocalI18n from "~/composables/useLocalI18n";
import { chat } from "@i18n/locales";
import type { Participant } from "~/composables/call/session";
import type { CallTileInfo } from "~/composables/call/useCallLayout";
import CallButton from "./CallButton.vue";
import CallIcon from "./CallIcon.vue";
import { callButtonDt, focusRing, nameChip, tileActions, tileButton, tip } from "./tokens";
import { avatarToneStyle, nameInitials } from "~/utils/avatar";

const vTooltip = Tooltip;

const props = withDefaults(
  defineProps<{
    tile: CallTileInfo;
    participant: Participant;
    stream?: MediaStream | null;
    speaking?: boolean;
    pinned?: boolean;
    /** Pinning only makes sense once there is someone else to show. */
    canPin?: boolean;
    /** A strip tile: smaller avatar, fewer actions. */
    compact?: boolean;
    paused?: boolean;
    isFullscreen?: boolean;
    /** A line under the avatar when the camera is off, such as "Camera is off". */
    hint?: string;
  }>(),
  { stream: null, speaking: false, pinned: false, canPin: false, compact: false, paused: false, isFullscreen: false },
);

const emit = defineEmits<{
  pin: [];
  pause: [video: HTMLVideoElement | null];
  fullscreen: [root: HTMLElement | null];
  retry: [];
  /** The tile's <video> mounted (`el`) or went away (`null`, with the one that did). */
  video: [el: HTMLVideoElement | null, previous: HTMLVideoElement | null];
}>();

const { t } = useLocalI18n(chat);

const root = ref<HTMLElement | null>(null);
const videoEl = ref<HTMLVideoElement | null>(null);
onMounted(() => emit("video", videoEl.value, null));
onBeforeUnmount(() => emit("video", null, videoEl.value));
defineExpose({ videoEl, root });

const isSelf = computed(() => props.participant.isSelf);
const isScreen = computed(() => props.tile.kind === "screen");
const status = computed(() => props.participant.status);

const name = computed(() => props.participant.name || (isSelf.value ? t("chat.call.you") : ""));
const label = computed(() => {
  if (isScreen.value)
    return isSelf.value ? t("chat.call.yourPresentation") : t("chat.call.presentationOf", { name: name.value });
  return isSelf.value ? t("chat.call.you") : name.value;
});
// The call screen is always dark, so its avatars take the dark tones.
const initials = computed(() => nameInitials(props.participant.name));
const toneStyle = computed(() => avatarToneStyle(props.participant.name, null, "dark"));

const hasVideo = computed(() => !!props.stream?.getVideoTracks().length);
/** Camera off, or none sent at all: the person's initial instead of a black frame. */
const showAvatar = computed(
  () => !isScreen.value && (props.participant.media?.video === false || !hasVideo.value),
);
const muted = computed(() => !isScreen.value && props.participant.media?.audio === false);
const unreachable = computed(() => !isSelf.value && status.value === "unreachable");
const statusText = computed(() => {
  if (isSelf.value) return props.hint;
  if (status.value === "connecting") return t("chat.call.connecting");
  if (status.value === "recovering") return t("chat.call.reconnecting");
  return props.hint;
});

// The ids hosts' tests already use: remote camera tiles with a stream, and remote screens.
const innerTestId = computed(() => {
  if (isSelf.value) return undefined;
  if (isScreen.value) return "call-remote-screen";
  return props.stream ? "call-remote-video" : undefined;
});

const pinLabel = computed(() =>
  props.pinned ? t("chat.call.controls.unpin") : t("chat.call.controls.pin"),
);
const pauseLabel = computed(() =>
  props.paused ? t("chat.call.controls.playVideo") : t("chat.call.controls.pauseVideo"),
);
const fullscreenLabel = computed(() =>
  props.isFullscreen ? t("chat.call.controls.exitFullscreen") : t("chat.call.controls.fullscreen"),
);
</script>

<template>
  <div
    ref="root"
    data-testid="call-tile"
    :data-participant-id="participant.id"
    :data-kind="tile.kind"
    class="group relative min-h-0 min-w-0 overflow-hidden rounded-2xl bg-neutral-800 ring-3 ring-inset transition-shadow [clip-path:inset(0_round_var(--radius-2xl))] motion-reduce:transition-none"
    :class="speaking && !isScreen ? 'ring-sky-400' : 'ring-transparent'"
  >
    <div class="absolute inset-0" :data-testid="innerTestId">
      <video
        ref="videoEl"
        :data-testid="tile.kind === 'self' ? 'call-local-video' : undefined"
        autoplay
        playsinline
        :muted="isSelf || isScreen"
        class="absolute inset-0 size-full rounded-[inherit]"
        :class="[
          isScreen ? 'object-contain' : 'object-cover',
          tile.kind === 'self' && 'pointer-events-none -scale-x-100',
        ]"
      />

      <!-- Camera off or not (yet) sent: the person's initial. -->
      <div
        v-if="showAvatar"
        data-testid="call-tile-avatar"
        class="absolute inset-0 flex flex-col items-center justify-center gap-y-2 bg-neutral-800 px-2 text-center"
      >
        <Avatar
          :label="initials || undefined"
          shape="circle"
          :size="compact ? 'large' : 'xlarge'"
          class="font-semibold select-none"
          :style="toneStyle"
        >
          <template v-if="!initials" #icon><BIcon icon="PhUser" class="size-1/2" /></template>
        </Avatar>
        <p v-if="statusText && !compact" class="text-label-md text-neutral-300 select-none">
          {{ statusText }}
        </p>
      </div>

      <!-- Rebuilding this pair kept failing: say so, and let the user try again. -->
      <div
        v-if="unreachable"
        data-testid="call-tile-unreachable"
        role="status"
        class="absolute inset-0 z-30 flex flex-col items-center justify-center gap-y-3 bg-neutral-900/85 px-3 text-center"
      >
        <p class="text-label-md text-neutral-100" :class="compact && 'sr-only'">
          {{ t("chat.call.cantConnect", { name }) }}
        </p>
        <Button
          :label="compact ? undefined : t('chat.call.controls.retry')"
          :aria-label="t('chat.call.controls.retry')"
          :dt="callButtonDt"
          severity="contrast"
          rounded
          size="small"
          data-testid="call-tile-retry"
          :class="['min-h-11 min-w-11', focusRing]"
          @click="emit('retry')"
        >
          <template #icon>
            <CallIcon name="refresh" class="size-5" />
          </template>
        </Button>
      </div>

      <!-- Clear of the actions at the end: the pin alone on a strip tile, three otherwise. -->
      <div
        class="absolute start-2 bottom-2 z-20 flex items-center gap-x-1.5"
        :class="compact ? 'max-w-[calc(100%-3.5rem)]' : 'max-w-[60%]'"
      >
        <span
          v-if="isScreen"
          class="flex size-7 shrink-0 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm"
        >
          <CallIcon name="presentToAll" class="size-4" />
        </span>
        <span
          v-if="muted"
          data-testid="call-tile-muted"
          role="img"
          :aria-label="t('chat.call.muted')"
          class="flex size-7 shrink-0 items-center justify-center rounded-full bg-red-500 text-white"
        >
          <CallIcon name="micOff" class="size-4" />
        </span>
        <span :class="nameChip"><bdi>{{ label }}</bdi></span>
      </div>

      <div v-if="!unreachable" :class="tileActions">
        <CallButton
          v-if="canPin"
          v-tooltip.top="tip(pinLabel)"
          :icon="pinned ? 'keepOff' : 'keep'"
          :label="pinLabel"
          :aria-pressed="pinned"
          v-bind="tileButton"
          :class="focusRing"
          data-testid="call-pin"
          @click="emit('pin')"
        />
        <template v-if="!compact && !showAvatar">
          <CallButton
            v-tooltip.top="tip(pauseLabel)"
            :icon="paused ? 'play' : 'pause'"
            :label="pauseLabel"
            v-bind="tileButton"
            :class="focusRing"
            @click="emit('pause', videoEl)"
          />
          <CallButton
            v-tooltip.top="tip(fullscreenLabel)"
            :icon="isFullscreen ? 'fullscreenExit' : 'fullscreen'"
            :label="fullscreenLabel"
            v-bind="tileButton"
            :class="focusRing"
            @click="emit('fullscreen', root)"
          />
        </template>
      </div>
    </div>
  </div>
</template>
