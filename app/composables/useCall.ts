import { TrackType, CallMessageSchema, CallMessageType } from "~/types";
import { useCallHandlers } from "~/provider/callProvider";
import { useProfileStore } from "~/stores/profileStore";
import { ref, nextTick as ProcessNextTick } from "vue";
import { useChatStore } from "~/stores/chatStore";
import { useCallStore } from "~/stores/callStore";
import { useAppToast } from "./useAppToast";
import useLocalI18n from "./useLocalI18n";
import { chat } from "@i18n/locales";
import { nanoid } from "nanoid";
import Peer from "simple-peer";

export default function useCall() {
  const profileStore = useProfileStore();
  const callHandlers = useCallHandlers();
  const callStore = useCallStore();
  const { t: _t } = useLocalI18n(chat);
  const t = (key: string, ...args: any[]) => {
    try {
      return typeof _t === "function"
        ? (_t as any)(key, ...args)
        : key;
    } catch {
      return key;
    }
  };
  const { openToast } = useAppToast();
  const chatStore = useChatStore();

  const { publisher, subscriber, unSubscriber } = callHandlers;
  const credential = computed(() => callHandlers.credential);
  let socketMsgId: number;
  const _roomId = computed(() => chatStore.activeConversationId);

  const isAudioOn = ref(true);
  const isVideoOn = ref(true);
  const profile = ref<any>(); // *
  const showControls = ref(true);
  const isFullscreen = ref(false);
  const isScreenSharing = ref(false);
  const isFlashlightOn = ref(false);
  const showCameraModal = ref(false);
  const cameras = ref<MediaDeviceInfo[]>([]);
  const localStream = ref<MediaStream | null>(null);
  const screenStream = ref<MediaStream | null>(null);
  const videoPaused = ref<Record<string, boolean>>({});
  const videoTrack = ref<MediaStreamTrack | null>(null);
  const peers = ref<{ [key: string]: Peer.Instance }>({});
  const remoteParents = ref<Record<string, HTMLVideoElement>>({});
  const localVideo = ref<{ srcObject: MediaStream } | null>(null);
  const localScreen = ref<{ srcObject: MediaStream } | null>(null);
  const localStreamTypes = ref<{ id: string; type: TrackType }[]>([]);
  const userId = computed(() => `${profileStore.userId}:${nanoid()}`);
  const remoteRefs = ref<Record<string, HTMLVideoElement | null>>({});
  const remoteScreenRefs = ref<Record<string, HTMLVideoElement | undefined>>(
    {},
  );
  const connectionData = ref<Record<string, { signal: string } | undefined>>(
    {},
  );
  const remoteVideos = ref<
    Record<string, { name: string; stream: MediaStream }>
  >({});
  const remoteStreamTypes = ref<
    Record<string, { id: string; type: TrackType }[]>
  >({});
  const remoteScreens = ref<
    Record<string, { name: string; stream: MediaStream }>
  >({});
  const pendingPeerRequests = ref<
    Record<string, { initiator: boolean | undefined; name: string }>
  >({});
  const pendingSignals = ref<Record<string, any>>({});

  const generateIceUrl = (
    url: string,
    protocol: "turn" | "stun" = "turn",
  ): string => {
    if (url.startsWith("stun:") || url.startsWith("turn:")) return url;

    return `${protocol}:${url}`;
  };

  const tileCount = computed(() => {
    let count = 0;

    if (screenStream.value) ++count;
    count = count + Object.entries(remoteVideos.value).length;
    count = count + Object.entries(remoteScreens.value).length;

    return count;
  });

  // Permission states
  const permissions = ref<{
    camera: PermissionState | null;
    microphone: PermissionState | null;
    screen: PermissionState | null;
  }>({
    camera: null,
    microphone: null,
    screen: null,
  });

  const isMobile = computed(() => {
    if (typeof window === "undefined") return false;
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      ) ||
      (window.matchMedia && window.matchMedia("(max-width: 768px)").matches)
    );
  });

  const avatarBlob = computed(() => profileStore.userAvatar);

  const isFlashlightSupported = computed(() => {
    if (!videoTrack.value) return false;
    const capabilities = videoTrack.value.getCapabilities?.() as any;
    return capabilities && "torch" in capabilities;
  });

  // Auto-hide controls after 3 seconds of inactivity
  let controlsTimeout: NodeJS.Timeout;
  const resetControlsTimeout = () => {
    showControls.value = true;
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
      showControls.value = false;
    }, 3000);
  };

  function shouldBeInitiator(remoteId: string) {
    return userId.value > remoteId;
  }

  async function checkPermissions() {
    try {
      // Check available devices first
      const devices = await navigator.mediaDevices.enumerateDevices();
      cameras.value = devices.filter((d) => d.kind === "videoinput");
      const hasAudioInput = devices.some(
        (device) => device.kind === "audioinput",
      );
      const hasVideoInput = devices.some(
        (device) => device.kind === "videoinput",
      );

      // Check camera permission
      const cameraPermission = await navigator.permissions.query({
        name: "camera",
      });
      permissions.value.camera = cameraPermission.state;

      // Check microphone permission
      const micPermission = await navigator.permissions.query({
        name: "microphone",
      });
      permissions.value.microphone = micPermission.state;

      // Set initial errors and states if devices are not available
      if (!hasAudioInput) {
        openToast(t("chat.call.errors.noMicDevice"), "error");
        isAudioOn.value = false;
      }
      if (!hasVideoInput) {
        openToast(t("chat.call.errors.noCameraDevice"), "error");
        isVideoOn.value = false;
      }

      // Set states based on permission status
      if (permissions.value.camera === "denied") {
        isVideoOn.value = false;
      }
      if (permissions.value.microphone === "denied") {
        isAudioOn.value = false;
      }

      // Screen share permission is checked when user tries to share
      permissions.value.screen = "prompt";
    } catch (err) {
      console.error("Error checking permissions:", err);
    }
  }

  async function initializeMedia() {
    try {
      if (
        permissions.value.camera === "denied" ||
        permissions.value.microphone === "denied"
      ) {
        if (permissions.value.camera === "denied")
          openToast(t("chat.call.errors.cameraDenied"), "error");
        if (permissions.value.microphone === "denied")
          openToast(t("chat.call.errors.micDenied"), "error");

        // Set video/audio state based on permissions
        if (permissions.value.camera === "denied") {
          isVideoOn.value = false;
        }
        if (permissions.value.microphone === "denied") {
          isAudioOn.value = false;
        }
        return;
      }
      // if (isAudioOn.value || isVideoOn.value) {
      // Try to get both video and audio
      try {
        localStream.value = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        localStreamTypes.value = [
          ...localStreamTypes.value,
          { id: localStream.value!.id, type: "webcam_audio" },
        ];
      } catch {
        // Try audio only
        let audioStream = null;

        // if (isAudioOn.value) {
        try {
          audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          localStreamTypes.value = [
            ...localStreamTypes.value,
            { id: audioStream!.id, type: "audio" },
          ];
        } catch (audioErr: any) {
          console.error("Error accessing microphone:", audioErr);
          if (audioErr.name === "NotAllowedError") {
            openToast(t("chat.call.errors.micDenied"), "error");
            isAudioOn.value = false;
          } else if (audioErr.name === "NotFoundError") {
            openToast(t("chat.call.errors.noMicFound"), "error");
            isAudioOn.value = false;
          } else {
            openToast(t("chat.call.errors.micAccessError"), "error");
            isAudioOn.value = false;
          }
        }
        // }

        // Try video only
        let videoStream = null;

        // if (isVideoOn.value) {
        try {
          videoStream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
          localStreamTypes.value = [
            ...localStreamTypes.value,
            { id: videoStream!.id, type: "webcam" },
          ];
        } catch (videoErr: any) {
          console.error("Error accessing camera:", videoErr);
          if (videoErr.name === "NotAllowedError") {
            openToast(t("chat.call.errors.cameraDenied"), "error");
            isVideoOn.value = false;
          } else if (videoErr.name === "NotFoundError") {
            openToast(t("chat.call.errors.noCameraFound"), "error");
            isVideoOn.value = false;
          } else {
            openToast(t("chat.call.errors.cameraAccessError"), "error");
            isVideoOn.value = false;
          }
        }
        // }

        // Combine streams if we have at least one
        if (audioStream || videoStream) {
          const tracks = [];
          if (audioStream) tracks.push(...audioStream.getAudioTracks());
          if (videoStream) tracks.push(...videoStream.getVideoTracks());

          localStream.value = new MediaStream(tracks);
        }
        // }
      }
      if (localStream.value && localVideo.value) {
        localVideo.value.srcObject = localStream.value;
        videoTrack.value = localStream.value.getVideoTracks()[0] || null;
      }

      publisher(
        JSON.stringify({
          type: CallMessageType.TrackType,
          payload: {
            from: userId.value,
            types: localStreamTypes.value,
          },
        } as CallMessageSchema),
      );
    } catch (err) {
      console.error("Error in initializeMedia:", err);
      openToast(t("chat.call.errors.mediaInitError"), "error");
      isVideoOn.value = false;
      isAudioOn.value = false;
    }
  }

  function cleanupPeer(remoteUserId: string) {
    if (peers.value[remoteUserId]) {
      peers.value[remoteUserId].destroy();

      Reflect.deleteProperty(peers.value, remoteUserId);
    }
    Reflect.deleteProperty(remoteVideos.value, remoteUserId);
    Reflect.deleteProperty(remoteScreens.value, remoteUserId);
    Reflect.deleteProperty(pendingPeerRequests.value, remoteUserId);
    Reflect.deleteProperty(pendingSignals.value, remoteUserId);

    connectionData.value[remoteUserId] = undefined;
  }

  function _addPeer(
    remoteUserId: string,
    initiator: boolean | undefined,
    name: string,
  ) {
    if (!localStream.value) {
      console.warn(
        "[useCall] localStream not ready, deferring peer creation for",
        remoteUserId,
      );
      pendingPeerRequests.value[remoteUserId] = { initiator, name };
      return;
    }

    if (
      !credential.value ||
      !credential.value.urls ||
      !credential.value.urls.length
    ) {
      console.warn(
        "[useCall] No TURN credentials available, cannot create peer for",
        remoteUserId,
      );
      return;
    }

    if (!peers.value[remoteUserId]) {
      console.log(
        "[useCall] Creating peer for",
        remoteUserId,
        "initiator:",
        initiator,
      );
      let peer: Peer.Instance;
      try {
        peer = new Peer({
          initiator,
          trickle: false,
          stream: localStream.value!,
          config: {
            iceTransportPolicy: "relay",
            iceServers: [
              {
                urls: credential.value!.urls.map((url) => generateIceUrl(url)),
                username: credential.value!.user,
                credential: credential.value!.pass,
              },
            ],
          },
        });
      } catch (err) {
        console.error("[useCall] Peer constructor threw:", err, (err as any)?.stack);
        return;
      }
      console.log("[useCall] Peer created successfully for", remoteUserId);

      if (screenStream.value)
        screenStream.value.getVideoTracks().forEach((track) => {
          peer.addTrack(track, screenStream.value!);
        });

      peer.on("signal", async (signal) => {
        console.log(
          "[useCall] Peer signal emitted for",
          remoteUserId,
          (signal as any).type || "candidate",
        );
        await publisher(
          JSON.stringify({
            type: CallMessageType.Signal,
            payload: {
              from: userId.value,
              to: remoteUserId,
              signal,
              name: `${profileStore.userName ?? ""}`,
            },
          } as CallMessageSchema),
        );
      });

      peer.on("stream", (stream) => {
        console.log(
          "[useCall] Peer stream received from",
          remoteUserId,
          "tracks:",
          stream.getTracks().map((t) => t.kind),
        );
        const announced = remoteStreamTypes.value[remoteUserId] ?? [];
        const isScreen = announced.some((t) => t.type === "screen");
        const hasVideo = stream.getVideoTracks().length > 0;
        if (isScreen && hasVideo) {
          remoteScreens.value[remoteUserId] = { name, stream };
        } else {
          remoteVideos.value[remoteUserId] = { name, stream };
        }
      });

      peer.on("error", (err) => {
        console.error("[useCall] Peer error for", remoteUserId, err);
        cleanupPeer(remoteUserId);

        publisher(
          JSON.stringify({
            type: CallMessageType.Join,
            payload: {
              from: userId.value,
              name: `${profileStore.userName ?? ""}`,
            },
          } as CallMessageSchema),
        );
      });

      peer.on("close", () => {
        console.log("[useCall] Peer closed for", remoteUserId);
        cleanupPeer(remoteUserId);
      });

      peers.value[remoteUserId] = peer;

      if (pendingSignals.value[remoteUserId]) {
        console.log("[useCall] Applying pending signal for", remoteUserId);
        peer.signal(pendingSignals.value[remoteUserId]);
        delete pendingSignals.value[remoteUserId];
      }
    }
  }

  const callOtherSide = async () => {
    let avatarImage;
    if (avatarBlob.value)
      avatarImage = await avatarBlob.value
        .arrayBuffer()
        .then(
          (buf) =>
            `data:${avatarBlob.value!.type};base64,${btoa(String.fromCharCode(...new Uint8Array(buf)))}`,
        );

    publisher(
      JSON.stringify({
        type: CallMessageType.Call,
        payload: {
          from: userId.value!,
          name: `${profileStore.userName ?? ""}`,
          channel: _roomId.value,
          avatar: avatarImage,
        },
      } as CallMessageSchema),
    );
  };

  const logUnhandledRejection = (event: PromiseRejectionEvent) => {
    console.error(
      "[useCall] Unhandled rejection:",
      event.reason,
      "stack:",
      (event as any).reason?.stack || event.reason,
    );
  };

  onMounted(async () => {
    window.addEventListener("unhandledrejection", logUnhandledRejection);

    if (window.process)
      Object.assign(window.process, { nextTick: ProcessNextTick });
    else {
      Object.assign(window, { process: { nextTick: ProcessNextTick } });
    }

    socketMsgId = await subscriber(async (message) => {
      const fromId = message.payload.from;

      if (fromId === userId.value) return;

      console.log("[useCall] Received message:", message.type, "from:", fromId);

      if (
        message.type === CallMessageType.Signal &&
        message.payload.signal &&
        message.payload.to === userId.value &&
        connectionData.value[fromId]?.signal !==
          message.payload.signal.sdp
      ) {
        console.log(
          "[useCall] Processing Signal from",
          fromId,
          "peer exists:",
          !!peers.value[fromId],
        );
        const signal = message.payload.signal as Peer.SignalData;
        let peer: Peer.Instance | undefined = peers.value[fromId];
        if (!peer) {
          await nextTick();
          _addPeer(fromId, shouldBeInitiator(fromId), message.payload.name);
          peer = peers.value[fromId];
        }
        if (peer) {
          connectionData.value[fromId] = {
            signal: message.payload.signal.sdp,
          };
          peer.signal(signal);
        } else {
          console.log(
            "[useCall] Peer still deferred, storing pending signal for",
            fromId,
          );
          pendingSignals.value[fromId] = signal;
        }
      } else if (message.type === CallMessageType.Join) {
        console.log(
          "[useCall] Join from",
          fromId,
          "name:",
          message.payload.name,
        );
        publisher(
          JSON.stringify({
            type: CallMessageType.TrackType,
            payload: {
              from: userId.value,
              types: localStreamTypes.value,
            },
          } as CallMessageSchema),
        );

        const isNew = !peers.value[fromId] && !pendingPeerRequests.value[fromId];
        const initiator = shouldBeInitiator(fromId);
        _addPeer(fromId, initiator, message.payload.name);

        // Only whoever is already in the call hears a newcomer's join. If the newcomer has to
        // make the offer, it doesn't know about us yet, so announce ourselves back to it.
        if (isNew && !initiator) {
          publisher(
            JSON.stringify({
              type: CallMessageType.Join,
              payload: {
                from: userId.value,
                name: `${profileStore.userName ?? ""}`,
              },
            } as CallMessageSchema),
          );
        }
      } else if (message.type === CallMessageType.TrackType) {
        console.log(
          "[useCall] TrackType from",
          fromId,
          "types:",
          message.payload.types,
        );
        remoteStreamTypes.value[fromId] = message.payload.types;
      }
    });

    await callHandlers.handleGenerateCred();
    console.log(
      "[useCall] Credential after handleGenerateCred:",
      credential.value
        ? {
            urls: credential.value.urls?.length,
            user: !!credential.value.user,
          }
        : "null",
    );
    await checkPermissions();
    await initializeMedia();
    console.log(
      "[useCall] localStream ready:",
      !!localStream.value,
      "tracks:",
      localStream.value?.getTracks().map((t) => t.kind),
    );

    void callOtherSide();

    // Initialize controls timeout
    resetControlsTimeout();

    // Add mouse move listener for controls
    document.addEventListener("mousemove", resetControlsTimeout);
    // Also add click listener to show controls when user interacts
    document.addEventListener("click", resetControlsTimeout);
    // Add key listener for keyboard interactions
    document.addEventListener("keydown", resetControlsTimeout);

    publisher(
      JSON.stringify({
        type: CallMessageType.Join,
        payload: {
          from: userId.value!,
          name: `${profileStore.userName ?? ""}`,
        },
      } as CallMessageSchema),
    );
  });

  async function switchCamera(deviceId: string) {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: isAudioOn.value,
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      const oldVideoTrack = localStream.value?.getVideoTracks()[0];
      if (oldVideoTrack) {
        localStream.value!.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }
      localStream.value?.addTrack(newVideoTrack);
      videoTrack.value = newVideoTrack;

      if (localVideo.value) localVideo.value.srcObject = localStream.value!;

      Object.values(peers.value).forEach((peer: any) => {
        const sender = peer._pc
          .getSenders()
          .find((s: any) => s.track && s.track.kind === "video");
        if (sender) {
          sender.replaceTrack(newVideoTrack);
        } else {
          peer.addTrack(newVideoTrack, localStream.value!);
        }
      });
    } catch (err) {
      console.error("Error switching camera:", err);
    }
  }

  async function toggleVideo() {
    isVideoOn.value = !isVideoOn.value;
    if (localStream.value) {
      const videoTrack = localStream.value.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = isVideoOn.value;
      }
    }
  }

  async function toggleAudio() {
    isAudioOn.value = !isAudioOn.value;
    if (localStream.value) {
      const audioTrack = localStream.value.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isAudioOn.value;
      }
    }
  }

  async function toggleScreenShare() {
    if (!isScreenSharing.value) {
      if (screenStream.value) {
        const track = screenStream.value.getVideoTracks()[0]!;
        track.enabled = true;
        isScreenSharing.value = true;

        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        if (isMobile.value) {
          openToast(
            t("chat.call.errors.screenShareMobileUnsupported"),
            "error",
          );
        } else {
          openToast(
            t("chat.call.errors.screenShareBrowserUnsupported"),
            "error",
          );
        }
        return;
      }

      try {
        screenStream.value = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        if (!localScreen.value) {
          console.error("Screen element not initialized");
          return;
        }

        localScreen.value.srcObject = screenStream.value;

        screenStream.value!.getVideoTracks().forEach(() => {
          localStreamTypes.value = [
            ...localStreamTypes.value,
            { id: screenStream.value!.id, type: "screen" },
          ];
        });

        publisher(
          JSON.stringify({
            type: CallMessageType.TrackType,
            payload: {
              from: userId.value,
              types: localStreamTypes.value,
            },
          } as CallMessageSchema),
        );

        Object.values(peers.value).forEach((peer) => {
          screenStream.value!.getVideoTracks().forEach((track) => {
            peer.addTrack(track, screenStream.value!);
          });
        });

        screenStream.value.getTracks().map((track) => {
          track.onended = stopScreenShare;
        });

        isScreenSharing.value = true;
      } catch (err: any) {
        console.error("Screen share failed:", err);
        if (err.name === "NotAllowedError") {
          openToast(t("chat.call.errors.screenShareDenied"), "error");
        } else if (
          err.name === "NotFoundError" ||
          err.name === "NotReadableError"
        ) {
          openToast(t("chat.call.errors.screenAccessError"), "error");
        } else if (isMobile.value) {
          openToast(
            t("chat.call.errors.screenShareMobileMaybeUnavailable"),
            "error",
          );
        } else {
          openToast(t("chat.call.errors.screenShareStartFailed"), "error");
        }
        isScreenSharing.value = false;
      }
    } else {
      stopScreenShare();
    }
  }

  function stopScreenShare() {
    if (!screenStream.value) return;

    const track = screenStream.value.getVideoTracks()[0]!;
    track.stop();
    track.enabled = false;

    localStreamTypes.value = localStreamTypes.value.filter(
      (item) => item.type !== "screen",
    );

    Object.values(peers.value).forEach((peer: any) => {
      const senders = peer._pc?.getSenders?.() || [];
      senders.forEach((sender: any) => {
        if (sender.track && sender.track.id === track.id) {
          peer.removeTrack(sender.track, screenStream.value!);
        }
      });
    });

    if (localScreen.value) {
      localScreen.value.srcObject = null as any;
    }

    screenStream.value.getTracks().forEach((track) => track.stop());
    screenStream.value = null as any;
    isScreenSharing.value = false;
  }

  async function toggleFlashlight() {
    if (!videoTrack.value) {
      openToast(t("chat.call.errors.cameraUnavailable"), "error");
      return;
    }

    try {
      const track = videoTrack.value;
      const capabilities = track.getCapabilities?.() as any;

      if (capabilities && "torch" in capabilities) {
        await track.applyConstraints({
          advanced: [{ torch: !isFlashlightOn.value } as any],
        });
        isFlashlightOn.value = !isFlashlightOn.value;
      }
    } catch (err: any) {
      console.error("Flashlight toggle failed:", err);
      openToast(t("chat.call.errors.flashlightToggleFailed"), "error");
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      isFullscreen.value = true;
    } else {
      document.exitFullscreen();
      isFullscreen.value = false;
    }
  }

  function endCall() {
    publisher(
      JSON.stringify({
        type: CallMessageType.Hangup,
        payload: {
          from: userId.value,
          channel: _roomId.value,
        },
      } as CallMessageSchema),
    );

    localStream.value?.getTracks().forEach((track) => track.stop());
    screenStream.value?.getTracks().forEach((track) => track.stop());

    Object.values(peers.value).forEach((peer) => peer.destroy());
    callStore.endCall();
  }

  onUnmounted(() => {
    if (localStream.value) {
      localStream.value.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      localStream.value = null;
    }

    if (screenStream.value) {
      screenStream.value.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      screenStream.value = null;
    }

    if (isFlashlightOn.value && videoTrack.value) {
      try {
        const track = videoTrack.value;
        const capabilities = track.getCapabilities?.() as any;
        if (capabilities && "torch" in capabilities) {
          track
            .applyConstraints({
              advanced: [{ torch: false } as any],
            })
            .catch(() => {});
        }
      } catch {
        void 0;
      }
      videoTrack.value = null;
    }

    if (localVideo.value) {
      localVideo.value.srcObject = null as any;
    }
    if (localScreen.value) {
      localScreen.value.srcObject = null as any;
    }

    Object.values(peers.value).forEach((peer) => {
      try {
        peer.destroy();
      } catch {
        void 0;
      }
    });
    peers.value = {};

    Object.values(remoteRefs.value).forEach((ref) => {
      if (ref && ref.srcObject) {
        (ref.srcObject as MediaStream)
          .getTracks()
          .forEach((track) => track.stop());
        ref.srcObject = null as any;
      }
    });
    Object.values(remoteScreenRefs.value).forEach((ref) => {
      if (ref && ref.srcObject) {
        (ref.srcObject as MediaStream)
          .getTracks()
          .forEach((track) => track.stop());
        ref.srcObject = null as any;
      }
    });

    document.removeEventListener("mousemove", resetControlsTimeout);
    document.removeEventListener("click", resetControlsTimeout);
    document.removeEventListener("keydown", resetControlsTimeout);
    window.removeEventListener("unhandledrejection", logUnhandledRejection);
    clearTimeout(controlsTimeout);

    if (typeof socketMsgId === "number") {
      unSubscriber(socketMsgId);
    }
  });

  const participantCount = computed(() => {
    // Count connected peers (one per remote user) + local user.
    // Screen shares reuse the same peer, so they don't inflate the count.
    return Object.keys(peers.value).length + 1;
  });

  // const failedPlay = ref<HTMLVideoElement[]>([]);

  // const TryPlay = () => {
  //   failedPlay.value.map((video) => {
  //     video.play().catch(console.error);
  //   });
  //   failedPlay.value = [];
  //   showPlayContentModal.value = false;
  // };

  watch(
    () => localStream.value,
    (newStream) => {
      if (newStream && Object.keys(pendingPeerRequests.value).length > 0) {
        const pending = { ...pendingPeerRequests.value };
        pendingPeerRequests.value = {};
        console.log(
          "[useCall] localStream ready, processing deferred peers:",
          Object.keys(pending),
        );
        for (const [remoteUserId, { initiator, name }] of Object.entries(
          pending,
        )) {
          _addPeer(remoteUserId, initiator, name);
        }
      }
    },
    { immediate: true },
  );

  watch(
    () => [localStream.value, callStore.isMinimized] as [MediaStream, boolean],
    async ([video]) => {
      await nextTick();

      if (video && localVideo.value) localVideo.value.srcObject = video;
    },
    { immediate: true, deep: true },
  );

  watch(
    () => [screenStream.value, callStore.isMinimized] as [MediaStream, boolean],
    async ([video]) => {
      await nextTick();

      if (video && localScreen.value) localScreen.value.srcObject = video;
    },
    { immediate: true, deep: true },
  );

  watch(
    () =>
      [remoteScreens.value, callStore.isMinimized] as [
        Record<string, { name: string; stream: MediaStream }>,
        boolean,
      ],
    async ([videos]) => {
      await nextTick();
      for (const [id, stream] of Object.entries(videos)) {
        const video = remoteScreenRefs.value[id];
        if (video && stream.stream) {
          if (video.srcObject !== stream.stream) {
            video.srcObject = stream.stream;
            video.play().catch((err) => {
              console.warn(`Autoplay prevented for remote screen ${id}:`, err);
            });
          }
        }
      }
    },
    { immediate: true, deep: true },
  );

  watch(
    () =>
      [remoteVideos.value, callStore.isMinimized] as [
        Record<string, { name: string; stream: MediaStream }>,
        boolean,
      ],
    async ([videos]) => {
      await nextTick();
      for (const [id, { stream }] of Object.entries(videos)) {
        const el = remoteRefs.value[id];
        if (!el || !stream) continue;
        if (el.srcObject !== stream) {
          el.srcObject = stream;
        }
        el.play().catch(() => {});
      }
    },
    { immediate: true, deep: true },
  );

  const toggleRemote = (remoteId: string, ref?: HTMLDivElement) => {
    const container = ref || remoteParents.value[remoteId];
    if (!container) return;

    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
        isFullscreen.value = true;
      }
    } else {
      document.exitFullscreen();
      isFullscreen.value = false;
    }
  };

  function toggleVideoPause(
    videoId: string,
    videoElement: HTMLVideoElement | null | undefined,
  ) {
    if (!videoElement || !(videoElement instanceof HTMLVideoElement)) return;
    const isPaused = videoPaused.value[videoId] || false;
    if (isPaused) {
      videoElement.play();
      videoPaused.value[videoId] = false;
    } else {
      videoElement.pause();
      videoPaused.value[videoId] = true;
    }
  }

  return {
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
    showCameraModal,
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
  };
}
