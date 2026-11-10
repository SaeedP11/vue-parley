<script setup lang="ts">
import { useCallStore } from "~/stores/callStore";
import { formatDuration } from "~/utils/format";
import useLocalI18n, { useDirection } from "~/composables/useLocalI18n";
import { chat } from "@i18n/locales";
import { computed, ref, watch } from "vue";
import { useFullscreen } from "@vueuse/core";
import CallIcon from "./CallIcon.vue";
import CallStageVideo from "./CallStageVideo.vue";

/** A host's own button for one participant: it shows beside their name and in the control bar. */
export interface CallStageAction {
  label: string;
  /** Shown while the action is waiting for an answer. */
  busyLabel?: string;
  icon: "flashlightOn" | "flashlightOff";
  active?: boolean;
  busy?: boolean;
  disabled?: boolean;
  /** Runs when either action button is pressed. */
  command?: () => unknown;
  /** A line of status beside the name; `active` styles it as on. */
  note?: string;
}

/**
 * The call arranged for a phone, tablet or desktop: one participant large, the rest beside or
 * below, and the controls as a row of labelled buttons. It draws over `Call`'s own view, which
 * stays mounted beneath it for the sound and takes over again when the call is minimized.
 */
const props = defineProps<{
  title: string;
  subtitle?: string;
  /** Who is in the main view until someone is picked. */
  featuredId?: string;
  /** A line under the main participant's name. */
  featuredLabel?: string;
  /** A host button for the featured participant. */
  action?: CallStageAction | null;
  soundBlocked?: boolean;
  /** Runs before the call ends, e.g. to release something the host switched on. */
  beforeEnd?: () => unknown;
}>();
const emit = defineEmits<{ action: []; enableSound: []; people: [] }>();

const { t, n } = useLocalI18n(chat);
const { dir } = useDirection();
const callStore = useCallStore();
const session = callStore.session!;
const { media } = session;

const participants = computed(() => session.participants.value);
const selfTile = computed(() => participants.value.find((person) => person.isSelf));

// --- Who is in the main view -------------------------------------------------------------------

const selectedId = ref<string>();
const manuallySelected = ref(false);
const fallbackId = () =>
  participants.value.find((person) => person.id === props.featuredId)?.id ??
  participants.value.find((person) => !person.isSelf)?.id ??
  participants.value[0]?.id;

watch(
  [participants, () => props.featuredId],
  () => {
    const ids = new Set(participants.value.map((person) => person.id));
    const counterpartId =
      participants.value.find((person) => person.id === props.featuredId)?.id ??
      participants.value.find((person) => !person.isSelf)?.id;
    if (!selectedId.value || !ids.has(selectedId.value)) {
      manuallySelected.value = false;
      selectedId.value = fallbackId();
    } else if (!manuallySelected.value && counterpartId && selectedId.value !== counterpartId) {
      selectedId.value = counterpartId;
    }
  },
  { immediate: true },
);

const mainTile = computed(() => participants.value.find((person) => person.id === selectedId.value) ?? selfTile.value);

// --- Screen share: the shared screen takes the main view and everyone, presenter too, is a tile --
const presenter = computed(() => participants.value.find((person) => !!person.screen?.getVideoTracks().length));
const screenInMain = ref(true);
watch(
  () => presenter.value?.id,
  (id, previous) => {
    if (id && id !== previous) screenInMain.value = true;
  },
);
const showScreen = computed(() => !!presenter.value && screenInMain.value);

const thumbnails = computed(() => {
  const others = showScreen.value
    ? participants.value
    : participants.value.filter((person) => person.id !== mainTile.value?.id);
  return [...others].sort((a, b) => Number(b.isSelf) - Number(a.isSelf));
});

// One flip at a time: a second tap mid-flip would race the first for the camera.
const isFlipping = ref(false);
const flipLabel = computed(() =>
  media.facingMode.value === "environment" ? t("chat.call.stage.frontCamera") : t("chat.call.stage.backCamera"),
);
const flip = async () => {
  if (isFlipping.value) return;
  isFlipping.value = true;
  try {
    await session.flipCamera();
  } finally {
    isFlipping.value = false;
  }
};

const pickMain = (id: string) => {
  screenInMain.value = false;
  manuallySelected.value = true;
  selectedId.value = id;
};

