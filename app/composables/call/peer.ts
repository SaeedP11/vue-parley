import type { SignalData } from "~/types";

/** How long to wait for ICE gathering before sending a description anyway (as simple-peer). */
const ICE_COMPLETE_TIMEOUT_MS = 5_000;

export interface PeerEvents {
  /** A message for the other side, to send over signalling. */
  onSignal(signal: SignalData): void;
  /** A new remote stream (once per stream, with its tracks already added). */
  onStream(stream: MediaStream): void;
  /** The connection is gone, from either side. Fires once. */
  onClose(): void;
  onError(error: Error): void;
}

export interface PeerOptions extends PeerEvents {
  /** Whether this side makes the offers. Exactly one side of a pair must be the initiator. */
  initiator: boolean;
  stream: MediaStream;
  config: RTCConfiguration;
}

// Without trickle ICE, the candidates travel inside the SDP; don't advertise trickle support.
const withoutTrickle = (sdp: string) => sdp.replace(/a=ice-options:trickle\s\n/g, "");

const randomLabel = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

/**
 * One WebRTC connection to one remote participant, on the plain browser API.
 *
 * It speaks simple-peer's wire protocol (with `trickle: false`), so it interoperates with clients
 * still running the previous, simple-peer based build:
 * - full offers/answers with the ICE candidates inside the SDP;
 * - only the initiator makes offers; the other side asks with `{ type: "renegotiate" }` and, for
 *   tracks the offer had no room for, `{ type: "transceiverRequest" }`, so offers never collide;
 * - a data channel whose closing tells either side that the other one left.
 */
