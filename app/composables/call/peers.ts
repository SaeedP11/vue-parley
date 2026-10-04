import { markRaw, ref, watch, type Ref } from "vue";
import type { SignalData } from "~/types";
import { createPeer, type PeerConnection } from "./peer";
import type { Signaling, TrackTypes } from "./signaling";

export interface RemoteStream {
  name: string;
  stream: MediaStream;
}

export interface PeerOptions {
  selfId: string;
  signaling: Signaling;
  localStream: Ref<MediaStream | null>;
  /** Whether getting our own media is over, successfully or not. Peers wait for it. */
  mediaReady: Ref<boolean>;
  screenStream: Ref<MediaStream | null>;
  /** ICE servers and policy for each new connection, or null when none are usable yet. */
  rtcConfig: () => RTCConfiguration | null;
  /** A peer is waiting for ICE servers; call `retryPending()` once there may be some. */
  onMissingConfig: () => void;
  /** A connection to `remoteId` failed or never came up. */
  onConnectionFailed: (remoteId: string) => void;
  /** ICE found no relay candidate although the policy is relay-only: the TURN server is unusable. */
  onRelayUnavailable: () => void;
  log: (...args: unknown[]) => void;
}

/**
 * One connection per remote participant, plus the streams they send us.
 *
 * Who makes the offer is decided by comparing ids, so both sides agree without a round trip.
 * A peer can't be created before our own media exists; such requests wait until it does.
 */