type Tile = (typeof participants.value)[number];
const isFeatured = (tile?: Tile) => !!tile && !!props.featuredId && tile.id === props.featuredId;
const streamOf = (tile?: Tile) => (tile?.isSelf ? media.localStream.value : tile?.camera);
const cameraOn = (tile?: Tile) =>
  tile?.isSelf ? media.isVideoOn.value : tile?.media?.video !== false && !!tile?.camera?.getVideoTracks().length;
const micOn = (tile?: Tile) => (tile?.isSelf ? media.isAudioOn.value : tile?.media?.audio !== false);
const isMirrored = (tile?: Tile) => !!tile?.isSelf && media.facingMode.value !== "environment";
const nameOf = (tile?: Tile) => tile?.name || (tile?.isSelf ? t("chat.call.you") : t("chat.call.stage.participant"));
const isDisconnected = (tile?: Tile) => !!tile && !tile.isSelf && tile.status !== "connected";
const duration = computed(() => formatDuration(Math.max(0, Math.floor(callStore.elapsedTime))));

// --- Fullscreen: the browser's where it has one (not an iPhone), else the screen's own ---------

const mainCard = ref<HTMLElement>();
const { isFullscreen, isSupported, toggle: toggleNative } = useFullscreen(mainCard);
const expanded = ref(false);
const isExpanded = computed(() => isFullscreen.value || expanded.value);
const toggleFullscreen = () => (isSupported.value ? toggleNative() : (expanded.value = !expanded.value));

// Any tile can go full screen on its own, without becoming the main view.
const tileFullscreen = (event: Event) => {
  const tile = (event.currentTarget as HTMLElement).closest("article");
  if (tile?.requestFullscreen) void tile.requestFullscreen();
  else if (tile) pickMain(tile.dataset.id ?? "");
};

const shareLabel = computed(() =>
  media.isScreenSharing.value ? t("chat.call.stage.stopSharing") : t("chat.call.stage.shareScreen"),
);

const endCall = async () => {
  await props.beforeEnd?.();
  callStore.endCall();
};

const action = computed(() => props.action);
const isLit = computed(() => !!action.value?.active);
const isBusy = computed(() => !!action.value?.busy);
const runAction = () => {
  if (action.value?.disabled || isBusy.value) return;
  if (action.value?.command) void action.value.command();
  else emit("action");
};
</script>

