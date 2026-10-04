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

  /**
   * Set once `start()` has finished, whether or not it got any media. Peers wait for this rather
   * than for a stream: a participant without a camera or mic still has to receive the others.
   */
  const ready = ref(false);

  async function checkPermissions() {
    // Browsers only expose media devices on a secure origin (https, or localhost on the same
    // machine). A second device reaching a dev server over http://<lan-ip> has none; start() says so.
    if (!navigator.mediaDevices?.getUserMedia) return;

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
    } catch (err) {
      console.error("[vue-chat] Error listing media devices:", err);
    }

    // Queried one by one: Firefox has no `camera` descriptor and rejects that query, which must
    // not lose the microphone's answer.
    const query = async (name: "camera" | "microphone") => {
      try {
        const status = await navigator.permissions.query({ name: name as PermissionName });
        permissions.value[name] = status.state;
      } catch {
        permissions.value[name] = null;
      }
    };
    if (navigator.permissions) await Promise.all([query("camera"), query("microphone")]);
    if (permissions.value.camera === "denied") isVideoOn.value = false;
    if (permissions.value.microphone === "denied") isAudioOn.value = false;
  }

  /** Gets camera and mic together, or whichever of the two is available. */
  async function start() {
    try {
      await acquire();
      videoTrack.value = localStream.value?.getVideoTracks()[0] ?? null;
    } finally {
      ready.value = true;
    }
  }

  async function acquire() {
    if (!navigator.mediaDevices?.getUserMedia) {
      console.error("[vue-chat] No media devices: the page is not on a secure origin (https)");
      error(window.isSecureContext === false ? "insecureContext" : "mediaInitError");
      isAudioOn.value = false;
      isVideoOn.value = false;
      return;
    }

    // A denied permission rules out that one device; the other is still worth asking for.
    const { camera, microphone } = permissions.value;
    if (camera === "denied") error("cameraDenied");
    if (microphone === "denied") error("micDenied");
    const video = camera !== "denied";
    const audio = microphone !== "denied";
    if (!video && !audio) return;

    try {
      localStream.value = await navigator.mediaDevices.getUserMedia({ video, audio });
      announce(localStream.value);
      return;
    } catch (err) {
      if (!video || !audio) {
        const kind = video ? "camera" : "mic";
        console.error(`[vue-chat] Error accessing ${kind}:`, err);
        error(deviceError(err, kind, isMobile()));
        isAudioOn.value = isVideoOn.value = false;
        return;
      }
    }

    // Both together failed (often a missing camera): try each on its own.
    const tracks: MediaStreamTrack[] = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tracks.push(...stream.getAudioTracks());
    } catch (err) {
      console.error("[vue-chat] Error accessing microphone:", err);
      error(deviceError(err, "mic", isMobile()));
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      tracks.push(...stream.getVideoTracks());
    } catch (err) {
      console.error("[vue-chat] Error accessing camera:", err);
      error(deviceError(err, "camera", isMobile()));
    }
    if (!tracks.length) {
      isAudioOn.value = isVideoOn.value = false;
      return;
    }
    localStream.value = new MediaStream(tracks);
    announce(localStream.value);
  }

  /** Describes our camera/mic stream to the others, by the id they will actually receive. */
  function announce(stream: MediaStream) {
    const hasAudio = stream.getAudioTracks().length > 0;
    const hasVideo = stream.getVideoTracks().length > 0;
    const type = hasAudio && hasVideo ? "webcam_audio" : hasVideo ? "webcam" : "audio";
    trackTypes.value = [...trackTypes.value, { id: stream.id, type }];
    if (!hasAudio) isAudioOn.value = false;
    if (!hasVideo) isVideoOn.value = false;
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
    ready,
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
