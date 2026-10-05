<script setup lang="ts">
import { useCallStore } from "~/stores/callStore";
import { useChatStore } from "~/stores/chatStore";
import { formatDuration } from "~/utils/format";
import useLocalI18n, { useDirection } from "~/composables/useLocalI18n";
import { chat } from "@i18n/locales";
import useCall from "~/composables/useCall";
import { useSpeaking } from "~/composables/call/useSpeaking";
import { useDraggable, useEventListener, useWindowSize } from "@vueuse/core";
import { ref, computed, watch, onMounted, nextTick } from "vue";
import Avatar from "primevue/avatar";
import Button from "primevue/button";
import Menu from "primevue/menu";
import Tooltip from "primevue/tooltip";
import type { MenuItem } from "primevue/menuitem";
import CallButton from "./CallButton.vue";
import CallIcon from "./CallIcon.vue";

const vTooltip = Tooltip;

const callStore = useCallStore();
const minimizedRef = ref<HTMLElement | null>(null);
const bodyRef = ref<HTMLElement | null>(null);

const { t } = useLocalI18n(chat);
const { dir } = useDirection();

// Named after whoever is on the other end of the conversation the call belongs to.
const chatStore = useChatStore();
const callTitle = computed(() => {
  const contact = callStore.channelId ? chatStore.getContactById(callStore.channelId) : null;
  const name = contact ? `${contact.name} ${contact.lastName ?? ""}`.trim() : "";
  return name || t("chat.call.title");
});

const {
  toggleVideoPause,
  toggleRemote,
  participantCount,
  endCall,
  toggleFullscreen,
  toggleFlashlight,
  toggleScreenShare,
  toggleAudio,
  toggleVideo,
  switchCamera,
  isFlashlightSupported,
  tileCount,
  isAudioOn,
  isVideoOn,
  isFlashlightOn,
  isFullscreen,
  isScreenSharing,
  showControls,
  resetControlsTimeout,
  cameras,
  videoPaused,
  localStream,
  localVideo,
  localScreen,
  remoteParents,
  remoteRefs,
  remoteScreens,
  remoteScreenRefs,
  remoteVideos,
  soundBlocked,
  enableSound,
} = useCall();

// --- Controls ---

// The call screen is dark whatever the host's colour scheme, so its controls use fixed tokens
// instead of the theme's: translucent white at rest, white when a feature is on (Meet's "lit"),
// red when the microphone or camera is off.
const translucent = {
  background: "rgb(255 255 255 / 0.12)",
  hoverBackground: "rgb(255 255 255 / 0.2)",
  activeBackground: "rgb(255 255 255 / 0.28)",
  borderColor: "transparent",
  hoverBorderColor: "transparent",
  activeBorderColor: "transparent",
  color: "#ffffff",
  hoverColor: "#ffffff",
  activeColor: "#ffffff",
};
const lit = {
  background: "#ffffff",
  hoverBackground: "rgb(255 255 255 / 0.9)",
  activeBackground: "rgb(255 255 255 / 0.8)",
  borderColor: "#ffffff",
  hoverBorderColor: "#ffffff",
  activeBorderColor: "#ffffff",
  color: "#171717",
  hoverColor: "#171717",
  activeColor: "#171717",
};
// Tailwind's red-500 to red-700.
const off = {
  background: "#ef4444",
  hoverBackground: "#dc2626",
  activeBackground: "#b91c1c",
  borderColor: "transparent",
  hoverBorderColor: "transparent",
  activeBorderColor: "transparent",
  color: "#ffffff",
  hoverColor: "#ffffff",
  activeColor: "#ffffff",
};
const callScheme = { root: { secondary: translucent, contrast: lit, danger: off } };
const callButtonDt = { colorScheme: { light: callScheme, dark: callScheme } };

// Its menus are dark too, Tailwind's neutral-800 under white text, in either host scheme.
const callMenuDt = {
  root: { background: "#262626", borderColor: "rgb(255 255 255 / 0.1)", color: "#f5f5f5" },
  item: {
    focusBackground: "rgb(255 255 255 / 0.1)",
    color: "#f5f5f5",
    focusColor: "#ffffff",
    icon: { color: "#a3a3a3", focusColor: "#ffffff" },
  },
  submenuLabel: { background: "transparent", color: "#a3a3a3" },
};

