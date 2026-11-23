import { computed, ref } from "vue";
import type { TrackTypes } from "./signaling";

export interface MediaOptions {
  /** Shows an error; `key` is a `chat.call.errors.*` translation key. */
  notify: (key: string) => void;
  isMobile: () => boolean;
  onTrackAdded?: (track: MediaStreamTrack, kind: "video" | "audio") => void;
}

/**
 * Bandwidth-optimized capture constraints:
 * - 720p/24fps capture ceiling avoids unconstrained 1080p/4K @ 60fps capture, lowering CPU & network load.
 * - Single-channel (mono) audio for speech cuts audio bandwidth in half compared to stereo.
 */
export const DEFAULT_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1280 },
  height: { ideal: 720, max: 720 },
  frameRate: { ideal: 24, max: 30 },
};

export const DEFAULT_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

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
export function useCallMedia({ notify, isMobile, onTrackAdded }: MediaOptions) {
  const error = (key: string) => notify(`chat.call.errors.${key}`);

  const localStream = ref<MediaStream | null>(null);
  const screenStream = ref<MediaStream | null>(null);
  const whiteboardStream = ref<MediaStream | null>(null);
  /** What each of our streams is, as announced to the others. */
  const trackTypes = ref<TrackTypes>([]);
  const videoTrack = ref<MediaStreamTrack | null>(null);
  const cameras = ref<MediaDeviceInfo[]>([]);
  const microphones = ref<MediaDeviceInfo[]>([]);

  const isAudioOn = ref(true);
  const isVideoOn = ref(true);
  const isScreenSharing = ref(false);
  const isWhiteboardSharing = ref(false);
  const canShareScreen = typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function";
  const isScreenShareStarting = ref(false);
  const isFlashlightOn = ref(false);

  const permissions = ref<{
    camera: PermissionState | null;
    microphone: PermissionState | null;
  }>({ camera: null, microphone: null });

  const isCameraAvailable = computed(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
    if (permissions.value.camera === "denied") return false;
    const track = localStream.value?.getVideoTracks()[0];
    if (track && track.readyState !== "ended") return true;
    return cameras.value.length > 0;
  });

  const isMicrophoneAvailable = computed(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
    if (permissions.value.microphone === "denied") return false;
    const track = localStream.value?.getAudioTracks()[0];
    if (track && track.readyState !== "ended") return true;
    return microphones.value.length > 0;
  });

  const isFlashlightSupported = computed(() => {
    const capabilities = videoTrack.value?.getCapabilities?.() as
      | Record<string, unknown>
      | undefined;
    return !!capabilities && "torch" in capabilities;
  });

  /**
   * Which way the camera faces. Phones open the front one unless told otherwise, so a phone that
   * doesn't say is taken to be on it.
   */
  const facingMode = computed<"user" | "environment" | null>(() => {
    const track = videoTrack.value;
    if (!track) return null;
    const facing = track.getSettings().facingMode;
    if (facing === "user" || facing === "environment") return facing;
    return isMobile() ? "user" : null;
  });
  /** A phone with a camera on each side: offer a flip instead of a list. */
  const canFlipCamera = computed(() => isMobile() && isCameraAvailable.value && cameras.value.length > 1);

  /**
   * Set once `start()` has finished, whether or not it got any media. Peers wait for this rather
   * than for a stream: a participant without a camera or mic still has to receive the others.
   */
  const ready = ref(false);

  async function updateDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const prevCameras = cameras.value.length;
      const prevMics = microphones.value.length;

      cameras.value = devices.filter((d) => d.kind === "videoinput");
      microphones.value = devices.filter((d) => d.kind === "audioinput");

      if (prevCameras > 0 && cameras.value.length === 0) {
        const track = localStream.value?.getVideoTracks()[0];
        if (track) {
          localStream.value?.removeTrack(track);
          track.stop();
        }
        videoTrack.value = null;
        isVideoOn.value = false;
      }

      if (prevMics > 0 && microphones.value.length === 0) {
        const track = localStream.value?.getAudioTracks()[0];
        if (track) {
          localStream.value?.removeTrack(track);
          track.stop();
        }
        isAudioOn.value = false;
      }
    } catch (err) {
      console.error("[vue-chat] Error updating media devices:", err);
    }
  }

  async function checkPermissions() {
    // Browsers only expose media devices on a secure origin (https, or localhost on the same
    // machine). A second device reaching a dev server over http://<lan-ip> has none; start() says so.
    if (!navigator.mediaDevices?.getUserMedia) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      cameras.value = devices.filter((d) => d.kind === "videoinput");
      microphones.value = devices.filter((d) => d.kind === "audioinput");
      if (!microphones.value.length) {
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
        status.onchange = () => {
          permissions.value[name] = status.state;
          if (status.state === "denied") {
            if (name === "camera") isVideoOn.value = false;
            if (name === "microphone") isAudioOn.value = false;
          }
        };
      } catch {
        permissions.value[name] = null;
      }
    };
    if (typeof navigator !== "undefined" && navigator.permissions) await Promise.all([query("camera"), query("microphone")]);
    if (permissions.value.camera === "denied") isVideoOn.value = false;
    if (permissions.value.microphone === "denied") isAudioOn.value = false;
  }

  if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", updateDevices);
  }

  /** Gets camera and mic together, or whichever of the two is available. */
  async function start() {
    try {
      await acquire();
      videoTrack.value = localStream.value?.getVideoTracks()[0] ?? null;
      if (videoTrack.value) await listCameras();
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
      localStream.value = await navigator.mediaDevices.getUserMedia({
        video: video ? DEFAULT_VIDEO_CONSTRAINTS : false,
        audio: audio ? DEFAULT_AUDIO_CONSTRAINTS : false,
      });
      if (video) permissions.value.camera = "granted";
      if (audio) permissions.value.microphone = "granted";
      localStream.value.getVideoTracks().forEach((t) => {
        t.onended = () => {
          isVideoOn.value = false;
          videoTrack.value = null;
          void updateDevices();
        };
      });
      localStream.value.getAudioTracks().forEach((t) => {
        t.onended = () => {
          isAudioOn.value = false;
          void updateDevices();
        };
      });
      announce(localStream.value);
      return;
    } catch (err) {
      if (!video || !audio) {
        const kind = video ? "camera" : "mic";
        console.error(`[vue-chat] Error accessing ${kind}:`, err);
        if ((err as { name?: string })?.name === "NotAllowedError") {
          permissions.value[kind === "camera" ? "camera" : "microphone"] = "denied";
        }
        error(deviceError(err, kind, isMobile()));
        isAudioOn.value = isVideoOn.value = false;
        return;
      }
    }

    // Both together failed (often a missing camera): try each on its own.
    const tracks: MediaStreamTrack[] = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: DEFAULT_AUDIO_CONSTRAINTS });
      const aTracks = stream.getAudioTracks();
      tracks.push(...aTracks);
      permissions.value.microphone = "granted";
      aTracks.forEach((t) => {
        t.onended = () => {
          isAudioOn.value = false;
          void updateDevices();
        };
      });
    } catch (err) {
      console.error("[vue-chat] Error accessing microphone:", err);
      if ((err as { name?: string })?.name === "NotAllowedError") {
        permissions.value.microphone = "denied";
      }
      error(deviceError(err, "mic", isMobile()));
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: DEFAULT_VIDEO_CONSTRAINTS });
      const vTracks = stream.getVideoTracks();
      tracks.push(...vTracks);
      permissions.value.camera = "granted";
      vTracks.forEach((t) => {
        t.onended = () => {
          isVideoOn.value = false;
          videoTrack.value = null;
          void updateDevices();
        };
      });
    } catch (err) {
      console.error("[vue-chat] Error accessing camera:", err);
      if ((err as { name?: string })?.name === "NotAllowedError") {
        permissions.value.camera = "denied";
      }
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
    const trackId = stream.getVideoTracks()[0]?.id ?? stream.getTracks()[0]?.id;
    const existingIndex = trackTypes.value.findIndex((t) => t.id === stream.id);
    if (existingIndex >= 0) {
      trackTypes.value[existingIndex] = { id: stream.id, trackId, type };
      trackTypes.value = [...trackTypes.value];
    } else {
      trackTypes.value = [...trackTypes.value, { id: stream.id, trackId, type }];
    }
    if (!hasAudio) isAudioOn.value = false;
    if (!hasVideo) isVideoOn.value = false;
  }

  async function toggleAudio() {
    if (!isMicrophoneAvailable.value) return;

    let track = localStream.value?.getAudioTracks()[0];
    if (!track || track.readyState === "ended") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: DEFAULT_AUDIO_CONSTRAINTS });
        track = stream.getAudioTracks()[0];
        if (!track) return;
        track.onended = () => {
          isAudioOn.value = false;
          void updateDevices();
        };
        if (!localStream.value) {
          localStream.value = new MediaStream([track]);
        } else {
          localStream.value.addTrack(track);
        }
        isAudioOn.value = true;
        track.enabled = true;
        permissions.value.microphone = "granted";
        announce(localStream.value);
        onTrackAdded?.(track, "audio");
      } catch (err) {
        console.error("[vue-chat] Error starting microphone:", err);
        if ((err as { name?: string })?.name === "NotAllowedError") {
          permissions.value.microphone = "denied";
        }
        error(deviceError(err, "mic", isMobile()));
      }
      return;
    }

    isAudioOn.value = !isAudioOn.value;
    track.enabled = isAudioOn.value;
  }

  async function toggleVideo() {
    if (!isCameraAvailable.value) return;

    let track = localStream.value?.getVideoTracks()[0];
    if (!track || track.readyState === "ended") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: DEFAULT_VIDEO_CONSTRAINTS });
        track = stream.getVideoTracks()[0];
        if (!track) return;
        track.onended = () => {
          isVideoOn.value = false;
          videoTrack.value = null;
          void updateDevices();
        };
        if (!localStream.value) {
          localStream.value = new MediaStream([track]);
        } else {
          localStream.value.addTrack(track);
        }
        videoTrack.value = track;
        isVideoOn.value = true;
        track.enabled = true;
        permissions.value.camera = "granted";
        announce(localStream.value);
        await listCameras();
        onTrackAdded?.(track, "video");
      } catch (err) {
        console.error("[vue-chat] Error starting camera:", err);
        if ((err as { name?: string })?.name === "NotAllowedError") {
          permissions.value.camera = "denied";
        }
        error(deviceError(err, "camera", isMobile()));
      }
      return;
    }

    isVideoOn.value = !isVideoOn.value;
    track.enabled = isVideoOn.value;
  }

  /**
   * Lists the cameras. Before access is granted, browsers hide their ids and labels (and phones
   * list a single camera), so this runs again once we hold the camera.
   */
  async function listCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      cameras.value = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
    } catch (err) {
      console.error("[vue-chat] Error listing cameras:", err);
    }
  }

  /** Swaps in another camera; returns the new track so peers can be updated. */
  function switchCamera(deviceId: string) {
    if (videoTrack.value?.getSettings().deviceId === deviceId) return Promise.resolve(null);
    return replaceCamera({ deviceId: { exact: deviceId } });
  }

  /** Turns to the other side of the phone: front to back, or back to front. */
  function flipCamera() {
    const next = facingMode.value === "environment" ? "user" : "environment";
    return replaceCamera({ facingMode: { exact: next } });
  }

  async function replaceCamera(video: MediaTrackConstraints) {
    const stream = localStream.value;
    if (!stream) return null;
    const old = stream.getVideoTracks()[0];
    const oldId = old?.getSettings().deviceId;

    // Phones can't hold two cameras at once: the current one goes first.
    if (old) {
      stream.removeTrack(old);
      old.stop();
    }
    isFlashlightOn.value = false;

    const open = async (constraints: MediaTrackConstraints) => {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { ...DEFAULT_VIDEO_CONSTRAINTS, ...constraints },
      });
      const track = next.getVideoTracks()[0]!;
      track.enabled = isVideoOn.value;
      track.onended = () => {
        isVideoOn.value = false;
        videoTrack.value = null;
        void updateDevices();
      };
      stream.addTrack(track);
      videoTrack.value = track;
      return track;
    };

    try {
      return await open(video);
    } catch (err) {
      console.error("[vue-chat] Error switching camera:", err);
      error(deviceError(err, "camera", isMobile()));
      // Back to the camera we had, so the call doesn't lose its video.
      if (oldId) {
        try {
          return await open({ deviceId: { exact: oldId } });
        } catch (err2) {
          console.error("[vue-chat] Error restoring camera:", err2);
        }
      }
      videoTrack.value = null;
      return null;
    }
  }

  /** Starts sharing the screen; returns the new stream, or null if there is none. */
  async function startScreenShare(onEnded: () => void) {
    if (isScreenShareStarting.value) return null;
    if (screenStream.value) {
      // Resume a paused share.
      screenStream.value.getVideoTracks()[0]!.enabled = true;
      isScreenSharing.value = true;
      return null;
    }
    if (!canShareScreen) {
      error(
        isMobile()
          ? "screenShareMobileUnsupported"
          : "screenShareBrowserUnsupported",
      );
      return null;
    }

    isScreenShareStarting.value = true;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        // On phones, prefer the whole display when the browser offers a source picker.
        // Cap screen share to 15fps max: screen content needs clarity over high frame rate.
        video: isMobile()
          ? { displaySurface: "monitor", frameRate: { max: 15 } }
          : { frameRate: { max: 15 } },
        audio: false,
      });
      if (!stream.getVideoTracks().length) {
        stream.getTracks().forEach((track) => track.stop());
        error("screenAccessError");
        return null;
      }
      screenStream.value = stream;
      const trackId = stream.getVideoTracks()[0]?.id;
      trackTypes.value = [
        ...trackTypes.value.filter((t) => t.type !== "screen"),
        { id: stream.id, trackId, type: "screen" },
      ];
      stream.getTracks().forEach((track) => (track.onended = onEnded));
      isScreenSharing.value = true;
      return stream;
    } catch (err) {
      console.error("[vue-chat] Screen share failed:", err);
      error(deviceError(err, "screen", isMobile()));
      isScreenSharing.value = false;
      return null;
    } finally {
      isScreenShareStarting.value = false;
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

  /** Starts sharing the whiteboard; returns the stream so peers can add it. */
  function startWhiteboardShare(stream: MediaStream, onEnded?: () => void) {
    if (whiteboardStream.value) {
      stopWhiteboardShare();
    }
    whiteboardStream.value = stream;
    const trackId = stream.getVideoTracks()[0]?.id;
    trackTypes.value = [
      ...trackTypes.value.filter((t) => t.type !== "whiteboard"),
      { id: stream.id, trackId, type: "whiteboard" },
    ];
    stream.getTracks().forEach((track) => {
      track.onended = () => {
        onEnded?.();
        stopWhiteboardShare();
      };
    });
    isWhiteboardSharing.value = true;
    return stream;
  }

  /** Stops sharing the whiteboard; returns the stream that was shared so peers can drop it. */
  function stopWhiteboardShare() {
    const stream = whiteboardStream.value;
    if (!stream) return null;
    stream.getTracks().forEach((track) => {
      track.stop();
      track.enabled = false;
    });
    trackTypes.value = trackTypes.value.filter((t) => t.type !== "whiteboard");
    whiteboardStream.value = null;
    isWhiteboardSharing.value = false;
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
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.removeEventListener) {
      navigator.mediaDevices.removeEventListener("devicechange", updateDevices);
    }
    if (isFlashlightOn.value && videoTrack.value) {
      void videoTrack.value
        .applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] })
        .catch(() => {});
    }
    for (const stream of [localStream.value, screenStream.value, whiteboardStream.value]) {
      stream?.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
    }
    localStream.value = null;
    screenStream.value = null;
    whiteboardStream.value = null;
    videoTrack.value = null;
    isWhiteboardSharing.value = false;
  }

  return {
    localStream,
    ready,
    screenStream,
    whiteboardStream,
    trackTypes,
    videoTrack,
    cameras,
    microphones,
    isCameraAvailable,
    isMicrophoneAvailable,
    facingMode,
    canFlipCamera,
    isAudioOn,
    isVideoOn,
    isScreenSharing,
    isWhiteboardSharing,
    canShareScreen,
    isScreenShareStarting,
    isFlashlightOn,
    isFlashlightSupported,
    checkPermissions,
    start,
    toggleAudio,
    toggleVideo,
    switchCamera,
    flipCamera,
    startScreenShare,
    stopScreenShare,
    startWhiteboardShare,
    stopWhiteboardShare,
    toggleFlashlight,
    stopAll,
  };
}