export function usePeers(opts: PeerOptions) {
  const { selfId, signaling, localStream, screenStream, log } = opts;

  const peers = ref<Record<string, PeerConnection>>({});
  const remoteVideos = ref<Record<string, RemoteStream>>({});
  const remoteScreens = ref<Record<string, RemoteStream>>({});
  const remoteStreamTypes = ref<Record<string, TrackTypes>>({});
  /** Peers asked for before our media was ready, or while there were no ICE servers. */
  const pending = ref<Record<string, { name: string }>>({});
  /** Signals that arrived for a peer that doesn't exist yet, in order. */
  const pendingSignals: Record<string, SignalData[]> = {};
  /** Last SDP applied per peer, so a re-delivered message isn't applied twice. */
  const lastSdp: Record<string, string | undefined> = {};

  let relayWarned = false;

  const isInitiator = (remoteId: string) => selfId > remoteId;
  const has = (remoteId: string) => !!peers.value[remoteId] || !!pending.value[remoteId];

  function remove(remoteId: string) {
    const peer = peers.value[remoteId];
    delete peers.value[remoteId];
    peer?.destroy();
    delete remoteVideos.value[remoteId];
    delete remoteScreens.value[remoteId];
    delete pending.value[remoteId];
    delete pendingSignals[remoteId];
    delete lastSdp[remoteId];
  }

  /** Whether `stream` is the remote's screen share, going by what they announced. */
  function isScreen(remoteId: string, stream: MediaStream) {
    const announced = remoteStreamTypes.value[remoteId] ?? [];
    const match = announced.find((t) => t.id === stream.id);
    if (match) return match.type === "screen";
    // Stream ids didn't survive the trip: fall back to "they announced a screen".
    return announced.some((t) => t.type === "screen");
  }

  function onRemoteStream(remoteId: string, name: string, stream: MediaStream) {
    log("stream from", remoteId, stream.getTracks().map((t) => t.kind));
    const target =
      isScreen(remoteId, stream) && stream.getVideoTracks().length > 0
        ? remoteScreens
        : remoteVideos;
    target.value[remoteId] = { name, stream };

    // A stopped screen share leaves an empty stream behind; drop its tile.
    stream.addEventListener("removetrack", () => {
      if (stream.getTracks().length > 0) return;
      if (target.value[remoteId]?.stream === stream) delete target.value[remoteId];
    });
  }

  function add(remoteId: string, name: string) {
    if (peers.value[remoteId]) return;

    if (!opts.mediaReady.value) {
      log("local media not ready, deferring peer", remoteId);
      pending.value[remoteId] = { name };
      return;
    }

    const config = opts.rtcConfig();
    if (!config) {
      log("no ICE servers available, deferring peer", remoteId);
      pending.value[remoteId] = { name };
      opts.onMissingConfig();
      return;
    }
    delete pending.value[remoteId];
    if (!localStream.value) log("no local media, receiving only from", remoteId);

    const initiator = isInitiator(remoteId);
    let peer: PeerConnection;
    try {
      peer = createPeer({
        initiator,
        stream: localStream.value,
        config,
        log: (...args) => log("peer", remoteId, ...args),
        onSignal: (signal) => void signaling.signal(remoteId, signal),
        onStream: (stream) => onRemoteStream(remoteId, name, stream),
        onGatheringComplete(types) {
          log("ICE candidates for", remoteId, types);
          if (config.iceTransportPolicy === "relay" && !types.includes("relay") && !relayWarned) {
            relayWarned = true;
            console.error("[vue-chat] No relay candidate: the TURN server is unreachable or rejected the credential");
            opts.onRelayUnavailable();
          }
        },
        onError(err) {
          console.error("[vue-chat] Peer error for", remoteId, err);
          opts.onConnectionFailed(remoteId);
          // Announce ourselves again so the pair can start over. `restart` makes the other side
          // drop its half of this connection, which it may not have noticed is dead.
          void signaling.join({ restart: true });
        },
        onClose() {
          log("peer closed", remoteId);
          // Only if it is still the current one: a replaced peer closing must not remove its successor.
          if (peers.value[remoteId] === peer) remove(remoteId);
        },
      });
    } catch (err) {
      console.error("[vue-chat] Could not create peer connection:", err);
      return;
    }
    log("created peer", remoteId, "initiator:", initiator);

    const screen = screenStream.value;
    screen?.getVideoTracks().forEach((track) => peer.addTrack(track, screen));

    peers.value[remoteId] = markRaw(peer);

    const queued = pendingSignals[remoteId];
    delete pendingSignals[remoteId];
    queued?.forEach((data) => peer.signal(data));
  }

  /** Throws away whatever we have with `remoteId` and connects again. */
  function restart(remoteId: string, name: string) {
    log("restarting peer", remoteId);
    remove(remoteId);
    add(remoteId, name);
  }

  /** Tries the deferred peers again. */
  function retryPending() {
    const waiting = { ...pending.value };
    pending.value = {};
    for (const [remoteId, { name }] of Object.entries(waiting)) add(remoteId, name);
  }

  /** Applies a signal from `remoteId`, creating the peer first if needed. */
  function signal(remoteId: string, name: string, data: SignalData & { sdp: string }) {
    if (data.sdp && lastSdp[remoteId] === data.sdp) return;
    if (!peers.value[remoteId]) add(remoteId, name);

    const peer = peers.value[remoteId];
    if (peer) {
      if (data.sdp) lastSdp[remoteId] = data.sdp;
      peer.signal(data);
    } else {
      log("peer still deferred, queueing signal for", remoteId);
      (pendingSignals[remoteId] ??= []).push(data);
    }
  }

  /** Sends a track to every connected peer, or takes it back. */
  function addTrackToAll(track: MediaStreamTrack, stream: MediaStream) {
    Object.values(peers.value).forEach((peer) => peer.addTrack(track, stream));
  }

  function removeTrackFromAll(track: MediaStreamTrack) {
    Object.values(peers.value).forEach((peer) => peer.removeTrack(track));
  }

  /** Swaps the outgoing camera track on every peer (after switching cameras). */
  function replaceVideoTrack(track: MediaStreamTrack, stream: MediaStream) {
    Object.values(peers.value).forEach((peer) => peer.replaceVideoTrack(track, stream));
  }

  function destroyAll() {
    const all = Object.values(peers.value);
    peers.value = {};
    all.forEach((peer) => peer.destroy());
  }

  // Create the peers that were waiting for our media, with or without any.
  watch(
    opts.mediaReady,
    (ready) => {
      if (ready) retryPending();
    },
    { immediate: true },
  );

  return {
    peers,
    remoteVideos,
    remoteScreens,
    remoteStreamTypes,
    isInitiator,
    has,
    add,
    restart,
    retryPending,
    remove,
    signal,
    addTrackToAll,
    removeTrackFromAll,
    replaceVideoTrack,
    destroyAll,
  };
}
