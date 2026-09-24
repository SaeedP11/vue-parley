import { nextTick, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import type { RemoteStream } from "./peers";

export interface CallUiOptions {
  localStream: Ref<MediaStream | null>;
  screenStream: Ref<MediaStream | null>;
  remoteVideos: Ref<Record<string, RemoteStream>>;
  remoteScreens: Ref<Record<string, RemoteStream>>;
  /** Re-attach streams when this changes: minimizing swaps the <video> elements. */
  isMinimized: () => boolean;
}

const CONTROLS_HIDE_AFTER_MS = 3000;

/** The call screen's view state, and keeping each <video> element showing the right stream. */
export function useCallUi(opts: CallUiOptions) {
  const { localStream, screenStream, remoteVideos, remoteScreens } = opts;

  // Template refs, bound by Call.vue.
  const localVideo = ref<HTMLVideoElement | null>(null);
  const localScreen = ref<HTMLVideoElement | null>(null);
  const remoteRefs = ref<Record<string, HTMLVideoElement | null>>({});
  const remoteScreenRefs = ref<Record<string, HTMLVideoElement | undefined>>({});
  const remoteParents = ref<Record<string, HTMLElement>>({});

  // --- Controls fade out after a few seconds without input ---
  const showControls = ref(true);
  let controlsTimeout: ReturnType<typeof setTimeout> | undefined;
  function resetControlsTimeout() {
    showControls.value = true;
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(
      () => (showControls.value = false),
      CONTROLS_HIDE_AFTER_MS,
    );
  }
  const inputEvents = ["mousemove", "click", "keydown"] as const;
  onMounted(() => {
    resetControlsTimeout();
    inputEvents.forEach((e) => document.addEventListener(e, resetControlsTimeout));
  });
  onUnmounted(() => {
    inputEvents.forEach((e) => document.removeEventListener(e, resetControlsTimeout));
    clearTimeout(controlsTimeout);
  });

  // --- Fullscreen: the whole call, or a single tile ---
  const isFullscreen = ref(false);
  function toggleFullscreen(target: HTMLElement = document.documentElement) {
    if (!document.fullscreenElement) {
      void target.requestFullscreen?.();
      isFullscreen.value = true;
    } else {
      void document.exitFullscreen();
      isFullscreen.value = false;
    }
  }
  const toggleRemote = (tileId: string, el?: HTMLElement) => {
    const container = el ?? remoteParents.value[tileId];
    if (container) toggleFullscreen(container);
  };

  // --- Pausing a single tile ---
  const videoPaused = ref<Record<string, boolean>>({});
  function toggleVideoPause(tileId: string, el: HTMLVideoElement | null | undefined) {
    if (!(el instanceof HTMLVideoElement)) return;
    if (videoPaused.value[tileId]) void el.play();
    else el.pause();
    videoPaused.value[tileId] = !videoPaused.value[tileId];
  }

  // --- Keep each <video> showing its stream ---
  const attach = (el: HTMLVideoElement | null | undefined, stream: MediaStream) => {
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    el.play().catch(() => {});
  };

  watch(
    [localStream, opts.isMinimized],
    async () => {
      await nextTick();
      if (localStream.value && localVideo.value)
        localVideo.value.srcObject = localStream.value;
    },
    { immediate: true },
  );
  watch(
    [screenStream, opts.isMinimized],
    async () => {
      await nextTick();
      if (localScreen.value) localScreen.value.srcObject = screenStream.value;
    },
    { immediate: true },
  );
  watch(
    [() => ({ ...remoteVideos.value }), opts.isMinimized],
    async () => {
      await nextTick();
      for (const [id, { stream }] of Object.entries(remoteVideos.value))
        attach(remoteRefs.value[id], stream);
    },
    { immediate: true },
  );
  watch(
    [() => ({ ...remoteScreens.value }), opts.isMinimized],
    async () => {
      await nextTick();
      for (const [id, { stream }] of Object.entries(remoteScreens.value))
        attach(remoteScreenRefs.value[id], stream);
    },
    { immediate: true },
  );

  /** Detaches every <video>, so no element keeps a stopped stream alive. */
  function detachAll() {
    const all = [
      localVideo.value,
      localScreen.value,
      ...Object.values(remoteRefs.value),
      ...Object.values(remoteScreenRefs.value),
    ];
    for (const el of all) if (el) el.srcObject = null;
  }

  return {
    localVideo,
    localScreen,
    remoteRefs,
    remoteScreenRefs,
    remoteParents,
    showControls,
    resetControlsTimeout,
    isFullscreen,
    toggleFullscreen: () => toggleFullscreen(),
    toggleRemote,
    videoPaused,
    toggleVideoPause,
    detachAll,
  };
}
