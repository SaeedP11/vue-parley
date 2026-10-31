<script setup lang="ts">
import { useCallStore } from "~/stores/callStore";
import { useChatStore } from "~/stores/chatStore";
import { formatDuration } from "~/utils/format";
import useLocalI18n, { useDirection } from "~/composables/useLocalI18n";
import { chat } from "@i18n/locales";
import useCall from "~/composables/useCall";
import { useSpeaking } from "~/composables/call/useSpeaking";
import { useCallLayout, type CallTileInfo } from "~/composables/call/useCallLayout";
import { useCallNotices } from "~/composables/call/useCallNotices";
import type { Participant } from "~/composables/call/session";
import { useDraggable, useElementSize, useEventListener, useWindowSize } from "@vueuse/core";
import { ref, computed, watch, onMounted, nextTick, onBeforeUnmount } from "vue";
import Button from "primevue/button";
import Menu from "primevue/menu";
import Tooltip from "primevue/tooltip";
import type { MenuItem } from "primevue/menuitem";
import CallButton from "./CallButton.vue";
import CallIcon from "./CallIcon.vue";
import CallTile from "./CallTile.vue";
import CallParticipants from "./CallParticipants.vue";
import { callButtonDt, callMenuDt, focusRing, tip } from "./tokens";

const vTooltip = Tooltip;

const callStore = useCallStore();
const minimizedRef = ref<HTMLElement | null>(null);
const bodyRef = ref<HTMLElement | null>(null);

const { t, locale } = useLocalI18n(chat);
const { dir } = useDirection();

// Named after the conversation the call belongs to: the other person, or the group.
const chatStore = useChatStore();
const callTitle = computed(() => {
  const contact = callStore.channelId ? chatStore.getContactById(callStore.channelId) : null;
  const name = contact ? `${contact.name} ${contact.lastName ?? ""}`.trim() : "";
  return name || t("chat.call.title");
});

// What kind of call this was started as. Either side can still turn its camera on or off.
const callKind = computed(() =>
  callStore.isVideoCall
    ? { icon: "videocam" as const, label: t("chat.call.videoCall") }
    : { icon: "call" as const, label: t("chat.call.voiceCall") },
);

// Tiles move between the grid, the stage and the strip, remounting their <video>: the streams
// are attached again whenever the arrangement changes.
const layoutKey = ref("");

const {
  toggleVideoPause,
  toggleRemote,
  participantCount,
  participants,
  phase,
  hadOthers,
  endCall,
  toggleFullscreen,
  toggleFlashlight,
  toggleScreenShare,
  toggleAudio,
  toggleVideo,
  switchCamera,
  flipCamera,
  canFlipCamera,
  facingMode,
  isFlashlightSupported,
  isAudioOn,
  isVideoOn,
  isFlashlightOn,
  isFullscreen,
  canFullscreen,
  isScreenSharing,
  showControls,
  resetControlsTimeout,
  cameras,
  videoPaused,
  localStream,
  localVideo,
  localScreen,
  remoteRefs,
  remoteScreenRefs,
  remoteVideos,
  soundBlocked,
  enableSound,
  reattach,
  retryPeer,
} = useCall({ layoutKey: () => layoutKey.value });

// --- Layout ---

const stageRef = ref<HTMLElement | null>(null);
const { width: stageWidth, height: stageHeight } = useElementSize(stageRef);
const layout = useCallLayout({ participants, width: stageWidth, height: stageHeight });
watch(layout.key, (key) => (layoutKey.value = key), { immediate: true });
const portrait = computed(() => layout.orientation.value === "portrait");

const participantById = computed(
  () => new Map(participants.value.map((p) => [p.id, p] as const)),
);
const participantOf = (tile: CallTileInfo) => participantById.value.get(tile.participantId)!;
const streamOf = (tile: CallTileInfo) => {
  const p = participantOf(tile);
  return (tile.kind === "screen" ? p?.screen : p?.camera) ?? null;
};
const speakingOf = (tile: CallTileInfo) =>
  tile.kind === "self" ? !!speaking.self : tile.kind === "camera" && !!speaking[tile.participantId];

