import { ref } from "vue";
import { useCallStore } from "~/stores/callStore";
import { useCallUi } from "./call/useCallUi";

/**
 * The view side of the running call, for Call.vue. The call itself (signalling, peers, media)
 * lives in the call store, so unmounting this view doesn't end it.
 */
export default function useCall({ layoutKey }: { layoutKey?: () => string } = {}) {
  const callStore = useCallStore();
  const session = callStore.session;
  if (!session) {
    throw new Error("[vue-chat] useCall() needs a running call: callStore.startCall() first");
  }
  const { media, peers } = session;

  const ui = useCallUi({
    localStream: media.localStream,
    screenStream: media.screenStream,
    remoteVideos: peers.remoteVideos,
    remoteScreens: peers.remoteScreens,
    isMinimized: () => callStore.isMinimized,
    layoutKey,
  });

  async function switchCamera(deviceId: string) {
    const stream = await session!.switchCamera(deviceId);
    // Same stream object with a new track: the preview has to be told.
    if (stream && ui.localVideo.value) ui.localVideo.value.srcObject = stream;
  }

  return {
    // Call state
    participantCount: session.participantCount,
    tileCount: session.tileCount,
    participants: session.participants,
    phase: session.phase,
    hadOthers: session.hadOthers,
    maxParticipants: session.maxParticipants,
    remoteMedia: peers.remoteMedia,
    peerStatus: peers.peerStatus,
    remoteNames: peers.remoteNames,
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
    toggleScreenShare: session.toggleScreenShare,
    switchCamera,
    endCall: callStore.endCall,
    // View
    showCameraModal: ref(false),
    showControls: ui.showControls,
    resetControlsTimeout: ui.resetControlsTimeout,
    isFullscreen: ui.isFullscreen,
    toggleFullscreen: ui.toggleFullscreen,
    toggleRemote: ui.toggleRemote,
    videoPaused: ui.videoPaused,
    soundBlocked: ui.soundBlocked,
    enableSound: ui.enableSound,
    toggleVideoPause: ui.toggleVideoPause,
    localVideo: ui.localVideo,
    localScreen: ui.localScreen,
    remoteRefs: ui.remoteRefs,
    remoteScreenRefs: ui.remoteScreenRefs,
    remoteParents: ui.remoteParents,
    reattach: ui.reattach,
    retryPeer: session.retryPeer,
  };
}
