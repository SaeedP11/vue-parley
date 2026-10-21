import type { SignalData } from "~/types";

/** How long to wait for ICE gathering before sending a description anyway (as simple-peer). */
const ICE_COMPLETE_TIMEOUT_MS = 5_000;
/** A new connection that isn't up by then counts as failed (the other side may never answer). */
const CONNECT_TIMEOUT_MS = 15_000;
/** How long a connection may stay `disconnected` before we try to repair it. */
const DISCONNECTED_GRACE_MS = 5_000;
/** How long an ICE restart gets before the pair is given up and rebuilt from scratch. */
const ICE_RESTART_TIMEOUT_MS = 10_000;

/**
 * Outgoing video limits by how many remote peers we send to (research R6). In a mesh the upload
 * grows with every participant; capping each copy keeps the total near a one-to-one call's, and
 * leaves audio room first. One remote: the browser's defaults, as before.
 */
const CAMERA_LIMITS: Record<number, { maxBitrate: number; scaleResolutionDownBy: number }> = {
  2: { maxBitrate: 800_000, scaleResolutionDownBy: 1.5 },
  3: { maxBitrate: 500_000, scaleResolutionDownBy: 2 },
};
const screenBitrate = (remotes: number) =>
  remotes <= 1 ? 2_500_000 : remotes === 2 ? 1_500_000 : 1_200_000;

export interface PeerEvents {
  /** A message for the other side, to send over signalling. */
  onSignal(signal: SignalData): void;
  /** A new remote stream (once per stream, with its tracks already added). */
  onStream(stream: MediaStream): void;
  /** The connection is gone, from either side. Fires once. */
  onClose(): void;
  onError(error: Error): void;
  /** The connection's state changed (`connected`, `disconnected`, `failed`, …). */
  onConnectionState?(state: RTCPeerConnectionState): void;
  /** ICE gathering finished, with the types of the local candidates found (for diagnostics). */
  onGatheringComplete?(types: RTCIceCandidateType[]): void;
  /** Diagnostics (state changes, negotiated directions); a no-op unless the host enabled `debug`. */
  log?(...args: unknown[]): void;
}

export interface PeerOptions extends PeerEvents {
  /** Whether this side makes the offers. Exactly one side of a pair must be the initiator. */
  initiator: boolean;
  /** What we send; null to only receive (no camera/mic, or not allowed to use them). */
  stream: MediaStream | null;
  config: RTCConfiguration;
  /** Whether a track we send is our screen share rather than the camera, for its send limits. */
  isScreenTrack?(track: MediaStreamTrack): boolean;
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
  const log = opts.log ?? (() => {});
  const pc = new RTCPeerConnection(opts.config);

  /** What each m-line ended up doing: a one-way call shows here as sendonly/recvonly/inactive. */
  function logTransceivers(when: string) {
    log(
      when,
      pc.getTransceivers().map((t) => ({
        mid: t.mid,
        kind: t.receiver.track.kind,
        direction: t.direction,
        current: t.currentDirection,
        sending: t.sender.track
          ? `${t.sender.track.kind} ${t.sender.track.readyState}${t.sender.track.enabled ? "" : " disabled"}`
          : null,
      })),
    );
  }

  let destroyed = false;
  let negotiating = false;
  let queuedNegotiation = false;
  let batched = false;
  let firstNegotiation = true;
  let channel: RTCDataChannel | null = null;
  const pendingCandidates: RTCIceCandidateInit[] = [];
  const knownStreams = new Set<string>();
  const requestedTransceivers = new WeakSet<RTCRtpTransceiver>();
  const gathered: RTCIceCandidateType[] = [];

  let everConnected = false;
  /** An ICE restart is under way: set until the connection is back, or given up. */
  let restartingIce = false;
  let queuedIceRestart = false;
  /** How many remote peers the call has, which sets our outgoing video limits. */
  let remoteCount = 1;
  /** Whether we ever changed the senders' parameters; until then a one-to-one call keeps the defaults. */
  let tuned = false;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  let disconnectedTimer: ReturnType<typeof setTimeout> | undefined;
  let iceRestartTimer: ReturnType<typeof setTimeout> | undefined;
  const clearTimers = () => {
    clearTimeout(connectTimer);
    clearTimeout(disconnectedTimer);
    clearTimeout(iceRestartTimer);
  };