// The tile on the other end in a one-to-one call, and the user's own.
const pairRemote = computed(() => layout.tiles.value.find((t) => t.kind === "camera") ?? null);
const selfTile = computed(() => layout.tiles.value.find((t) => t.kind === "self")!);
const canPin = computed(() => participants.value.length > 1 || isScreenSharing.value);

/** Keeps the view's <video> refs pointing at whichever tile currently shows each stream. */
function bindVideo(tile: CallTileInfo, el: HTMLVideoElement | null, previous: HTMLVideoElement | null) {
  const pid = tile.participantId;
  // A tile going away only clears the ref if no newer tile has taken it over already.
  const next = <T,>(current: T) => (el ?? (current === previous ? null : current)) as T;
  if (tile.kind === "self") localVideo.value = next(localVideo.value);
  else if (tile.id === "self_screen") localScreen.value = next(localScreen.value);
  else if (tile.kind === "camera") remoteRefs.value[pid] = next(remoteRefs.value[pid] ?? null);
  else remoteScreenRefs.value[pid] = next(remoteScreenRefs.value[pid] ?? null) ?? undefined;
  if (el) void reattach();
}

const togglePause = (tile: CallTileInfo, el: HTMLVideoElement | null) => toggleVideoPause(tile.id, el);
const toggleTileFullscreen = (tile: CallTileInfo, el: HTMLElement | null) => {
  if (el) toggleRemote(tile.id, el);
};

// --- Waiting, notices, people ---

const waitingText = computed(() =>
  hadOthers.value ? t("chat.call.everyoneLeft") : t("chat.call.waiting"),
);
const showWaiting = computed(() => layout.mode.value === "solo" && phase.value === "waiting");

const notices = useCallNotices(
  participants,
  (key, params, plural) => t(key, params, plural),
  () => t("chat.call.andJoin"),
  () => String(locale.value),
);

const peopleOpen = ref(false);
const peopleLabel = computed(
  () => `${t("chat.call.controls.people")} (${t("chat.call.participants", participantCount.value)})`,
);

// --- Controls ---

// Pills, as in Google Meet: wider than tall, so the bar reads as one row of controls.
const barButton = {
  dt: callButtonDt,
  text: false,
  size: "large",
  iconClass: "size-6",
  class: `h-12! w-12! sm:w-14! ${focusRing}`,
} as const;

// Meet's shortcuts, on the tooltip and in the keyboard: Ctrl+D the microphone, Ctrl+E the camera.
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const keys = (key: string) => (isMac ? `⌘ ${key}` : `Ctrl + ${key}`);
const withKeys = (label: string, key: string) => `${label} (${keys(key)})`;

const audioLabel = computed(() =>
  isAudioOn.value ? t("chat.call.controls.mute") : t("chat.call.controls.unmute"),
);
const videoLabel = computed(() =>
  isVideoOn.value ? t("chat.call.controls.cameraOff") : t("chat.call.controls.cameraOn"),
);
const shareLabel = computed(() =>
  isScreenSharing.value
    ? t("chat.call.controls.stopSharing")
    : t("chat.call.controls.shareScreen"),
);
// Names where the flip goes, so a screen reader hears more than "switch".
const flipLabel = computed(() =>
  facingMode.value === "environment"
    ? t("chat.call.controls.frontCamera")
    : t("chat.call.controls.backCamera"),
);
const showCameraPicker = computed(() => cameras.value.length > 1 && !canFlipCamera.value);

// One flip at a time: a second tap mid-flip would race the first for the camera.
const isFlipping = ref(false);
const flip = async () => {
  if (isFlipping.value) return;
  isFlipping.value = true;
  try {
    await flipCamera();
  } finally {
    isFlipping.value = false;
  }
};