// Pills, as in Google Meet: wider than tall, so the bar reads as one row of controls.
const barButton = {
  dt: callButtonDt,
  text: false,
  size: "large",
  iconClass: "size-6",
  class: "h-12! w-12! sm:w-14!",
} as const;

// Tile actions sit on the video: small round buttons, shown on hover or focus where there is a
// pointer that hovers, always on touch screens.
const tileButton = {
  dt: callButtonDt,
  text: false,
  size: "small",
  iconClass: "size-4.5",
  class: "size-9!",
} as const;
const tileActions =
  "absolute end-2 bottom-2 z-20 flex items-center gap-x-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100";
const nameChip =
  "max-w-[60%] truncate rounded-md bg-black/55 px-2 py-0.5 text-label-sm text-white backdrop-blur-sm select-none";

// Meet's shortcuts, on the tooltip and in the keyboard: Ctrl+D the microphone, Ctrl+E the camera.
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const keys = (key: string) => (isMac ? `⌘ ${key}` : `Ctrl + ${key}`);
const withKeys = (label: string, key: string) => `${label} (${keys(key)})`;
// Tooltips are appended to <body>, outside the chat, so they take its font and reset with them.
const tip = (value: string) => ({ value, class: "vue-chat font-chat-family" });

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
      command: () => {
        currentCameraId.value = camera.deviceId;
        void switchCamera(camera.deviceId);
      },
    })),
  },
]);

