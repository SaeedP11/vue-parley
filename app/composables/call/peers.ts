import { markRaw, ref, watch, type Ref } from "vue";
import type { CallMediaState, ParticipantStatus, SignalData } from "~/types";
import { createPeer, type PeerConnection } from "./peer";
import type { Signaling, TrackTypes } from "./signaling";

/**
 * Failures in a row after which a pair is left alone as unreachable: the first one and two
 * rebuilds (research R5).
 */
const MAX_FAILURES = 3;

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

  // What we know of each remote participant. Unlike `peers`, an entry outlives a failed
  // connection: the participant is still in the call while their pair is rebuilt.
  const remoteNames = ref<Record<string, string>>({});
  const remoteJoinedAt = ref<Record<string, number | undefined>>({});
  /** Their mic and camera, as announced; undefined from clients too old to say. */
  const remoteMedia = ref<Record<string, CallMediaState | undefined>>({});
  const peerStatus = ref<Record<string, ParticipantStatus>>({});
  /** Consecutive failures per pair, reset once it connects. */
  const restarts: Record<string, number> = {};

  let relayWarned = false;

  const isInitiator = (remoteId: string) => selfId > remoteId;
  const has = (remoteId: string) => !!peers.value[remoteId] || !!pending.value[remoteId];

  /** Closes our connection to `remoteId` and drops its streams, but remembers who they are. */
  function disconnect(remoteId: string) {
    const peer = peers.value[remoteId];
    delete peers.value[remoteId];
    peer?.destroy();
    delete remoteVideos.value[remoteId];
    delete remoteScreens.value[remoteId];
    delete pending.value[remoteId];
    delete pendingSignals[remoteId];
    delete lastSdp[remoteId];
  }

  /** `remoteId` left the call: forgets them entirely. */
  function remove(remoteId: string) {
    disconnect(remoteId);
    delete remoteNames.value[remoteId];
    delete remoteJoinedAt.value[remoteId];
    delete remoteMedia.value[remoteId];
    delete remoteStreamTypes.value[remoteId];
    delete peerStatus.value[remoteId];
    delete restarts[remoteId];
  }

  function markConnected(remoteId: string) {
    peerStatus.value[remoteId] = "connected";
    delete restarts[remoteId];
  }

  /** How many remote peers we send to, which sets each one's outgoing video limits. */
  const remoteCount = () => Object.keys(peers.value).length;

  function setMedia(remoteId: string, media: CallMediaState | undefined) {
    if (media) remoteMedia.value[remoteId] = media;
  }

  function setJoinedAt(remoteId: string, joinedAt: number | undefined) {
    if (joinedAt !== undefined) remoteJoinedAt.value[remoteId] = joinedAt;
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
    markConnected(remoteId);

    // A stopped screen share leaves an empty stream behind; drop its tile.
    stream.addEventListener("removetrack", () => {
      if (stream.getTracks().length > 0) return;
      if (target.value[remoteId]?.stream === stream) delete target.value[remoteId];
    });
  }

  function add(remoteId: string, name: string) {
    if (peers.value[remoteId]) return;
    remoteNames.value[remoteId] = name;
    // Rebuilding a failed pair keeps saying so; an unreachable one only changes once it connects
    // or the user retries, though attempts the other side makes are still taken up.
    const status = peerStatus.value[remoteId];
    if (status !== "recovering" && status !== "unreachable") peerStatus.value[remoteId] = "connecting";

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
    let failed = false;
    try {
      peer = createPeer({
        initiator,
        stream: localStream.value,
        config,
        log: (...args) => log("peer", remoteId, ...args),
        onSignal: (signal) => void signaling.signal(remoteId, signal),
        onStream: (stream) => onRemoteStream(remoteId, name, stream),
        isScreenTrack: (track) => !!screenStream.value?.getTracks().includes(track),
        // A receive-only remote sends no stream, so the connection itself says it is up.
        onConnectionState(state) {
          if (peers.value[remoteId] !== peer) return;
          if (state === "connected") markConnected(remoteId);
        },
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
          if (peers.value[remoteId] !== peer) return;
          failed = true;
          opts.onConnectionFailed(remoteId);
          // Rebuilding keeps failing: say so on their tile and stop, until the user retries.
          if (peerStatus.value[remoteId] === "unreachable" || countFailure(remoteId)) return;
          peerStatus.value[remoteId] = "recovering";
          // Announce ourselves again to this one participant so the pair can start over. `restart`
          // makes them drop their half of this connection, which they may not have noticed is
          // dead. Aimed with `to`: a restart to everyone made every other participant drop its
          // working link to us too.
          void signaling.join({ restart: true, to: remoteId });
        },
        onClose() {
          log("peer closed", remoteId);
          // Only if it is still the current one: a replaced peer closing must not remove its successor.
          if (peers.value[remoteId] !== peer) return;
          if (!failed) return remove(remoteId); // they left
          // A failed pair: the participant stays while we build our half again, unless we gave up.
          disconnect(remoteId);
          if (peerStatus.value[remoteId] !== "unreachable") add(remoteId, name);
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
    peer.setRemoteCount(remoteCount());

    const queued = pendingSignals[remoteId];
    delete pendingSignals[remoteId];
    queued?.forEach((data) => peer.signal(data));
  }

  /** Counts one more failure of the pair with `remoteId`; true once it is time to give up. */
  function countFailure(remoteId: string) {
    restarts[remoteId] = (restarts[remoteId] ?? 0) + 1;
    if (restarts[remoteId] < MAX_FAILURES) return false;
    log("giving up on", remoteId, "after", restarts[remoteId], "failures");
    peerStatus.value[remoteId] = "unreachable";
    return true;
  }

  /**
   * The other side dropped its half of our connection and asks us to drop ours: throw away what
   * we have with `remoteId` and connect again. A request that comes while the pair is still
   * failing counts as one more failure: both sides often give up at the same moment, and each
   * one's request would otherwise reset the other's attempt before it could count.
   */
  function restart(remoteId: string, name: string) {
    log("restarting peer", remoteId);
    const status = peerStatus.value[remoteId];
    if (status === "connecting" || status === "recovering") countFailure(remoteId);
    disconnect(remoteId);
    add(remoteId, name);
  }

  /** The user asked to try an unreachable participant again: start over, on both sides. */
  function retry(remoteId: string) {
    const name = remoteNames.value[remoteId];
    if (name === undefined) return;
    delete restarts[remoteId];
    peerStatus.value[remoteId] = "connecting";
    void signaling.join({ restart: true, to: remoteId });
    disconnect(remoteId);
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

  // Each copy of our camera gets less upload as the call grows, and more again as it shrinks.
  watch(
    () => Object.keys(peers.value).length,
    (count) => Object.values(peers.value).forEach((peer) => peer.setRemoteCount(count)),
  );

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
    remoteNames,
    remoteJoinedAt,
    remoteMedia,
    peerStatus,
    setMedia,
    setJoinedAt,
    isInitiator,
    has,
    add,
    restart,
    retry,
    retryPending,
    remove,
    signal,
    addTrackToAll,
    removeTrackFromAll,
    replaceVideoTrack,
    destroyAll,
  };
}