const fullscreenLabel = computed(() =>
  isFullscreen.value
    ? t("chat.call.controls.exitFullscreen")
    : t("chat.call.controls.fullscreen"),
);

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (!callStore.isActive || callStore.isMinimized) return;
  if (!(isMac ? event.metaKey : event.ctrlKey) || event.altKey || event.shiftKey) return;
  const key = event.key.toLowerCase();
  if (key !== "d" && key !== "e") return;
  // Both are browser shortcuts too (bookmark, search), which the call takes over while it's open.
  event.preventDefault();
  if (key === "d") toggleAudio();
  else toggleVideo();
});

// The camera in use: read off the track when the call starts, then whatever was picked.
const currentCameraId = ref<string | null>(null);
watch(
  localStream,
  (stream) => {
    currentCameraId.value = stream?.getVideoTracks()[0]?.getSettings().deviceId ?? null;
  },
  { immediate: true },
);

const cameraMenu = ref<InstanceType<typeof Menu> | null>(null);
const cameraItems = computed<MenuItem[]>(() => [
  {
    label: t("chat.call.controls.cameras"),
    items: cameras.value.map((camera, index) => ({
      label: camera.label || `${t("chat.call.controls.chooseCamera")} ${index + 1}`,
      callIcon: camera.deviceId === currentCameraId.value ? "check" : undefined,
      command: async () => {
        currentCameraId.value = camera.deviceId;
        await switchCamera(camera.deviceId);
        // A failed switch falls back to the previous camera.
        currentCameraId.value =
          localStream.value?.getVideoTracks()[0]?.getSettings().deviceId ?? null;
      },
    })),
  },
]);

const moreMenu = ref<InstanceType<typeof Menu> | null>(null);
const moreItems = computed<MenuItem[]>(() => [
  ...(isFlashlightSupported.value
    ? [
        {
          label: isFlashlightOn.value
            ? t("chat.call.controls.flashlightOff")
            : t("chat.call.controls.flashlightOn"),
          callIcon: isFlashlightOn.value ? "flashlightOff" : "flashlightOn",
          command: () => toggleFlashlight(),
        },
      ]
    : []),
]);

// --- Speaking ---

const speaking = useSpeaking(() => ({
  self: isAudioOn.value ? localStream.value : null,
  ...Object.fromEntries(
    Object.entries(remoteVideos.value).map(([id, remote]) => [id, remote.stream]),
  ),
}));

// --- Picture-in-picture ---

// Minimized, the call plays live behind its controls: whoever is speaking (or the one picked with
// the count button), or the user's own camera when nobody else is there.
const pipVideoRef = ref<HTMLVideoElement | null>(null);
const activeRemoteIndex = ref(0);

const remoteVideoEntries = computed(() => Object.entries(remoteVideos.value));
const hasRemoteVideos = computed(() => remoteVideoEntries.value.length > 0);
const activeRemoteUserId = computed<string | null>(() => {
  const entries = remoteVideoEntries.value;
  if (entries.length === 0) return null;
  return entries[activeRemoteIndex.value % entries.length]![0];
});

const pipStream = computed<MediaStream | null>(() => {
  if (hasRemoteVideos.value) {
    const id = activeRemoteUserId.value;
    return id ? (remoteVideos.value[id]?.stream ?? null) : null;
  }
  return localStream.value ?? null;
});

function cycleRemote() {
  const count = remoteVideoEntries.value.length;
  if (count === 0) return;
  activeRemoteIndex.value = (activeRemoteIndex.value + 1) % count;
}

// Follows whoever speaks, after a moment, so a cough doesn't flip the picture back and forth.
const speakerIndex = computed(() =>
  remoteVideoEntries.value.findIndex(([id]) => speaking[id]),
);
let speakerTimer: ReturnType<typeof setTimeout> | undefined;
watch(speakerIndex, (index) => {
  clearTimeout(speakerTimer);
  if (index < 0 || index === activeRemoteIndex.value % remoteVideoEntries.value.length) return;
  speakerTimer = setTimeout(() => (activeRemoteIndex.value = index), 1_500);
});
onBeforeUnmount(() => clearTimeout(speakerTimer));

