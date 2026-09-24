import { ref, watch, type Ref } from "vue";
import Peer from "simple-peer";
import type { SignalData } from "~/types";
import type { Signaling, TrackTypes } from "./signaling";

export interface RemoteStream {
  name: string;
  stream: MediaStream;
}

export interface PeerOptions {
  selfId: string;
  signaling: Signaling;
  localStream: Ref<MediaStream | null>;
  screenStream: Ref<MediaStream | null>;
  /** ICE servers and policy for each new connection, or null when none are usable yet. */
  rtcConfig: () => RTCConfiguration | null;
  log: (...args: unknown[]) => void;
}

/**
 * One simple-peer connection per remote participant, plus the streams they send us.
 *
 * Who makes the offer is decided by comparing ids, so both sides agree without a round trip.
 * A peer can't be created before our own media exists; such requests wait until it does.
 */
export function usePeers(opts: PeerOptions) {
  const { selfId, signaling, localStream, screenStream, log } = opts;

  const peers = ref<Record<string, Peer.Instance>>({});
  const remoteVideos = ref<Record<string, RemoteStream>>({});
  const remoteScreens = ref<Record<string, RemoteStream>>({});
  const remoteStreamTypes = ref<Record<string, TrackTypes>>({});
  /** Peers asked for before our media was ready. */
  const pending = ref<Record<string, { initiator: boolean; name: string }>>({});
  /** Signals that arrived for a peer that doesn't exist yet. */
  const pendingSignals: Record<string, Peer.SignalData> = {};
  /** Last SDP applied per peer, so a re-delivered message isn't applied twice. */
  const lastSdp: Record<string, string | undefined> = {};

  const isInitiator = (remoteId: string) => selfId > remoteId;
  const has = (remoteId: string) => !!peers.value[remoteId] || !!pending.value[remoteId];

  function remove(remoteId: string) {
    peers.value[remoteId]?.destroy();
    delete peers.value[remoteId];
    delete remoteVideos.value[remoteId];
    delete remoteScreens.value[remoteId];
    delete pending.value[remoteId];
    delete pendingSignals[remoteId];
    delete lastSdp[remoteId];
  }

  function add(remoteId: string, name: string) {
    if (peers.value[remoteId]) return;
    const initiator = isInitiator(remoteId);

    if (!localStream.value) {
      log("local media not ready, deferring peer", remoteId);
      pending.value[remoteId] = { initiator, name };
      return;
    }

    const config = opts.rtcConfig();
    if (!config) {
      log("no ICE servers available, cannot create peer for", remoteId);
      return;
    }

    let peer: Peer.Instance;
    try {
      peer = new Peer({ initiator, trickle: false, stream: localStream.value, config });
    } catch (err) {
      console.error("[vue-chat] Peer constructor threw:", err);
      return;
    }
    log("created peer", remoteId, "initiator:", initiator);

    const screen = screenStream.value;
    screen?.getVideoTracks().forEach((track) => peer.addTrack(track, screen));

    peer.on("signal", (signal: SignalData) => void signaling.signal(remoteId, signal));

    peer.on("stream", (stream: MediaStream) => {
      log("stream from", remoteId, stream.getTracks().map((t) => t.kind));
      const announced = remoteStreamTypes.value[remoteId] ?? [];
      const isScreen = announced.some((t) => t.type === "screen");
      if (isScreen && stream.getVideoTracks().length > 0) {
        remoteScreens.value[remoteId] = { name, stream };
      } else {
        remoteVideos.value[remoteId] = { name, stream };
      }
    });

    peer.on("error", (err: Error) => {
      console.error("[vue-chat] Peer error for", remoteId, err);
      remove(remoteId);
      // Announce ourselves again so the pair can start over.
      void signaling.join();
    });

    peer.on("close", () => {
      log("peer closed", remoteId);
      remove(remoteId);
    });

    peers.value[remoteId] = peer;

    const queued = pendingSignals[remoteId];
    if (queued) {
      delete pendingSignals[remoteId];
      peer.signal(queued);
    }
  }

  /** Applies a signal from `remoteId`, creating the peer first if needed. */
  function signal(remoteId: string, name: string, data: SignalData & { sdp: string }) {
    if (lastSdp[remoteId] === data.sdp) return;
    if (!peers.value[remoteId]) add(remoteId, name);

    const peer = peers.value[remoteId];
    const payload = data as Peer.SignalData;
    if (peer) {
      lastSdp[remoteId] = data.sdp;
      peer.signal(payload);
    } else {
      log("peer still deferred, queueing signal for", remoteId);
      pendingSignals[remoteId] = payload;
    }
  }

  /** Sends a track to every connected peer, or takes it back. */
  function addTrackToAll(track: MediaStreamTrack, stream: MediaStream) {
    Object.values(peers.value).forEach((peer) => peer.addTrack(track, stream));
  }

  function removeTrackFromAll(track: MediaStreamTrack, stream: MediaStream) {
    Object.values(peers.value).forEach((peer) => {
      const senders: RTCRtpSender[] = (peer as any)._pc?.getSenders?.() ?? [];
      if (senders.some((s) => s.track?.id === track.id)) peer.removeTrack(track, stream);
    });
  }

  /** Swaps the outgoing camera track on every peer (after switching cameras). */
  function replaceVideoTrack(track: MediaStreamTrack, stream: MediaStream) {
    Object.values(peers.value).forEach((peer) => {
      const senders: RTCRtpSender[] = (peer as any)._pc?.getSenders?.() ?? [];
      const sender = senders.find((s) => s.track?.kind === "video");
      if (sender) void sender.replaceTrack(track);
      else peer.addTrack(track, stream);
    });
  }

  function destroyAll() {
    Object.values(peers.value).forEach((peer) => {
      try {
        peer.destroy();
      } catch {
        // already gone
      }
    });
    peers.value = {};
  }

  // Create the peers that were waiting for our media.
  watch(
    localStream,
    (stream) => {
      if (!stream) return;
      const waiting = { ...pending.value };
      pending.value = {};
      for (const [remoteId, { name }] of Object.entries(waiting)) add(remoteId, name);
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
    remove,
    signal,
    addTrackToAll,
    removeTrackFromAll,
    replaceVideoTrack,
    destroyAll,
  };
}
