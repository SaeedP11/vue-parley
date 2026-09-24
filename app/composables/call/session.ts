import { computed, effectScope, nextTick } from "vue";
import { nanoid } from "nanoid";
import type { CallHandlers } from "~/types";
import { createSignaling } from "./signaling";
import { usePeers } from "./peers";
import { useCallMedia } from "./media";

export interface CallSessionOptions {
  handlers: CallHandlers;
  channel: string;
  self: { id: string; name: () => string; avatar: () => Blob | undefined };
  /** Shows an error; `key` is a translation key. */
  notify: (key: string) => void;
}

const toIceUrl = (url: string) =>
  url.startsWith("stun:") || url.startsWith("turn:") ? url : `turn:${url}`;

const isMobile = () =>
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
  !!window.matchMedia?.("(max-width: 768px)").matches;

/**
 * One call, from joining to hanging up: signalling, peer connections and local media. It lives in
 * the call store, not in a component, so the call carries on while no call view is mounted.
 */
export function createCallSession(opts: CallSessionOptions) {
  const { handlers, channel } = opts;
  // Watchers inside (e.g. deferred peers) belong to the call, not to whichever component
  // happened to start it.
  const scope = effectScope(true);

  const log = handlers.debug
    ? (...args: unknown[]) => console.log("[vue-chat:call]", ...args)
    : () => {};

  // A fresh id per call, so rejoining never collides with our previous, stale peers.
  const selfId = `${opts.self.id}:${nanoid()}`;

  const session = scope.run(() => {
    const signaling = createSignaling(handlers, { id: selfId, name: opts.self.name });
    const media = useCallMedia({ notify: opts.notify, isMobile });
    const peers = usePeers({
      selfId,
      signaling,
      localStream: media.localStream,
      screenStream: media.screenStream,
      log,
      rtcConfig() {
        const policy = handlers.iceTransportPolicy ?? "relay";
        const cred = handlers.credential;
        const iceServers: RTCIceServer[] = cred?.urls?.length
          ? [{ urls: cred.urls.map(toIceUrl), username: cred.user, credential: cred.pass }]
          : [];
        // Relay-only without a relay can never connect.
        if (policy === "relay" && !iceServers.length) return null;
        return { iceTransportPolicy: policy, iceServers };
      },
    });

    const participantCount = computed(() => Object.keys(peers.peers.value).length + 1);
    const tileCount = computed(
      () =>
        (media.screenStream.value ? 1 : 0) +
        Object.keys(peers.remoteVideos.value).length +
        Object.keys(peers.remoteScreens.value).length,
    );

    return { signaling, media, peers, participantCount, tileCount };
  })!;
  const { signaling, media, peers } = session;

  let ended = false;

  async function ringOtherSide() {
    const blob = opts.self.avatar();
    let avatar: string | undefined;
    if (blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      avatar = `data:${blob.type};base64,${btoa(String.fromCharCode(...bytes))}`;
    }
    await signaling.ring(channel, avatar);
  }

  async function start() {
    // simple-peer expects Node's process.nextTick.
    const w = window as unknown as { process?: { nextTick?: unknown } };
    w.process = { ...w.process, nextTick };

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

    await handlers.handleGenerateCred();
    await media.checkPermissions();
    await media.start();
    // Hung up while the camera prompt was open.
    if (ended) return media.stopAll();
    log("local media ready:", media.localStream.value?.getTracks().map((t) => t.kind));

    void signaling.trackTypes(media.trackTypes.value);
    void ringOtherSide();
    void signaling.join();
  }

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

  /** Swaps cameras; returns the local stream so a view can refresh its preview. */
  async function switchCamera(deviceId: string) {
    const track = await media.switchCamera(deviceId);
    const stream = media.localStream.value;
    if (track && stream) peers.replaceVideoTrack(track, stream);
    return stream;
  }

  /** Leaves the call: tells the others, releases camera and mic, closes every connection. */
  function end() {
    if (ended) return;
    ended = true;
    void signaling.hangup(channel);
    signaling.stop();
    peers.destroyAll();
    media.stopAll();
    scope.stop();
  }

  return {
    ...session,
    channel,
    start,
    end,
    toggleScreenShare,
    switchCamera,
  };
}

export type CallSession = ReturnType<typeof createCallSession>;