  function destroy(error?: Error) {
    if (destroyed) return;
    destroyed = true;
    clearTimers();
    log("destroy", error ? `error: ${(error as Error & { code?: string }).code ?? error.message}` : "closed", {
      connection: pc.connectionState,
      ice: pc.iceConnectionState,
      signaling: pc.signalingState,
    });
    try {
      channel?.close();
    } catch {
      // already closed
    }
    pc.ontrack = pc.ondatachannel = pc.onconnectionstatechange = pc.onsignalingstatechange = null;
    pc.onicecandidate = pc.onicegatheringstatechange = pc.oniceconnectionstatechange = null;
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
    dc.onclose = () => {
      log("data channel closed: the other side left or dropped");
      destroy();
    };
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
    log("send", pc.localDescription.type, "candidates:", pc.localDescription.sdp.match(/^a=candidate:/gm)?.length ?? 0);
    opts.onSignal({ type: pc.localDescription.type, sdp: pc.localDescription.sdp });
  }

  async function createOffer(options?: RTCOfferOptions) {
    if (destroyed) return;
    try {
      const offer = await pc.createOffer(options);
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
    if (destroyed) return;
    log("signaling", pc.signalingState);
    if (pc.signalingState !== "stable") return;
    logTransceivers("negotiated");
    negotiating = false;
    // New senders only get encodings once negotiated: (re)apply the limits now.
    void applySenderParams();
    if (queuedIceRestart) {
      queuedIceRestart = false;
      restartIce();
    } else if (queuedNegotiation) {
      queuedNegotiation = false;
      needsNegotiation();
    }
  };

  /**
   * A fresh offer with new ICE credentials: the pair looks for a working path again without
   * tearing down the connection, its tracks or its data channel. Plain offer/answer, so the
   * previous (simple-peer) build accepts it too. Initiator only.
   */
  function restartIce() {
    if (destroyed || !initiator) return;
    if (negotiating) {
      queuedIceRestart = true;
      return;
    }
    negotiating = true;
    log("ICE restart");
    void createOffer({ iceRestart: true });
  }

  /**
   * The connection dropped after having worked: try an ICE restart first, and only if it is not
   * back after a while give up, which makes the session rebuild this one pair.
   */
  function recover() {
    if (destroyed || restartingIce) return;
    restartingIce = true;
    if (initiator) restartIce();
    // Only the initiator makes offers: ask it for one.
    else opts.onSignal({ type: "renegotiate", renegotiate: true });
    iceRestartTimer = setTimeout(() => {
      if (pc.connectionState !== "connected")
        fail("ERR_CONNECTION_FAILURE")(new Error("Connection did not recover."));
    }, ICE_RESTART_TIMEOUT_MS);
  }

  pc.oniceconnectionstatechange = () => log("ice", pc.iceConnectionState);
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    log("connection", state);
    opts.onConnectionState?.(state);
    clearTimeout(disconnectedTimer);
    if (state === "connected") {
      everConnected = true;
      restartingIce = false;
      clearTimers();
    } else if (state === "failed") {
      if (everConnected) recover();
      else fail("ERR_CONNECTION_FAILURE")(new Error("Connection failed."));
    } else if (state === "disconnected" && everConnected) {
      // Often a blip that comes back on its own.
      disconnectedTimer = setTimeout(recover, DISCONNECTED_GRACE_MS);
    }
  };

  // The other side may never answer (it left without a word, or can't reach us).
  connectTimer = setTimeout(() => {
    if (!everConnected) fail("ERR_CONNECTION_FAILURE")(new Error("Connection timed out."));
  }, CONNECT_TIMEOUT_MS);