<template>
  <section class="call-screen vue-chat font-chat-family" :dir="dir" data-testid="call-stage">
    <header class="call-header">
      <div class="call-brand">
        <span class="call-logo">
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M16 28S4 21 4 13a6 6 0 0 1 11-3 6 6 0 0 1 11 3c0 8-10 15-10 15Z" />
            <path d="M7 17h5l2-4 3 8 2-4h6" />
          </svg>
        </span>
        <div class="min-w-0">
          <h1>{{ title }}</h1>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
      </div>
      <div class="call-meta">
        <slot name="header-end">
          <span class="call-chip" data-testid="call-stage-duration" dir="ltr">
            <i class="call-dot" />
            <span class="call-time">{{ duration }}</span>
          </span>
        </slot>
        <button
          type="button"
          class="call-chip call-chip--button"
          :aria-label="t('chat.call.controls.people')"
          data-testid="call-stage-count"
          @click="emit('people')"
        >
          <CallIcon name="group" class="size-4" />
          {{ n(participants.length) }}
        </button>
        <button
          type="button"
          class="call-chip call-chip--button call-chip--icon"
          :aria-label="t('chat.call.controls.minimize')"
          data-testid="call-stage-minimize"
          @click="callStore.minimize"
        >
          <CallIcon name="pictureInPicture" class="size-4" />
        </button>
      </div>
    </header>

    <div ref="mainCard" class="call-main" :class="{ 'call-main--expanded': isExpanded }">
      <CallStageVideo v-if="showScreen" :stream="presenter?.screen" data-testid="call-stage-screen" />
      <CallStageVideo v-else-if="cameraOn(mainTile)" :stream="streamOf(mainTile)" :mirrored="isMirrored(mainTile)" />
      <div v-else class="call-avatar call-avatar--large">{{ nameOf(mainTile).charAt(0) }}</div>
      <div class="call-shade" />

      <span v-if="showScreen" class="call-badge call-badge--camera" role="status">
        <CallIcon name="presentToAll" class="size-4" />
        {{ presenter?.isSelf ? t("chat.call.stage.youArePresenting") : t("chat.call.stage.presenting", { name: nameOf(presenter) }) }}
      </span>
      <span v-else class="call-badge call-badge--camera">
        <i class="call-dot" :class="!cameraOn(mainTile) && 'call-dot--off'" />
        {{ cameraOn(mainTile) ? t("chat.call.cameraOn") : t("chat.call.cameraOff") }}
      </span>

      <button
        type="button"
        class="call-fullscreen"
        :aria-label="isExpanded ? t('chat.call.controls.exitFullscreen') : t('chat.call.controls.fullscreen')"
        data-testid="call-stage-fullscreen"
        @click="toggleFullscreen"
      >
        <CallIcon :name="isExpanded ? 'fullscreenExit' : 'fullscreen'" class="size-5" />
      </button>

      <span v-if="isDisconnected(mainTile)" class="call-badge call-badge--center">
        <CallIcon name="refresh" class="size-4 animate-spin motion-reduce:animate-none" />
        {{ t("chat.call.reconnecting") }}
      </span>

      <button v-if="soundBlocked" type="button" class="call-sound" data-testid="call-stage-sound" @click="emit('enableSound')">
        {{ t("chat.call.controls.enableSound") }}
      </button>

      <div class="call-main-footer">
        <div class="call-identity">
          <strong>{{ showScreen ? t("chat.call.stage.screenTile", { name: nameOf(presenter) }) : nameOf(mainTile) }}</strong>
          <span v-if="action?.note && isFeatured(mainTile) && !showScreen" class="call-torch-note" :class="isLit && 'call-torch-note--on'" role="status">
            {{ action.note }}
          </span>
        </div>

        <button
          v-if="action && isFeatured(mainTile) && !showScreen"
          type="button"
          class="call-torch-float"
          :class="isLit && 'call-torch-float--on'"
          :disabled="action.disabled || isBusy"
          :aria-pressed="isLit"
          :aria-busy="isBusy"
          data-testid="call-stage-action-float"
          @click="runAction"
        >
          <CallIcon v-if="isBusy" name="refresh" class="size-5 shrink-0 animate-spin motion-reduce:animate-none" />
          <CallIcon v-else :name="action.icon" class="size-5 shrink-0" />
          <span>{{ isBusy ? (action.busyLabel ?? action.label) : action.label }}</span>
          <CallIcon v-if="isLit" name="check" class="size-4 shrink-0" />
        </button>
      </div>
    </div>

    <template v-if="thumbnails.length">
      <div class="call-others-title">
        <h2>{{ t("chat.call.stage.others") }}</h2>
        <span>{{ t("chat.call.stage.peopleCount", { count: n(thumbnails.length) }) }}</span>
      </div>

      <div class="call-others" :class="thumbnails.length + (presenter && !showScreen ? 1 : 0) > 2 && 'call-others--scroll'">
        <article v-if="presenter && !showScreen" class="call-tile" data-testid="call-stage-screen-tile">
          <CallStageVideo :stream="presenter.screen" />
          <div class="call-tile-footer">
            <span class="call-name">{{ t("chat.call.stage.screenTile", { name: nameOf(presenter) }) }}</span>
          </div>
          <button
            type="button"
            class="call-tile-pick"
            :aria-label="t('chat.call.stage.showInMain')"
            @click="screenInMain = true"
          />
        </article>
        <article v-for="tile in thumbnails" :key="tile.id" :data-id="tile.id" class="call-tile" :class="!cameraOn(tile) && 'call-tile--off'">
          <CallStageVideo v-if="cameraOn(tile)" :stream="streamOf(tile)" :mirrored="isMirrored(tile)" />
          <template v-else>
            <div class="call-avatar">{{ nameOf(tile).charAt(0) }}</div>
            <span class="call-badge call-badge--tile">{{ t("chat.call.cameraOff") }}</span>
          </template>
          <span v-if="isDisconnected(tile)" class="call-badge call-badge--center">
            <CallIcon name="refresh" class="size-4 animate-spin motion-reduce:animate-none" />
          </span>
          <div class="call-tile-footer">
            <span class="call-name">{{ nameOf(tile) }}</span>
            <span class="call-mic" :class="!micOn(tile) && 'call-mic--off'">
              <CallIcon :name="micOn(tile) ? 'mic' : 'micOff'" class="size-4.5" />
            </span>
          </div>
          <button
            type="button"
            class="call-tile-pick"
            :aria-label="t('chat.call.stage.showNameInMain', { name: nameOf(tile) })"
            @click="pickMain(tile.id)"
          />
          <button
            type="button"
            class="call-tile-zoom"
            :aria-label="t('chat.call.stage.tileFullscreen', { name: nameOf(tile) })"
            data-testid="call-stage-tile-fullscreen"
            @click.stop="tileFullscreen"
          >
            <CallIcon name="fullscreen" class="size-4" />
          </button>
        </article>
      </div>
    </template>

    <nav class="call-controls" role="toolbar">
      <div class="call-control">
        <button type="button" class="call-control-button" :aria-label="t('chat.call.stage.microphone')" :aria-pressed="!media.isAudioOn.value" data-testid="call-stage-mic" @click="media.toggleAudio()">
          <CallIcon :name="media.isAudioOn.value ? 'mic' : 'micOff'" class="size-6" />
        </button>
        <span>{{ t("chat.call.stage.microphone") }}</span>
      </div>
      <div class="call-control">
        <button type="button" class="call-control-button" :aria-label="t('chat.call.stage.camera')" :aria-pressed="!media.isVideoOn.value" data-testid="call-stage-camera" @click="media.toggleVideo()">
          <CallIcon :name="media.isVideoOn.value ? 'videocam' : 'videocamOff'" class="size-6" />
        </button>
        <span>{{ t("chat.call.stage.camera") }}</span>
      </div>
      <div v-if="media.canFlipCamera.value && media.isVideoOn.value" class="call-control">
        <button
          type="button"
          class="call-control-button"
          :aria-label="flipLabel"
          :disabled="isFlipping"
          data-testid="call-stage-flip"
          :data-facing="media.facingMode.value ?? undefined"
          @click="flip"
        >
          <CallIcon :name="isFlipping ? 'refresh' : 'cameraSwitch'" class="size-6" :class="isFlipping && 'animate-spin motion-reduce:animate-none'" />
        </button>
        <span>{{ t("chat.call.stage.flipCamera") }}</span>
      </div>
      <div v-if="callStore.canShareScreen && media.canShareScreen" class="call-control" :class="media.isScreenSharing.value && 'call-control--lit'">
        <button
          type="button"
          class="call-control-button"
          :class="media.isScreenSharing.value && 'call-control-button--lit'"
          :aria-label="shareLabel"
          :aria-pressed="media.isScreenSharing.value"
          :disabled="media.isScreenShareStarting.value"
          data-testid="call-stage-screen-share"
          @click="session.toggleScreenShare()"
        >
          <CallIcon :name="media.isScreenSharing.value ? 'cancelPresentation' : 'presentToAll'" class="size-6" />
        </button>
        <span>{{ shareLabel }}</span>
      </div>
      <div v-if="action" class="call-control" :class="isLit && 'call-control--lit'">
        <button
          type="button"
          class="call-control-button"
          :class="isLit && 'call-control-button--lit'"
          :aria-label="action.label"
          :aria-pressed="isLit"
          :aria-busy="isBusy"
          :disabled="action.disabled || isBusy"
          data-testid="call-stage-action"
          @click="runAction"
        >
          <CallIcon v-if="isBusy" name="refresh" class="size-6 animate-spin motion-reduce:animate-none" />
          <CallIcon v-else :name="action.icon" class="size-6" />
        </button>
        <span>{{ action.label }}</span>
      </div>
      <slot name="controls" />
      <div class="call-control call-control--end">
        <button type="button" class="call-control-button call-control-button--end" :aria-label="t('chat.call.controls.endCall')" data-testid="call-stage-end" @click="endCall">
          <CallIcon name="callEnd" class="size-6" />
        </button>
        <span>{{ t("chat.call.stage.end") }}</span>
      </div>
    </nav>

  </section>