watch(
  [pipStream, () => callStore.isMinimized],
  async () => {
    await nextTick();
    const el = pipVideoRef.value;
    if (!el) return;
    const stream = pipStream.value;
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
    } else if (!stream && el.srcObject) {
      el.srcObject = null;
    }
  },
  { immediate: true },
);

onMounted(() => {
  bodyRef.value = document.body;
});

// Dragged anywhere, then snapped to the nearest corner on release.
const { width: windowWidth, height: windowHeight } = useWindowSize();

const PIP_WIDTH = 280; // w-70
const PIP_HEIGHT = 160; // h-40
const PADDING = 16;
// Top and bottom corners stay this far from the edges, clear of the chat header and the composer.
const PIP_INSET_Y = 96;

const { x, y, isDragging } = useDraggable(minimizedRef, {
  initialValue: {
    x: typeof window !== "undefined" ? window.innerWidth - PIP_WIDTH - PADDING : PADDING,
    y: PIP_INSET_Y,
  },
  disabled: computed(() => !callStore.isMinimized),
});

watch(isDragging, (dragging) => {
  if (!dragging && callStore.isMinimized) {
    const maxX = windowWidth.value - PIP_WIDTH - PADDING;
    const maxY = windowHeight.value - PIP_HEIGHT - PIP_INSET_Y;
    x.value = x.value < windowWidth.value / 2 ? PADDING : maxX;
    y.value = y.value < windowHeight.value / 2 ? PIP_INSET_Y : maxY;
  }
});

// Each time it is minimized it starts in the top corner on the reading end.
watch(
  () => callStore.isMinimized,
  (isMinimized) => {
    if (isMinimized) {
      nextTick(() => {
        const isRtl = dir.value === "rtl";
        x.value = isRtl ? PADDING : windowWidth.value - PIP_WIDTH - PADDING;
        // The top corner, where it covers older messages rather than the composer.
        y.value = PIP_INSET_Y;
      });
    }
  },
  { immediate: true },
);

// Kept on screen whatever the window does.
const clampedStyle = computed(() => {
  if (!callStore.isMinimized) return {};

  const maxX = windowWidth.value - PIP_WIDTH - PADDING;
  const maxY = windowHeight.value - PIP_HEIGHT - PADDING;

  return {
    left: `${Math.max(PADDING, Math.min(x.value, maxX))}px`,
    top: `${Math.max(PADDING, Math.min(y.value, maxY))}px`,
  };
});

/** What every CallTile on the stage gets, apart from its layout classes. */
const tileProps = (tile: CallTileInfo, compact = false) => ({
  tile,
  participant: participantOf(tile) as Participant,
  stream: streamOf(tile),
  speaking: speakingOf(tile),
  pinned: layout.pinnedId.value === tile.id,
  canPin: canPin.value,
  compact,
  paused: !!videoPaused.value[tile.id],
  isFullscreen: isFullscreen.value,
  // The user's own camera shows as a mirror, as people expect; the back one shows the world as is.
  mirrored: tile.kind === "self" && facingMode.value !== "environment",
});
</script>