  /**
   * Sets each sender's encoding limits for a call with `count` remote peers (research R6): video
   * gives way before audio, and each copy of our camera is capped so the total upload stays near
   * a one-to-one call's. Re-applied after every negotiation, since new senders start bare.
   */
  async function applySenderParams(count = remoteCount) {
    remoteCount = count;
    if (destroyed || (count <= 1 && !tuned)) return;
    tuned = true;
    for (const sender of pc.getSenders()) {
      const track = sender.track;
      if (!track) continue;
      const params = sender.getParameters() as RTCRtpSendParameters & {
        degradationPreference?: string;
      };
      const encoding = params.encodings?.[0] as
        | (RTCRtpEncodingParameters & { priority?: string; networkPriority?: string })
        | undefined;
      if (!encoding) continue;
      if (track.kind === "audio") {
        encoding.priority = encoding.networkPriority = "high";
      } else if (opts.isScreenTrack?.(track)) {
        encoding.priority = encoding.networkPriority = "medium";
        encoding.maxBitrate = screenBitrate(count);
        params.degradationPreference = "maintain-resolution";
      } else {
        encoding.priority = encoding.networkPriority = "low";
        const limits = CAMERA_LIMITS[Math.min(count, 3)];
        if (limits) Object.assign(encoding, limits);
        else {
          delete encoding.maxBitrate;
          encoding.scaleResolutionDownBy = 1;
        }
        params.degradationPreference = "balanced";
      }
      try {
        await sender.setParameters(params);
      } catch (err) {
        // Firefox rejects some of these fields; the call works without them.
        log("setParameters", track.kind, err);
      }
    }
  }

  // Which local candidates ICE found: with a relay-only policy, none at all means the TURN server
  // was unreachable or refused the credential, and the connection can never come up.
  pc.onicegatheringstatechange = () => {
    if (pc.iceGatheringState === "complete") opts.onGatheringComplete?.(gathered);
  };
  pc.onicecandidate = (event) => {
    if (event.candidate?.type) gathered.push(event.candidate.type);
  };

  pc.ontrack = (event) => {
    log("track", event.track.kind, "mid", event.transceiver.mid, "streams", event.streams.map((s) => s.id));
    for (const stream of event.streams) {
      // One event per stream, even though each of its tracks arrives separately.
      if (knownStreams.has(stream.id)) continue;
      knownStreams.add(stream.id);
      queueMicrotask(() => !destroyed && opts.onStream(stream));
    }
  };

  if (initiator) setupChannel(pc.createDataChannel(randomLabel()));
  else pc.ondatachannel = (event) => setupChannel(event.channel);

  const stream = opts.stream;
  stream?.getTracks().forEach((track) => pc.addTrack(track, stream));
  // Whatever we have nothing to send of, the offer still has to ask for, or the other side gets
  // an m-line for it only after a transceiverRequest round trip (or never, from an old client).
  if (initiator) {
    for (const kind of ["audio", "video"] as const) {
      if (!stream?.getTracks().some((t) => t.kind === kind))
        pc.addTransceiver(kind, { direction: "recvonly" });
    }
  }
  needsNegotiation();

  return {
    /** Applies a message from the other side. */
    signal(data: SignalData) {
      if (destroyed) return;
      log("receive", data.type ?? (data.renegotiate ? "renegotiate" : data.candidate ? "candidate" : "?"));
      if (data.renegotiate && initiator) {
        // The other side lost the connection: a plain renegotiation would reuse the dead path.
        const broken = pc.connectionState === "failed" || pc.connectionState === "disconnected";
        if (broken && everConnected) recover();
        else needsNegotiation();
      }
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

    /** What each sender sends with, for diagnostics and tests. */
    describeSenders: () =>
      pc.getSenders().flatMap((sender) =>
        sender.track
          ? [{
              kind: sender.track.kind,
              screen: !!opts.isScreenTrack?.(sender.track),
              encodings: sender.getParameters().encodings ?? [],
            }]
          : [],
      ),

    /** Sets the outgoing limits for a call with `count` remote peers (see `applySenderParams`). */
    setRemoteCount: (count: number) => void applySenderParams(count),

    /** Closes the connection; with an `error`, as a failure (`onError`), which rebuilds the pair. */
    destroy: (error?: Error) => destroy(error),
  };
}

export type PeerConnection = ReturnType<typeof createPeer>;