</template>

<style scoped>
.call-screen .call-tile-zoom {
  position: absolute;
  inset-block-start: 0.375rem;
  inset-inline-end: 0.375rem;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.55);
  color: #fff;
}
.call-tile:fullscreen {
  border-radius: 0;
}
.call-tile:fullscreen .call-tile-pick,
.call-tile:fullscreen .call-tile-zoom {
  display: none;
}
.call-chip--button {
  cursor: pointer;
}
.call-chip.call-chip--icon {
  justify-content: center;
  aspect-ratio: 1;
  padding: 0;
}
:where(.call-screen) button {
  padding: 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
  border: 0;
  background: none;
}

:where(.call-screen) button:disabled {
  cursor: not-allowed;
}

.call-screen {
  --background-primary: #0b1119;
  --background-secondary: #111822;
  --background-header: #1c2934;
  --background-panel: #19232e;
  --background-control: #303c4a;
  --accent-turquoise: #2ac9bc;
  --accent-turquoise-dark: #197c93;
  --accent-yellow: #f8b448;
  --accent-danger: #f34c59;
  --accent-danger-border: #f7787d;
  --accent-success: #42dcb5;
  --background-success: #0d342d;
  --text-primary: #f4f7fb;
  --text-secondary: #cbd8e5;
  --text-muted: #8294a9;
  --border-soft: rgb(255 255 255 / 0.09);
  --gutter: clamp(0.75rem, 3.3vw, 1.125rem);

  position: fixed;
  inset: 0;
  /* Above vue-parley's screen and its toolbar. */
  z-index: 62;
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  padding-top: env(safe-area-inset-top);
  padding-bottom: calc(env(safe-area-inset-bottom) + clamp(0.5rem, 1.5dvh, 0.875rem));
  overflow: hidden;
  color: var(--text-primary);
  font-family: inherit;
  background: radial-gradient(circle at 50% -20%, #1d3040 0%, #111822 37%, #0b1119 85%);
}

.call-header {
  display: flex;
  flex-shrink: 0;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  min-height: clamp(3.5rem, 8dvh, 5.4375rem);
  margin-inline: var(--gutter);
  border-bottom: 1px solid rgb(255 255 255 / 0.07);
}

.call-brand {
  display: flex;
  gap: 0.6875rem;
  align-items: center;
  min-width: 0;
}

.call-brand h1 {
  font-size: 1.25rem;
  font-weight: 800;
  line-height: 1.3;
}

.call-brand p {
  overflow: hidden;
  color: #97a7b8;
  font-size: 0.75rem;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.call-logo {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: clamp(2.25rem, 8.15vw, 2.75rem);
  aspect-ratio: 1;
  color: #fff;
  border-radius: 14px;
  background: linear-gradient(145deg, var(--accent-turquoise), var(--accent-turquoise-dark));
  box-shadow: 0 6px 22px rgb(32 190 182 / 0.17);
}

.call-logo svg {
  width: 68%;
}

.call-meta {
  display: flex;
  flex-shrink: 0;
  gap: 0.5rem;
}

.call-chip {
  display: flex;
  gap: 0.4375rem;
  align-items: center;
  height: 2.3125rem;
  padding-inline: 0.6875rem;
  color: #dce7f1;
  font-size: 0.8125rem;
  font-weight: 600;
  border: 1px solid rgb(255 255 255 / 0.09);
  border-radius: 14px;
  background: var(--background-header);
}

.call-time {
  color: #84e1d3;
  font-variant-numeric: tabular-nums;
}

.call-dot {
  flex-shrink: 0;
  width: 0.4375rem;
  height: 0.4375rem;
  border-radius: 50%;
  background: var(--accent-success);
  box-shadow: 0 0 0 3px rgb(66 212 164 / 0.1);
}

.call-dot--off {
  background: var(--text-muted);
}

.call-main {
  position: relative;
  flex: 1 1 0;
  min-height: 9rem;
  margin: clamp(0.5rem, 1.5dvh, 0.75rem) var(--gutter) 0;
  overflow: hidden;
  border-radius: 23px;
  outline: 1px solid rgb(255 255 255 / 0.125);
  background: var(--background-secondary);
  box-shadow: 0 18px 50px rgb(2 6 14 / 0.33);
}

.call-main--expanded {
  margin: 0;
  border-radius: 0;
}

/* The fallback where the browser has no fullscreen: the screen's whole height, over its siblings. */
.call-main--expanded:not(:fullscreen) {
  position: absolute;
  inset: 0;
  z-index: 2;
}

.call-shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(to bottom, rgb(10 27 43 / 0.33) 0%, transparent 23%, transparent 54%, rgb(6 19 26 / 0.67) 100%);
}

.call-badge {
  position: absolute;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.5rem 0.6875rem;
  color: #fff;
  font-size: 0.75rem;
  border: 1px solid rgb(255 255 255 / 0.2);
  border-radius: 12px;
  background: rgb(6 20 27 / 0.67);
  backdrop-filter: blur(10px);
}

.call-badge--camera {
  top: 1.0625rem;
  inset-inline-start: 1.0625rem;
}

.call-badge--tile {
  top: 0.75rem;
  inset-inline-start: 0.75rem;
  padding: 0.3125rem 0.5rem;
  color: #c3d4e2;
  font-size: 0.625rem;
  border: 0;
  border-radius: 7px;
  background: rgb(13 23 37 / 0.49);
  backdrop-filter: none;
}

.call-badge--center {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  white-space: nowrap;
}

.call-screen .call-fullscreen {
  position: absolute !important;
  top: 1.0625rem;
  inset-inline-end: 1.0625rem;
  width: 2.375rem;
  height: 2.375rem;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  padding: 0 !important;
  color: #fff !important;
  border: 1px solid rgb(255 255 255 / 0.28) !important;
  border-radius: 12px !important;
  background: rgb(6 20 27 / 0.57) !important;
  backdrop-filter: blur(12px);
}

.call-screen .call-fullscreen::after {
  /* The design's 38px, with a thumb's reach. */
  content: '';
  position: absolute;
  inset: -3px;
}

.call-screen .call-sound {
  position: absolute !important;
  top: 4rem;
  left: 50%;
  color: #0b1119 !important;
  font-size: 0.8125rem;
  white-space: nowrap;
  border: 0 !important;
  border-radius: 14px !important;
  background: var(--text-primary) !important;
  transform: translateX(-50%);
}

.call-main-footer {
  position: absolute;
  inset-inline: clamp(0.75rem, 3.3vw, 1.125rem);
  bottom: clamp(0.75rem, 3.3vw, 1.125rem);
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
  justify-content: space-between;
}

.call-identity {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 0.125rem;
  align-items: flex-start;
  min-width: 0;
}

.call-identity strong {
  display: -webkit-box;
  overflow: hidden;
  font-size: clamp(1rem, 3.9vw, 1.3125rem);
  font-weight: 750;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.call-identity small {
  margin-top: 0.25rem;
  color: #d8e4e7;
  font-size: 0.75rem;
}

.call-torch-note {
  display: inline-flex;
  gap: 0.4375rem;
  align-items: center;
  margin-top: clamp(0.25rem, 1.1dvh, 0.75rem);
  padding: 0.4375rem 0.625rem;
  color: var(--text-secondary);
  font-size: 0.6875rem;
  line-height: 1.4;
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  background: rgb(10 18 27 / 0.55);
}

.call-torch-note--on {
  color: #b2fbe9;
  border-color: rgb(112 224 197 / 0.3);
  background: rgb(13 52 45 / 0.9);
}

.call-screen .call-torch-float {
  flex-shrink: 0;
  gap: 0.5rem;
  min-height: 2.875rem;
  padding: 0.75rem 0.875rem !important;
  color: var(--text-primary) !important;
  font-size: 0.875rem;
  font-weight: 800;
  white-space: nowrap;
  border: 0 !important;
  border-radius: 14px !important;
  background: var(--background-control) !important;
  box-shadow: 0 7px 22px rgb(29 26 10 / 0.37);
  opacity: 1 !important;
}

.call-screen .call-torch-float--on {
  color: #222327 !important;
  background: var(--accent-yellow) !important;
}

.call-others-title {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  margin: clamp(0.375rem, 1.7dvh, 1.125rem) calc(var(--gutter) + 2px) clamp(0.25rem, 1dvh, 0.6875rem);
}

.call-others-title h2 {
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-weight: 400;
}

.call-others-title span {
  color: var(--text-muted);
  font-size: 0.6875rem;
}

.call-others {
  display: flex;
  flex-shrink: 0;
  gap: 0.75rem;
  height: clamp(5.75rem, 16.76dvh, 11.3125rem);
  padding-inline: var(--gutter);
}

.call-others--scroll {
  overflow-x: auto;
  scrollbar-width: none;
}

.call-tile {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  max-width: calc(50% - 0.375rem);
  overflow: hidden;
  border-radius: 19px;
  outline: 1px solid rgb(255 255 255 / 0.105);
  outline-offset: -1px;
  background: #1c2a36;
}

.call-tile--off {
  background: radial-gradient(circle at 50% 40%, #32445a 0%, #192633 66%);
}

.call-tile::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent 35%, rgb(14 27 38 / 0.68) 100%);
}

.call-others--scroll .call-tile {
  flex: 0 0 44%;
  max-width: none;
}

.call-avatar {
  position: absolute;
  top: 45%;
  left: 50%;
  display: grid;
  place-items: center;
  width: clamp(2.5rem, 8.3dvh, 5.625rem);
  aspect-ratio: 1;
  color: #e7edff;
  font-size: clamp(1.25rem, 3.7dvh, 2.5rem);
  font-weight: 600;
  border-radius: 50%;
  background: #3d496c;
  transform: translate(-50%, -50%);
}

.call-avatar--large {
  width: 6rem;
  font-size: 2rem;
}

.call-tile-footer {
  position: absolute;
  inset-inline: clamp(0.5rem, 2.2vw, 0.75rem);
  bottom: clamp(0.5rem, 2.2vw, 0.75rem);
  z-index: 1;
  display: flex;
  gap: 0.375rem;
  align-items: center;
  justify-content: space-between;
}

.call-name {
  overflow: hidden;
  padding: 0.4375rem 0.5625rem;
  font-size: 0.75rem;
  line-height: 1.2;
  white-space: nowrap;
  text-overflow: ellipsis;
  border-radius: 9px;
  background: rgb(13 21 39 / 0.72);
}

.call-mic {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 1.875rem;
  height: 1.875rem;
  color: #68e6c7;
  border-radius: 9px;
  background: #143e3a;
}

.call-mic--off {
  color: #fff;
  background: #ef5764;
}

.call-screen .call-tile-pick {
  position: absolute !important;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  padding: 0 !important;
  border: 0 !important;
  border-radius: inherit !important;
  background: transparent !important;
}

.call-controls {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-around;
  gap: 0.25rem;
  margin: clamp(0.375rem, 1.5dvh, 0.875rem) var(--gutter) 0;
  padding: clamp(0.375rem, 1.1dvh, 0.75rem) 0.625rem;
  border: 1px solid rgb(255 255 255 / 0.086);
  border-radius: 22px;
  background: var(--background-panel);
  box-shadow:
    0 -8px 26px rgb(0 0 0 / 0.14),
    0 16px 32px rgb(0 0 0 / 0.27);
}


.call-members-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: flex-end;
  background: rgb(0 0 0 / 0.58);
  backdrop-filter: blur(3px);
}