export function createPeer(opts: PeerOptions) {
  const { initiator } = opts;
  const pc = new RTCPeerConnection(opts.config);

  let destroyed = false;
  let negotiating = false;
  let queuedNegotiation = false;
  let batched = false;
  let firstNegotiation = true;
  let channel: RTCDataChannel | null = null;
  const pendingCandidates: RTCIceCandidateInit[] = [];
  const knownStreams = new Set<string>();
  const requestedTransceivers = new WeakSet<RTCRtpTransceiver>();

  function destroy(error?: Error) {
    if (destroyed) return;
    destroyed = true;
    try {
      channel?.close();
    } catch {
      // already closed
    }
    pc.ontrack = pc.ondatachannel = pc.onconnectionstatechange = pc.onsignalingstatechange = null;
    pc.close();
    if (error) opts.onError(error);
    opts.onClose();
  }

  const fail = (code: string) => (err: unknown) =>
    destroy(Object.assign(err instanceof Error ? err : new Error(String(err)), { code }));

  function setupChannel(dc: RTCDataChannel) {
    channel = dc;
    // The other side destroying its connection closes the channel: that is how a leave is seen
    // without waiting for ICE to time out.
    dc.onclose = () => destroy();
  }

  function waitForIce() {
    if (pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, ICE_COMPLETE_TIMEOUT_MS);
      function done() {
        clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
      function check() {
        if (pc.iceGatheringState === "complete") done();
      }
      pc.addEventListener("icegatheringstatechange", check);
    });
  }

  /** Sends our local description once its candidates are in. */
  async function sendDescription() {
    await waitForIce();
    if (destroyed || !pc.localDescription) return;
    opts.onSignal({ type: pc.localDescription.type, sdp: pc.localDescription.sdp });
  }

  async function createOffer() {
    if (destroyed) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription({ type: "offer", sdp: withoutTrickle(offer.sdp ?? "") });
      await sendDescription();
    } catch (err) {
      fail("ERR_CREATE_OFFER")(err);
    }
  }

  async function createAnswer() {
    if (destroyed) return;
    try {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription({ type: "answer", sdp: withoutTrickle(answer.sdp ?? "") });
      await sendDescription();
      if (!initiator) requestMissingTransceivers();
    } catch (err) {
      fail("ERR_CREATE_ANSWER")(err);
    }
  }

  /** Our tracks the initiator's offer had no m-line for: ask it to add one. */
  function requestMissingTransceivers() {
    for (const transceiver of pc.getTransceivers()) {
      if (transceiver.mid || !transceiver.sender.track || requestedTransceivers.has(transceiver))
        continue;
      requestedTransceivers.add(transceiver);
      opts.onSignal({
        type: "transceiverRequest",
        transceiverRequest: { kind: transceiver.sender.track.kind },
      });
    }
  }

  function negotiate() {
    if (destroyed) return;
    if (negotiating) {
      queuedNegotiation = true;
      return;
    }
    negotiating = true;
    if (initiator) setTimeout(() => void createOffer(), 0);
    else opts.onSignal({ type: "renegotiate", renegotiate: true });
  }

  /** Batches changes made in one tick into a single negotiation. */
  function needsNegotiation() {
    if (batched) return;
    batched = true;
    queueMicrotask(() => {
      batched = false;
      // The first negotiation is the initiator's offer; the other side just answers it.
      if (initiator || !firstNegotiation) negotiate();
      firstNegotiation = false;
    });
  }

  pc.onsignalingstatechange = () => {
    if (destroyed || pc.signalingState !== "stable") return;
    negotiating = false;
    if (queuedNegotiation) {
      queuedNegotiation = false;
      needsNegotiation();
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") fail("ERR_CONNECTION_FAILURE")(new Error("Connection failed."));
  };

  pc.ontrack = (event) => {
    for (const stream of event.streams) {
      // One event per stream, even though each of its tracks arrives separately.
      if (knownStreams.has(stream.id)) continue;
      knownStreams.add(stream.id);
      queueMicrotask(() => !destroyed && opts.onStream(stream));
    }
  };

  if (initiator) setupChannel(pc.createDataChannel(randomLabel()));
  else pc.ondatachannel = (event) => setupChannel(event.channel);

  opts.stream.getTracks().forEach((track) => pc.addTrack(track, opts.stream));
  needsNegotiation();

  return {
    /** Applies a message from the other side. */
    signal(data: SignalData) {
      if (destroyed) return;
      if (data.renegotiate && initiator) needsNegotiation();
      if (data.transceiverRequest && initiator) {
        const { kind, init } = data.transceiverRequest;
        pc.addTransceiver(kind, init);
        needsNegotiation();
      }
      if (data.candidate) {
        if (pc.remoteDescription?.type) void pc.addIceCandidate(data.candidate).catch(() => {});
        else pendingCandidates.push(data.candidate);
      }
      if (data.sdp) {
        const type = data.type as RTCSdpType;
        pc.setRemoteDescription({ type, sdp: data.sdp })
          .then(() => {
            if (destroyed) return;
            pendingCandidates.splice(0).forEach((c) => void pc.addIceCandidate(c).catch(() => {}));
            if (type === "offer") void createAnswer();
          })
          .catch(fail("ERR_SET_REMOTE_DESCRIPTION"));
      }
    },

    addTrack(track: MediaStreamTrack, stream: MediaStream) {
      if (destroyed) return;
      pc.addTrack(track, stream);
      needsNegotiation();
    },

    removeTrack(track: MediaStreamTrack) {
      if (destroyed) return;
      const sender = pc.getSenders().find((s) => s.track === track);
      if (!sender) return;
      pc.removeTrack(sender);
      needsNegotiation();
    },

    /** Swaps the outgoing video track in place (no renegotiation), or adds it if none is sent. */
    replaceVideoTrack(track: MediaStreamTrack, stream: MediaStream) {
      if (destroyed) return;
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) void sender.replaceTrack(track);
      else this.addTrack(track, stream);
    },

    /** Whether we currently send this track. */
    isSending(track: MediaStreamTrack) {
      return pc.getSenders().some((s) => s.track === track);
    },

    destroy: () => destroy(),
  };
}

export type PeerConnection = ReturnType<typeof createPeer>;