<template>
  <!-- Picture-in-picture: the call shrunk to a draggable window over the app. -->
  <div
    v-if="callStore.isActive && callStore.isMinimized"
    ref="minimizedRef"
    data-testid="call-pip"
    :style="clampedStyle"
    :dir="dir"
    class="vue-chat font-chat-family fixed z-9999 h-40 w-70 cursor-move touch-none overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl ring-1 ring-white/10"
    :class="[!isDragging && 'transition-all duration-300 ease-out motion-reduce:transition-none']"
  >
    <video
      ref="pipVideoRef"
      muted
      autoplay
      playsinline
      class="pointer-events-none absolute inset-0 size-full object-cover"
    />
    <div
      class="pointer-events-none absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-black/30"
    />

    <div class="absolute inset-x-3 top-3 flex items-center justify-between">
      <div
        class="flex items-center gap-x-2 rounded-full bg-black/45 px-3 py-1.5 text-label-sm text-white backdrop-blur-sm select-none"
      >
        <span class="relative flex size-2.5">
          <span class="absolute inline-flex size-full animate-ping rounded-full bg-red-500/60 motion-reduce:animate-none" />
          <span class="relative inline-flex size-2.5 rounded-full bg-red-500" />
        </span>
        <CallIcon :name="callKind.icon" class="size-4" />
        <span class="sr-only">{{ callKind.label }}</span>
        <span dir="ltr" class="tabular-nums">{{ formatDuration(callStore.elapsedTime) }}</span>
      </div>

      <CallButton
        icon="callEnd"
        :label="t('chat.call.controls.endCall')"
        severity="danger"
        :dt="callButtonDt"
        :text="false"
        icon-class="size-5"
        class="h-9! w-12!"
        data-testid="call-pip-end"
        @pointerdown.stop
        @click.stop="endCall"
      />
    </div>

    <div class="absolute inset-x-3 bottom-3 flex items-center justify-between">
      <div class="flex items-center gap-1.5">
        <Button
          :label="String(participantCount)"
          :aria-label="t('chat.call.controls.nextParticipant')"
          :disabled="!hasRemoteVideos"
          :dt="callButtonDt"
          severity="secondary"
          size="small"
          rounded
          class="h-8!"
          @pointerdown.stop
          @click.stop="cycleRemote"
        >
          <template #icon>
            <CallIcon name="group" class="size-4" />
          </template>
        </Button>

        <span
          v-if="!isAudioOn"
          class="flex size-8 items-center justify-center rounded-full bg-red-500 text-white"
        >
          <CallIcon name="micOff" class="size-4" />
        </span>
        <span
          v-if="!isVideoOn"
          class="flex size-8 items-center justify-center rounded-full bg-red-500 text-white"
        >
          <CallIcon name="videocamOff" class="size-4" />
        </span>
      </div>

      <CallButton
        icon="openInFull"
        :label="t('chat.call.controls.maximize')"
        :dt="callButtonDt"
        :text="false"
        icon-class="size-4.5"
        class="size-9!"
        data-testid="call-maximize"
        @pointerdown.stop
        @click.stop="callStore.maximize()"
      />
    </div>
  </div>

  <!-- The full call screen. -->
  <div
    v-show="callStore.isActive && !callStore.isMinimized"
    data-testid="call-view"
    :dir="dir"
    class="vue-chat font-chat-family fixed inset-0 z-60 flex size-full flex-col bg-neutral-900 text-white"
  >
    <!-- Top bar: what the call is, how long it has run, and who is in it. -->
    <div
      data-testid="call-top-bar"
      class="flex h-14 shrink-0 items-center gap-x-3 px-3 transition-opacity duration-300 motion-reduce:transition-none md:h-16 md:px-6"
      :class="showControls ? 'opacity-100' : 'opacity-0'"
      @mouseenter="resetControlsTimeout"
    >
      <div class="flex min-w-0 flex-1 items-center gap-x-3 select-none">
        <span
          data-testid="call-kind"
          :data-video="callStore.isVideoCall"
          aria-hidden="true"
          class="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <CallIcon :name="callKind.icon" class="size-5" />
        </span>
        <div class="min-w-0">
          <h1 class="truncate text-title-sm text-white">{{ callTitle }}</h1>
          <p class="flex items-center gap-x-1.5 text-label-sm text-neutral-300">
            <span class="truncate">{{ callKind.label }}</span>
            <span aria-hidden="true">·</span>
            <span dir="ltr" class="shrink-0 tabular-nums">{{ formatDuration(callStore.elapsedTime) }}</span>
          </p>
        </div>
      </div>

      <div data-testid="call-participants" class="flex shrink-0 items-center gap-x-2">
        <Button
          v-tooltip.bottom="tip(peopleLabel)"
          :aria-label="peopleLabel"
          aria-haspopup="dialog"
          :aria-expanded="peopleOpen"
          :dt="callButtonDt"
          severity="secondary"
          rounded
          data-testid="call-people-button"
          :class="['h-11! gap-x-1.5! px-3.5!', focusRing]"
          @click="peopleOpen = true"
        >
          <CallIcon name="group" class="size-5" />
          <span data-testid="call-participant-count" aria-hidden="true" class="text-label-md tabular-nums">
            {{ participantCount }}
          </span>
        </Button>
        <CallButton
          v-if="canFullscreen"
          v-tooltip.bottom="tip(fullscreenLabel)"
          :icon="isFullscreen ? 'fullscreenExit' : 'fullscreen'"
          :label="fullscreenLabel"
          :dt="callButtonDt"
          :text="false"
          icon-class="size-5"
          :class="['size-11!', focusRing]"
          data-testid="call-fullscreen"
          :data-active="isFullscreen"
          @click="toggleFullscreen()"
        />
        <CallButton
          v-tooltip.bottom="tip(t('chat.call.controls.minimize'))"
          icon="pictureInPicture"
          :label="t('chat.call.controls.minimize')"
          :dt="callButtonDt"
          :text="false"
          icon-class="size-5"
          :class="['size-11!', focusRing]"
          data-testid="call-minimize"
          @click="callStore.minimize"
        />
      </div>
    </div>

    <!-- Stage -->
    <div
      ref="stageRef"
      class="relative min-h-0 flex-1 px-2 pb-2 md:px-4 md:pb-4"
      style="--call-gap: 0.5rem"
      @mousemove="resetControlsTimeout"
    >
      <!-- The browser blocked the others' sound until a tap: they play muted until then. -->
      <Button
        v-if="soundBlocked"
        :label="t('chat.call.controls.enableSound')"
        :dt="callButtonDt"
        severity="contrast"
        rounded
        data-testid="call-enable-sound"
        class="absolute! top-4 left-1/2 z-40 -translate-x-1/2 shadow-lg"
        @click="enableSound"
      >
        <template #icon>
          <CallIcon name="volumeUp" class="size-5" />
        </template>
      </Button>

      <!-- Someone joined or left. Read out too, without moving focus. -->
      <Transition
        enter-active-class="transition duration-200 motion-reduce:transition-none"
        enter-from-class="opacity-0 -translate-y-2"
        leave-active-class="transition duration-200 motion-reduce:transition-none"
        leave-to-class="opacity-0"
      >
        <div
          v-if="notices.current.value && !soundBlocked"
          :key="notices.current.value.id"
          data-testid="call-notice"
          class="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center px-4"
        >
          <span class="max-w-full truncate rounded-full bg-black/70 px-4 py-1.5 text-label-md text-white shadow-lg backdrop-blur-sm">
            <bdi>{{ notices.current.value.text }}</bdi>
          </span>
        </div>
      </Transition>
      <span class="sr-only" aria-live="polite">{{ notices.liveText.value }}</span>

      <!-- Alone: the user's own camera, with what the call is waiting for. -->
      <template v-if="layout.mode.value === 'solo'">
        <CallTile
          :key="selfTile.id"
          v-bind="tileProps(selfTile)"
          :hint="t('chat.call.cameraIsOff')"
          class="size-full"
          @video="(el, prev) => bindVideo(selfTile, el, prev)"
          @pause="(el) => togglePause(selfTile, el)"
          @fullscreen="(el) => toggleTileFullscreen(selfTile, el)"
        />
        <div
          v-if="showWaiting"
          data-testid="call-waiting"
          role="status"
          class="pointer-events-none absolute inset-x-0 top-8 z-30 flex justify-center px-4"
        >
          <div class="max-w-full rounded-2xl bg-black/65 px-5 py-3 text-center shadow-lg backdrop-blur-sm">
            <p class="truncate text-title-sm text-white">{{ callTitle }}</p>
            <p class="mt-0.5 flex items-center justify-center gap-x-1.5 text-label-sm text-neutral-300">
              <CallIcon :name="callKind.icon" class="size-4" />
              {{ callKind.label }}
            </p>
            <p class="mt-1 text-label-md text-neutral-200">{{ waitingText }}</p>
          </div>
        </div>
      </template>

      <!-- One other person: they fill the stage, the user's own camera floats in a corner. -->
      <!-- Handlers take the tile from the loop, not the computed: a tile's last events come as it
           unmounts, after the computed has moved on. -->
      <template v-else-if="layout.mode.value === 'pair' && pairRemote">
        <CallTile
          v-for="tile in [pairRemote]"
          :key="tile.id"
          v-bind="tileProps(tile)"
          class="size-full"
          @pin="layout.togglePin(tile.id)"
          @retry="retryPeer(tile.participantId)"
          @video="(el, prev) => bindVideo(tile, el, prev)"
          @pause="(el) => togglePause(tile, el)"
          @fullscreen="(el) => toggleTileFullscreen(tile, el)"
        />
        <CallTile
          :key="selfTile.id"
          v-bind="tileProps(selfTile, true)"
          :can-pin="false"
          class="absolute! end-5 bottom-4 z-10 aspect-video w-36 shadow-xl outline outline-white/25 sm:w-56 md:end-6 md:bottom-6 md:w-64"
          @video="(el, prev) => bindVideo(selfTile, el, prev)"
        />
      </template>

      <!-- Two or three others: everyone a tile of a 2×2 grid. -->
      <div v-else-if="layout.mode.value === 'grid'" :class="layout.gridClass">
        <CallTile
          v-for="(tile, index) in layout.gridTiles.value"
          :key="tile.id"
          v-bind="tileProps(tile)"
          :class="['size-full', layout.cellClass(index)]"
          @pin="layout.togglePin(tile.id)"
          @retry="retryPeer(tile.participantId)"
          @video="(el, prev) => bindVideo(tile, el, prev)"
          @pause="(el) => togglePause(tile, el)"
          @fullscreen="(el) => toggleTileFullscreen(tile, el)"
        />
      </div>

      <!-- A screen share or a pinned tile on the stage, everyone else in a strip: along the
           bottom on a tall screen, along the inline end on a wide one. -->
      <div
        v-else-if="layout.stageTile.value"
        class="flex size-full gap-(--call-gap)"
        :class="portrait ? 'flex-col' : 'flex-row'"
      >
        <CallTile
          v-for="tile in [layout.stageTile.value]"
          :key="tile.id"
          v-bind="tileProps(tile)"
          data-stage="true"
          class="min-h-0 min-w-0 flex-1"
          @pin="layout.togglePin(tile.id)"
          @retry="retryPeer(tile.participantId)"
          @video="(el, prev) => bindVideo(tile, el, prev)"
          @pause="(el) => togglePause(tile, el)"
          @fullscreen="(el) => toggleTileFullscreen(tile, el)"
        />
        <div
          v-if="layout.stripTiles.value.length"
          data-testid="call-strip"
          class="hide-scrollbar flex shrink-0 gap-(--call-gap)"
          :class="portrait ? 'h-24 flex-row overflow-x-auto sm:h-28' : 'w-40 flex-col overflow-y-auto lg:w-56'"
        >
          <CallTile
            v-for="tile in layout.stripTiles.value"
            :key="tile.id"
            v-bind="tileProps(tile, true)"
            class="aspect-video shrink-0"
            :class="portrait ? 'h-full' : 'w-full'"
            @pin="layout.togglePin(tile.id)"
            @retry="retryPeer(tile.participantId)"
            @video="(el, prev) => bindVideo(tile, el, prev)"
          />
        </div>
      </div>
    </div>

    <!-- Control bar -->
    <div
      class="flex h-20 shrink-0 items-center justify-center px-3 transition-opacity duration-300 motion-reduce:transition-none md:px-6"
      :class="showControls ? 'opacity-100' : 'opacity-0'"
      @mouseenter="resetControlsTimeout"
      @mousemove="resetControlsTimeout"
    >
      <div class="flex items-center justify-center gap-x-2 sm:gap-x-3">
        <CallButton
          v-tooltip.top="tip(withKeys(audioLabel, 'D'))"
          :icon="isAudioOn ? 'mic' : 'micOff'"
          :label="audioLabel"
          :severity="isAudioOn ? 'secondary' : 'danger'"
          :aria-keyshortcuts="isMac ? 'Meta+D' : 'Control+D'"
          v-bind="barButton"
          data-testid="call-toggle-audio"
          :data-active="isAudioOn"
          @click="toggleAudio"
        />

        <!-- The camera, with Meet's caret for picking which one when there are several (a phone
             flips between its two sides instead, with the button after this one). -->
        <div class="flex items-center rounded-full" :class="showCameraPicker && 'bg-white/12'">
          <CallButton
            v-if="showCameraPicker"
            v-tooltip.top="tip(t('chat.call.controls.chooseCamera'))"
            icon="arrowDropUp"
            :label="t('chat.call.controls.chooseCamera')"
            :dt="callButtonDt"
            text
            severity="secondary"
            icon-class="size-6"
            :class="['h-12! w-8! rounded-e-none! ps-1!', focusRing]"
            aria-haspopup="true"
            @click="cameraMenu?.toggle($event)"
          />
          <CallButton
            v-tooltip.top="tip(withKeys(videoLabel, 'E'))"
            :icon="isVideoOn ? 'videocam' : 'videocamOff'"
            :label="videoLabel"
            :severity="isVideoOn ? 'secondary' : 'danger'"
            :aria-keyshortcuts="isMac ? 'Meta+E' : 'Control+E'"
            v-bind="barButton"
            data-testid="call-toggle-video"
            :data-active="isVideoOn"
            @click="toggleVideo"
          />
        </div>

        <CallButton
          v-if="canFlipCamera"
          v-tooltip.top="tip(flipLabel)"
          icon="cameraSwitch"
          :label="flipLabel"
          :disabled="!isVideoOn || isFlipping"
          v-bind="barButton"
          data-testid="call-flip-camera"
          :data-facing="facingMode ?? undefined"
          @click="flip"
        />

        <CallButton
          v-if="callStore.canShareScreen"
          v-tooltip.top="tip(shareLabel)"
          :icon="isScreenSharing ? 'cancelPresentation' : 'presentToAll'"
          :label="shareLabel"
          :severity="isScreenSharing ? 'contrast' : 'secondary'"
          v-bind="barButton"
          data-testid="call-toggle-screen"
          :data-active="isScreenSharing"
          @click="toggleScreenShare"
        />

        <!-- Only the flashlight is left in it: no menu where the device has none. -->
        <CallButton
          v-if="moreItems.length"
          v-tooltip.top="tip(t('chat.call.controls.more'))"
          icon="moreVert"
          :label="t('chat.call.controls.more')"
          v-bind="barButton"
          class="h-12! w-10! sm:w-12!"
          aria-haspopup="true"
          data-testid="call-more"
          @click="moreMenu?.toggle($event)"
        />

        <CallButton
          v-tooltip.top="tip(t('chat.call.controls.endCall'))"
          icon="callEnd"
          :label="t('chat.call.controls.endCall')"
          severity="danger"
          :dt="callButtonDt"
          :text="false"
          size="large"
          icon-class="size-6"
          :class="['h-12! w-16! sm:w-18!', focusRing]"
          data-testid="call-end"
          @click="endCall"
        />
      </div>
    </div>

    <CallParticipants v-model:visible="peopleOpen" :participants="participants" />

    <Menu ref="cameraMenu" :model="cameraItems" popup :dir="dir" :dt="callMenuDt" class="vue-chat">
      <template #itemicon="{ item }">
        <CallIcon v-if="item.callIcon" :name="item.callIcon" class="size-5 text-sky-400" />
        <span v-else class="size-5" />
      </template>
    </Menu>
    <Menu ref="moreMenu" :model="moreItems" popup :dir="dir" :dt="callMenuDt" class="vue-chat">
      <template #itemicon="{ item }">
        <CallIcon :name="item.callIcon" class="size-5 text-neutral-400" />
      </template>
    </Menu>
  </div>
</template>