.call-members {
  width: 100%;
  max-height: min(75dvh, 36rem);
  padding: 1rem var(--gutter) calc(1rem + env(safe-area-inset-bottom));
  overflow-y: auto;
  color: var(--text-primary);
  border: 1px solid var(--border-soft);
  border-radius: 24px 24px 0 0;
  background: #17222d;
  box-shadow: 0 -18px 50px rgb(0 0 0 / 0.35);
}

.call-members header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.call-screen .call-members-close {
  width: 2.5rem;
  height: 2.5rem;
  padding: 0 !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-soft) !important;
  border-radius: 12px !important;
  background: var(--background-control) !important;
}

.call-members ul {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.call-members li {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem;
  border: 1px solid var(--border-soft);
  border-radius: 16px;
  background: var(--background-panel);
}

.call-members li.is-main {
  border-color: rgb(42 201 188 / 0.75);
  box-shadow: inset 0 0 0 1px rgb(42 201 188 / 0.18);
}

.call-member-avatar {
  display: grid;
  flex: 0 0 2.5rem;
  place-items: center;
  height: 2.5rem;
  border-radius: 50%;
  background: #3d496c;
}

.call-member-name {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-width: 0;
}

.call-member-name strong {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.call-member-name small {
  color: var(--text-muted);
  font-size: 0.6875rem;
}

.call-screen .call-member-pick {
  flex-shrink: 0;
  padding: 0.625rem 0.75rem !important;
  color: #102026 !important;
  font-size: 0.75rem;
  border: 0 !important;
  border-radius: 11px !important;
  background: var(--accent-turquoise) !important;
}

.call-screen .call-member-pick:disabled {
  color: #b5eee7 !important;
  background: #1e514f !important;
  opacity: 1;
}

@media (min-width: 768px) {
  .call-members-backdrop {
    align-items: stretch;
    justify-content: flex-start;
  }

  .call-members {
    width: min(25rem, 42vw);
    max-height: none;
    border-radius: 0 24px 24px 0;
  }
}

@media (min-width: 768px) {
  .call-others {
    height: clamp(8rem, 20dvh, 13rem);
  }
}

@media (min-width: 768px) {
  .call-screen {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    grid-template-columns: clamp(17rem, 23vw, 22rem) minmax(0, 1fr);
    gap: 0 1rem;
    padding: 1.5rem;
  }

  .call-header {
    grid-row: 1;
    grid-column: 1 / 3;
    margin: 0 0 1.25rem;
  }

  .call-main {
    grid-row: 2 / 4;
    grid-column: 2;
    margin: 0;
  }

  .call-others-title {
    grid-row: 2;
    grid-column: 1;
    margin: 0 0 0.75rem;
  }

  .call-others {
    grid-row: 3;
    grid-column: 1;
    flex-direction: column;
    gap: 0.75rem;
    height: auto;
    min-height: 0;
    padding: 0 1px;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .call-tile,
  .call-others--scroll .call-tile {
    flex: 0 0 clamp(8.5rem, 20vh, 12rem);
    width: 100%;
    max-width: none;
  }

  .call-controls {
    grid-row: 4;
    grid-column: 1 / 3;
    margin: 1.25rem 0 0;
  }
}

</style>

<!-- Unscoped: a host's own buttons in the `controls` slot use these classes too. -->
<style>
.call-control {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: clamp(0.25rem, 0.65dvh, 0.4375rem);
  align-items: center;
  justify-content: center;
  min-width: 0;
  color: #c6d4e1;
  font-size: 0.6875rem;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}

/* Long labels wrap instead of running into the neighbouring control on narrow phones. */
.call-control > span {
  max-width: 100%;
  min-height: 2.4em;
  line-height: 1.2;
  white-space: normal;
  overflow-wrap: anywhere;
}

.call-control--lit {
  color: #ffc572;
}

.call-control--end {
  color: #f4a9ae;
}

.call-screen .call-control-button {
  position: relative;
  display: grid;
  place-items: center;
  width: clamp(2.75rem, min(12.5vw, 6.5dvh), 3.5rem);
  height: clamp(2.75rem, min(12.5vw, 6.5dvh), 3.5rem);
  padding: 0 !important;
  color: #eff6fb !important;
  border: 1px solid rgb(255 255 255 / 0.1) !important;
  border-radius: 19px !important;
  background: var(--background-control) !important;
  opacity: 1 !important;
  transition: transform 0.12s;
}

/* Keep the glyph centred independently of the host application's SVG and RTL rules. */
.call-screen .call-control-button > svg {
  position: absolute;
  top: 50%;
  left: 50%;
  display: block;
  flex: none;
  width: 1.5rem;
  height: 1.5rem;
  margin: 0;
  transform: translate(-50%, -50%);
}

.call-screen .call-control-button:active,
.call-screen .call-torch-float:active {
  transform: scale(0.94);
}

.call-screen .call-control-button--lit {
  color: #242c33 !important;
  border-color: #ffdb95 !important;
  background: var(--accent-yellow) !important;
  box-shadow: 0 4px 18px rgb(236 173 74 / 0.18);
}

.call-screen .call-control-button--end {
  color: #fff !important;
  border-color: var(--accent-danger-border) !important;
  border-radius: 20px !important;
  background: var(--accent-danger) !important;
  box-shadow: 0 5px 20px rgb(238 62 80 / 0.22);
}

@media (prefers-reduced-motion: reduce) {
  .call-screen .call-control-button {
    transition: none;
  }
}
</style>
