import { computed, ref } from "vue";
import type { TrackTypes } from "./signaling";

export interface MediaOptions {
  /** Shows an error; `key` is a `chat.call.errors.*` translation key. */
  notify: (key: string) => void;
  isMobile: () => boolean;
}

/** Why getUserMedia/getDisplayMedia failed, as a translation key. */
function deviceError(err: unknown, kind: "mic" | "camera" | "screen", isMobile: boolean) {
  const name = (err as { name?: string })?.name;
  if (kind === "screen") {
    if (name === "NotAllowedError") return "screenShareDenied";
    if (name === "NotFoundError" || name === "NotReadableError") return "screenAccessError";
    return isMobile ? "screenShareMobileMaybeUnavailable" : "screenShareStartFailed";
  }
  const Kind = kind === "mic" ? "Mic" : "Camera";
  if (name === "NotAllowedError") return `${kind}Denied`;
  if (name === "NotFoundError") return `no${Kind}Found`;
  return `${kind}AccessError`;
}

/** This participant's camera, microphone and screen share. */
export function useCallMedia({ notify, isMobile }: MediaOptions) {
  const error = (key: string) => notify(`chat.call.errors.${key}`);

  const localStream = ref<MediaStream | null>(null);
  const screenStream = ref<MediaStream | null>(null);
  /** What each of our streams is, as announced to the others. */
  const trackTypes = ref<TrackTypes>([]);
  const videoTrack = ref<MediaStreamTrack | null>(null);
  const cameras = ref<MediaDeviceInfo[]>([]);

  const isAudioOn = ref(true);
  const isVideoOn = ref(true);
  const isScreenSharing = ref(false);
  const isFlashlightOn = ref(false);

  const permissions = ref<{
    camera: PermissionState | null;
    microphone: PermissionState | null;
  }>({ camera: null, microphone: null });

  const isFlashlightSupported = computed(() => {
    const capabilities = videoTrack.value?.getCapabilities?.() as
      | Record<string, unknown>
      | undefined;
    return !!capabilities && "torch" in capabilities;
  });

  async function checkPermissions() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      cameras.value = devices.filter((d) => d.kind === "videoinput");
      if (!devices.some((d) => d.kind === "audioinput")) {
        error("noMicDevice");
        isAudioOn.value = false;
      }
      if (!cameras.value.length) {
        error("noCameraDevice");
        isVideoOn.value = false;
      }

      const query = (name: string) =>
        navigator.permissions.query({ name: name as PermissionName });
      permissions.value.camera = (await query("camera")).state;
      permissions.value.microphone = (await query("microphone")).state;
      if (permissions.value.camera === "denied") isVideoOn.value = false;
      if (permissions.value.microphone === "denied") isAudioOn.value = false;
    } catch (err) {
      console.error("[vue-chat] Error checking permissions:", err);
    }
  }

  /** Gets camera and mic together, or whichever of the two is available. */
  async function start() {
    const { camera, microphone } = permissions.value;
    if (camera === "denied" || microphone === "denied") {
      if (camera === "denied") error("cameraDenied");
      if (microphone === "denied") error("micDenied");
      return;
    }

    try {
      localStream.value = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      trackTypes.value = [
        ...trackTypes.value,
        { id: localStream.value.id, type: "webcam_audio" },
      ];
    } catch {
      const tracks: MediaStreamTrack[] = [];
      try {
        const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
        trackTypes.value = [...trackTypes.value, { id: audio.id, type: "audio" }];
        tracks.push(...audio.getAudioTracks());
      } catch (err) {
        console.error("[vue-chat] Error accessing microphone:", err);
        error(deviceError(err, "mic", isMobile()));
        isAudioOn.value = false;
      }
      try {
        const video = await navigator.mediaDevices.getUserMedia({ video: true });
        trackTypes.value = [...trackTypes.value, { id: video.id, type: "webcam" }];
        tracks.push(...video.getVideoTracks());
      } catch (err) {
        console.error("[vue-chat] Error accessing camera:", err);
        error(deviceError(err, "camera", isMobile()));
        isVideoOn.value = false;
      }
      if (tracks.length) localStream.value = new MediaStream(tracks);
    }

    videoTrack.value = localStream.value?.getVideoTracks()[0] ?? null;
  }

  function toggleAudio() {
    isAudioOn.value = !isAudioOn.value;
    const track = localStream.value?.getAudioTracks()[0];
    if (track) track.enabled = isAudioOn.value;
  }

  function toggleVideo() {
    isVideoOn.value = !isVideoOn.value;
    const track = localStream.value?.getVideoTracks()[0];
    if (track) track.enabled = isVideoOn.value;
  }

  /** Swaps in another camera; returns the new track so peers can be updated. */
  async function switchCamera(deviceId: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: isAudioOn.value,
      });
      const track = stream.getVideoTracks()[0];
      if (!track || !localStream.value) return null;

      const old = localStream.value.getVideoTracks()[0];
      if (old) {
        localStream.value.removeTrack(old);
        old.stop();
      }
      localStream.value.addTrack(track);
      videoTrack.value = track;
      return track;
    } catch (err) {
      console.error("[vue-chat] Error switching camera:", err);
      return null;
    }
  }

  /** Starts sharing the screen; returns the new stream, or null if there is none. */
  async function startScreenShare(onEnded: () => void) {
    if (screenStream.value) {
      // Resume a paused share.
      screenStream.value.getVideoTracks()[0]!.enabled = true;
      isScreenSharing.value = true;
      return null;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      error(
        isMobile()
          ? "screenShareMobileUnsupported"
          : "screenShareBrowserUnsupported",
      );
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      screenStream.value = stream;
      trackTypes.value = [...trackTypes.value, { id: stream.id, type: "screen" }];
      stream.getTracks().forEach((track) => (track.onended = onEnded));
      isScreenSharing.value = true;
      return stream;
    } catch (err) {
      console.error("[vue-chat] Screen share failed:", err);
      error(deviceError(err, "screen", isMobile()));
      isScreenSharing.value = false;
      return null;
    }
  }

  /** Stops sharing; returns the stream that was shared so peers can drop it. */
  function stopScreenShare() {
    const stream = screenStream.value;
    if (!stream) return null;
    stream.getTracks().forEach((track) => {
      track.stop();
      track.enabled = false;
    });
    trackTypes.value = trackTypes.value.filter((t) => t.type !== "screen");
    screenStream.value = null;
    isScreenSharing.value = false;
    return stream;
  }

  async function toggleFlashlight() {
    const track = videoTrack.value;
    if (!track) {
      error("cameraUnavailable");
      return;
    }
    if (!isFlashlightSupported.value) return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: !isFlashlightOn.value } as MediaTrackConstraintSet],
      });
      isFlashlightOn.value = !isFlashlightOn.value;
    } catch (err) {
      console.error("[vue-chat] Flashlight toggle failed:", err);
      error("flashlightToggleFailed");
    }
  }

  /** Releases camera, mic and screen. */
  function stopAll() {
    if (isFlashlightOn.value && videoTrack.value) {
      void videoTrack.value
        .applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] })
        .catch(() => {});
    }
    for (const stream of [localStream.value, screenStream.value]) {
      stream?.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
    }
    localStream.value = null;
    screenStream.value = null;
    videoTrack.value = null;
  }

  return {
    localStream,
    screenStream,
    trackTypes,
    videoTrack,
    cameras,
    isAudioOn,
    isVideoOn,
    isScreenSharing,
    isFlashlightOn,
    isFlashlightSupported,
    checkPermissions,
    start,
    toggleAudio,
    toggleVideo,
    switchCamera,
    startScreenShare,
    stopScreenShare,
    toggleFlashlight,
    stopAll,
  };
}