const moreMenu = ref<InstanceType<typeof Menu> | null>(null);
const moreItems = computed<MenuItem[]>(() => [
  {
    label: fullscreenLabel.value,
    callIcon: isFullscreen.value ? "fullscreenExit" : "fullscreen",
    command: () => toggleFullscreen(),
  },
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
const speakingRing = (on: boolean | undefined) =>
  on ? "ring-sky-400" : "ring-transparent";

// --- Picture-in-picture ---

// Minimized, the call plays live behind its controls: the remote participant on show, or the
// user's own camera when nobody else is there.
const pipVideoRef = ref<HTMLVideoElement | null>(null);
const activeRemoteIndex = ref(0);

const remoteVideoEntries = computed(() => Object.entries(remoteVideos.value));
const hasRemoteVideos = computed(() => remoteVideoEntries.value.length > 0);
const activeRemoteUserId = computed<string | null>(() => {
  const entries = remoteVideoEntries.value;
  if (entries.length === 0) return null;
  return entries[activeRemoteIndex.value % entries.length][0];
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
    <!-- Stage -->
    <div
      class="relative min-h-0 flex-1 px-3 pt-16 pb-2 md:p-4"
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
        class="absolute! top-6 left-1/2 z-30 -translate-x-1/2 shadow-lg"
        @click="enableSound"
      >
        <template #icon>
          <CallIcon name="volumeUp" class="size-5" />
        </template>
      </Button>

      <div
        v-show="tileCount"
        class="grid size-full min-h-0 min-w-0 grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))] md:gap-4"
      >
        <!-- Own screen share -->
        <div
          v-show="isScreenSharing"
          :ref="(el) => (remoteParents['self_screen'] = el as any)"
          class="group relative flex min-h-0 overflow-hidden rounded-2xl bg-neutral-800"
        >
          <video
            ref="localScreen"
            autoplay
            muted
            playsinline
            class="absolute inset-0 size-full object-contain"
          />
          <div class="absolute start-2 bottom-2 z-20 flex max-w-[60%] items-center gap-x-1.5">
            <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
              <CallIcon name="presentToAll" class="size-4" />
            </span>
            <span :class="nameChip">{{ t("chat.call.yourPresentation") }}</span>
          </div>
          <div :class="tileActions">
            <CallButton
              :icon="videoPaused['self_screen'] ? 'play' : 'pause'"
              :label="videoPaused['self_screen'] ? t('chat.call.controls.playVideo') : t('chat.call.controls.pauseVideo')"
              v-bind="tileButton"
              @click="toggleVideoPause('self_screen', localScreen as any)"
            />
            <CallButton
              :icon="isFullscreen ? 'fullscreenExit' : 'fullscreen'"
              :label="fullscreenLabel"
              v-bind="tileButton"
              @click="toggleRemote('self_screen')"
            />
          </div>
        </div>

        <!-- Remote cameras -->
        <div
          v-for="(remote, remoteUserId) in remoteVideos"
          :key="`remote-${remoteUserId}`"
          data-testid="call-remote-video"
          :ref="(el) => (remoteParents[`remote_video_${remoteUserId}`] = el as any)"
          class="group relative flex min-h-0 overflow-hidden rounded-2xl bg-neutral-800 ring-3 ring-inset transition-shadow motion-reduce:transition-none"
          :class="speakingRing(speaking[remoteUserId])"
        >
          <video
            :ref="(el) => { if (el) remoteRefs[remoteUserId] = el as any; }"
            autoplay
            playsinline
            class="absolute inset-0 size-full object-cover"
          />
          <span :class="[nameChip, 'absolute start-2 bottom-2 z-20']">
            <bdi>{{ remote.name }}</bdi>
          </span>
          <div :class="tileActions">
            <CallButton
              :icon="videoPaused[`remote_video_${remoteUserId}`] ? 'play' : 'pause'"
              :label="videoPaused[`remote_video_${remoteUserId}`] ? t('chat.call.controls.playVideo') : t('chat.call.controls.pauseVideo')"
              v-bind="tileButton"
              @click="toggleVideoPause(`remote_video_${remoteUserId}`, remoteRefs[remoteUserId] as any)"
            />
            <CallButton
              :icon="isFullscreen ? 'fullscreenExit' : 'fullscreen'"
              :label="fullscreenLabel"
              v-bind="tileButton"
              @click="toggleRemote(`remote_video_${remoteUserId}`)"
            />
          </div>
        </div>

        <!-- Remote screen shares -->
        <div
          v-for="(remote, remoteUserId) in remoteScreens"
          :key="`remote-screen-${remoteUserId}`"
          data-testid="call-remote-screen"
          :ref="(el) => (remoteParents[`remote_screen_${remoteUserId}`] = el as any)"
          class="group relative flex min-h-0 overflow-hidden rounded-2xl bg-neutral-800"
        >
          <video
            :ref="(el) => { if (el) remoteScreenRefs[remoteUserId] = el as any; }"
            autoplay
            muted
            playsinline
            class="absolute inset-0 size-full object-contain"
          />
          <div class="absolute start-2 bottom-2 z-20 flex max-w-[60%] items-center gap-x-1.5">
            <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
              <CallIcon name="presentToAll" class="size-4" />
            </span>
            <span :class="nameChip">
              {{ t("chat.call.presentationOf", { name: remote.name }) }}
            </span>
          </div>
          <div :class="tileActions">
            <CallButton
              :icon="videoPaused[`remote_screen_${remoteUserId}`] ? 'play' : 'pause'"
              :label="videoPaused[`remote_screen_${remoteUserId}`] ? t('chat.call.controls.playVideo') : t('chat.call.controls.pauseVideo')"
              v-bind="tileButton"
              @click="toggleVideoPause(`remote_screen_${remoteUserId}`, remoteScreenRefs[remoteUserId] || null)"
            />
            <CallButton
              :icon="isFullscreen ? 'fullscreenExit' : 'fullscreen'"
              :label="fullscreenLabel"
              v-bind="tileButton"
              @click="toggleRemote(`remote_screen_${remoteUserId}`)"
            />
          </div>
        </div>
      </div>

      <!-- Own camera: the whole stage when alone, a small floating tile once others show. -->
      <div
        :ref="(el) => (remoteParents['self_cam'] = el as any)"
        class="group overflow-hidden rounded-2xl bg-neutral-800 ring-3 ring-inset transition-shadow [clip-path:inset(0_round_var(--radius-2xl))] motion-reduce:transition-none"
        :class="[
          tileCount
            ? 'absolute end-5 bottom-4 z-10 aspect-video w-36 sm:w-56 md:end-6 md:bottom-6 md:w-64'
            : 'relative size-full',
          speakingRing(speaking.self),
        ]"
      >
        <video
          ref="localVideo"
          data-testid="call-local-video"
          autoplay
          muted
          playsinline
          class="pointer-events-none absolute inset-0 size-full -scale-x-100 rounded-[inherit] object-cover"
        />

        <div
          v-if="!isVideoOn"
          class="absolute inset-0 flex flex-col items-center justify-center gap-y-2 bg-neutral-800"
        >
          <Avatar
            :label="t('chat.call.you').slice(0, 1)"
            shape="circle"
            :size="tileCount ? 'large' : 'xlarge'"
            class="bg-sky-600! text-white! select-none"
          />
          <p v-if="!tileCount" class="text-label-md text-neutral-300 select-none">
            {{ t("chat.call.cameraIsOff") }}
          </p>
        </div>

        <span
          v-if="!isAudioOn"
          class="absolute end-2 top-2 z-20 flex size-7 items-center justify-center rounded-full bg-red-500 text-white"
          :title="t('chat.call.controls.unmute')"
        >
          <CallIcon name="micOff" class="size-4" />
        </span>

        <span :class="[nameChip, 'absolute start-2 bottom-2 z-20']">{{ t("chat.call.you") }}</span>

        <div v-if="!tileCount" :class="tileActions">
          <CallButton
            :icon="videoPaused['self_cam'] ? 'play' : 'pause'"
            :label="videoPaused['self_cam'] ? t('chat.call.controls.playVideo') : t('chat.call.controls.pauseVideo')"
            v-bind="tileButton"
            @click="toggleVideoPause('self_cam', localVideo as any)"
          />
        </div>
      </div>
    </div>

    <!-- Control bar: time and title, the controls, then the people and minimize. On phones the
         two sides move to the top of the screen, leaving the controls a row of their own. -->
    <div
      class="grid h-20 shrink-0 grid-cols-1 items-center px-3 transition-opacity duration-300 motion-reduce:transition-none md:relative md:grid-cols-[1fr_auto_1fr] md:px-6"
      :class="showControls ? 'opacity-100' : 'opacity-0'"
      @mouseenter="resetControlsTimeout"
      @mousemove="resetControlsTimeout"
    >
      <div
        class="absolute start-4 top-4 flex min-w-0 items-center gap-x-3 text-body-md select-none md:static"
      >
        <span dir="ltr" class="tabular-nums">{{ formatDuration(callStore.elapsedTime) }}</span>
        <span class="hidden h-4 w-px bg-white/30 md:block" />
        <span class="hidden truncate md:block">{{ callTitle }}</span>
      </div>

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

        <!-- The camera, with Meet's caret for picking which one when there are several. -->
        <div class="flex items-center rounded-full" :class="cameras.length > 1 && 'bg-white/12'">
          <CallButton
            v-if="cameras.length > 1"
            v-tooltip.top="tip(t('chat.call.controls.chooseCamera'))"
            icon="arrowDropUp"
            :label="t('chat.call.controls.chooseCamera')"
            :dt="callButtonDt"
            text
            severity="secondary"
            icon-class="size-6"
            class="h-12! w-8! rounded-e-none! ps-1!"
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
          v-tooltip.top="tip(shareLabel)"
          :icon="isScreenSharing ? 'cancelPresentation' : 'presentToAll'"
          :label="shareLabel"
          :severity="isScreenSharing ? 'contrast' : 'secondary'"
          v-bind="barButton"
          data-testid="call-toggle-screen"
          :data-active="isScreenSharing"
          @click="toggleScreenShare"
        />

        <CallButton
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
          class="h-12! w-16! sm:w-18!"
          data-testid="call-end"
          @click="endCall"
        />
      </div>

      <div class="absolute end-3 top-2.5 flex items-center justify-end gap-x-2 md:static">
        <div
          data-testid="call-participants"
          class="flex h-10 items-center gap-x-1.5 rounded-full bg-white/12 px-3 text-label-md select-none"
          :title="t('chat.call.participants', participantCount)"
        >
          <CallIcon name="group" class="size-5" />
          <span aria-hidden="true">{{ participantCount }}</span>
          <span class="sr-only">{{ t("chat.call.participants", participantCount) }}</span>
        </div>
        <CallButton
          v-tooltip.top="tip(t('chat.call.controls.minimize'))"
          icon="pictureInPicture"
          :label="t('chat.call.controls.minimize')"
          :dt="callButtonDt"
          :text="false"
          icon-class="size-5"
          class="size-10!"
          data-testid="call-minimize"
          @click="callStore.minimize"
        />
      </div>
    </div>

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
