import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { nanoid } from "nanoid";
import { useCallHandlers } from "~/provider/callProvider";
import { useProfileStore } from "~/stores/profileStore";
import { useChatStore } from "~/stores/chatStore";
import { useCallStore } from "~/stores/callStore";
import { useAppToast } from "./useAppToast";
import useLocalI18n from "./useLocalI18n";
import { chat } from "@i18n/locales";
import { createSignaling } from "./call/signaling";
import { usePeers } from "./call/peers";
import { useCallMedia } from "./call/media";
import { useCallUi } from "./call/useCallUi";

const toIceUrl = (url: string) =>
  url.startsWith("stun:") || url.startsWith("turn:") ? url : `turn:${url}`;

/**
 * Runs one call for the component that mounts it (Call.vue): joins on mount, leaves on unmount.
 * The work is split into signalling, peers, local media and view state; this wires them up.
 */
export default function useCall() {
  const callHandlers = useCallHandlers();
  const profileStore = useProfileStore();
  const chatStore = useChatStore();
  const callStore = useCallStore();
  const { openToast } = useAppToast();
  const { t } = useLocalI18n(chat);

  const log = callHandlers.debug
    ? (...args: unknown[]) => console.log("[vue-chat:call]", ...args)
    : () => {};

  // A fresh id per call, so rejoining never collides with our previous, stale peers.
  const selfId = `${profileStore.userId}:${nanoid()}`;
  const channel = () => callStore.channelId ?? chatStore.activeConversationId ?? "";

  const isMobile = () =>
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    !!window.matchMedia?.("(max-width: 768px)").matches;

  const signaling = createSignaling(callHandlers, {
    id: selfId,
    name: () => profileStore.userName ?? "",
  });

  const media = useCallMedia({
    notify: (key) => openToast(t(key), "error"),
    isMobile,
  });

  const peers = usePeers({
    selfId,
    signaling,
    localStream: media.localStream,
    screenStream: media.screenStream,
    log,
    rtcConfig() {
      const policy = callHandlers.iceTransportPolicy ?? "relay";
      const cred = callHandlers.credential;
      const iceServers: RTCIceServer[] = cred?.urls?.length
        ? [{ urls: cred.urls.map(toIceUrl), username: cred.user, credential: cred.pass }]
        : [];
      // Relay-only without a relay can never connect.
      if (policy === "relay" && !iceServers.length) return null;
      return { iceTransportPolicy: policy, iceServers };
    },
  });

  const ui = useCallUi({
    localStream: media.localStream,
    screenStream: media.screenStream,
    remoteVideos: peers.remoteVideos,
    remoteScreens: peers.remoteScreens,
    isMinimized: () => callStore.isMinimized,
  });

  const participantCount = computed(() => Object.keys(peers.peers.value).length + 1);
  const tileCount = computed(
    () =>
      (media.screenStream.value ? 1 : 0) +
      Object.keys(peers.remoteVideos.value).length +
      Object.keys(peers.remoteScreens.value).length,
  );

  async function ringOtherSide() {
    const blob = profileStore.userAvatar;
    let avatar: string | undefined;
    if (blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      avatar = `data:${blob.type};base64,${btoa(String.fromCharCode(...bytes))}`;
    }
    await signaling.ring(channel(), avatar);
  }

  // simple-peer expects Node's process.nextTick.
  const w = window as unknown as { process?: { nextTick?: unknown } };
  w.process = { ...w.process, nextTick };

  onMounted(async () => {
    await signaling.listen({
      onSignal: (from, name, signal) => peers.signal(from, name, signal),
      onJoin(from, name) {
        log("join from", from, name);
        void signaling.trackTypes(media.trackTypes.value);
        const isNew = !peers.has(from);
        peers.add(from, name);
        // Only whoever is already in the call hears a newcomer's join. If the newcomer has to
        // make the offer, it doesn't know about us yet, so announce ourselves back to it.
        if (isNew && !peers.isInitiator(from)) void signaling.join();
      },
      onTrackTypes(from, types) {
        peers.remoteStreamTypes.value[from] = types;
      },
      onHangup(from) {
        log("hangup from", from);
        peers.remove(from);
      },
    });

    await callHandlers.handleGenerateCred();
    await media.checkPermissions();
    await media.start();
    log("local media ready:", media.localStream.value?.getTracks().map((t) => t.kind));

    void signaling.trackTypes(media.trackTypes.value);
    void ringOtherSide();
    void signaling.join();
  });

  onUnmounted(() => {
    signaling.stop();
    peers.destroyAll();
    media.stopAll();
    ui.detachAll();
  });

  function stopScreenShare() {
    const stream = media.stopScreenShare();
    stream?.getVideoTracks().forEach((track) => peers.removeTrackFromAll(track, stream));
  }

  async function toggleScreenShare() {
    if (media.isScreenSharing.value) return stopScreenShare();
    const stream = await media.startScreenShare(stopScreenShare);
    if (!stream) return;
    // Tell the others this stream is a screen before it reaches them.
    await signaling.trackTypes(media.trackTypes.value);
    stream.getVideoTracks().forEach((track) => peers.addTrackToAll(track, stream));
  }

  async function switchCamera(deviceId: string) {
    const track = await media.switchCamera(deviceId);
    const stream = media.localStream.value;
    if (!track || !stream) return;
    peers.replaceVideoTrack(track, stream);
    if (ui.localVideo.value) ui.localVideo.value.srcObject = stream;
  }

  function endCall() {
    void signaling.hangup(channel());
    media.stopAll();
    peers.destroyAll();
    callStore.endCall();
  }

  return {
    // Call state
    participantCount,
    tileCount,
    localStream: media.localStream,
    remoteVideos: peers.remoteVideos,
    remoteScreens: peers.remoteScreens,
    // Local media
    cameras: media.cameras,
    isAudioOn: media.isAudioOn,
    isVideoOn: media.isVideoOn,
    isScreenSharing: media.isScreenSharing,
    isFlashlightOn: media.isFlashlightOn,
    isFlashlightSupported: media.isFlashlightSupported,
    toggleAudio: media.toggleAudio,
    toggleVideo: media.toggleVideo,
    toggleFlashlight: media.toggleFlashlight,
    toggleScreenShare,
    switchCamera,
    endCall,
    // View
    showCameraModal: ref(false),
    showControls: ui.showControls,
    resetControlsTimeout: ui.resetControlsTimeout,
    isFullscreen: ui.isFullscreen,
    toggleFullscreen: ui.toggleFullscreen,
    toggleRemote: ui.toggleRemote,
    videoPaused: ui.videoPaused,
    toggleVideoPause: ui.toggleVideoPause,
    localVideo: ui.localVideo,
    localScreen: ui.localScreen,
    remoteRefs: ui.remoteRefs,
    remoteScreenRefs: ui.remoteScreenRefs,
    remoteParents: ui.remoteParents,
  };
}
