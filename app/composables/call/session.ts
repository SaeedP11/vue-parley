import { computed, effectScope, ref, watch } from "vue";
import { nanoid } from "nanoid";
import type { CallHandlers, CallMediaState, CallPhase, ParticipantStatus } from "~/types";
import { createSignaling } from "./signaling";
import { usePeers } from "./peers";
import { useCallMedia } from "./media";
import { byJoinOrder, maxParticipantsOf } from "./limits";

export interface CallSessionOptions {
  handlers: CallHandlers;
  channel: string;
  self: { id: string; name: () => string; avatar: () => Blob | undefined };
  /** Shows an error; `key` is a translation key, `params` its named values. */
  notify: (key: string, params?: Record<string, unknown>) => void;
  /** Join with the camera on (the default) or off, for a voice call. */
  video?: boolean;
  /** We turned out to be one too many for the call's cap and are leaving it (`phase` "full"). */
  onFull?: () => void;
}

/** One person (or device) in the call, the user included. */
export interface Participant {
  /** Signalling id, `<user id>:<suffix>`. */
  id: string;
  /** Two devices of one user are two participants with the same `userId`. */
  userId: string;
  name: string;
  isSelf: boolean;
  /** When they entered the call; undefined from older clients, which order last. */
  joinedAt?: number;
  /** Their mic and camera; undefined when unknown (an older client). */
  media?: CallMediaState;
  camera?: MediaStream;
  screen?: MediaStream;
  status: ParticipantStatus;
}

/** How often someone in a call says so to the members outside it. */
export const PRESENCE_INTERVAL = 15_000;

/**
 * A participant we have no working connection to and haven't heard from for this long has gone
 * (a closed tab, a lost network) without a hangup: three missed presence beats.
 */
const SILENT_AFTER_MS = 45_000;

/** Retries for a missing TURN credential, after 2s, 4s and 8s. */
const CREDENTIAL_RETRIES = 3;

const toIceUrl = (url: string) => (/^(stuns?|turns?):/.test(url) ? url : `turn:${url}`);

/**
 * Each plain `turn:` URL also over TCP. Networks that block UDP leave a UDP-only TURN server
 * unreachable, and with the relay-only policy that means no candidate at all; the browser gathers
 * both transports at once, so UDP still wins wherever it works.
 */
function withTcpFallback(urls: string[]) {
  const out = new Set<string>();
  for (const url of urls.map(toIceUrl)) {
    out.add(url);
    if (!url.startsWith("turn:") || /[?&]transport=tcp\b/i.test(url)) continue;
    if (/[?&]transport=udp\b/i.test(url)) out.add(url.replace(/transport=udp\b/i, "transport=tcp"));
    else out.add(`${url}${url.includes("?") ? "&" : "?"}transport=tcp`);
  }
  return [...out];
}

const readDebugFlag = () => {
  try {
    return localStorage.getItem("vue-parley:debug") === "1";
  } catch {
    return false;
  }
};

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

  // `localStorage["vue-parley:debug"] = "1"` turns the logs on in a host that didn't set `debug`.
  const debug = handlers.debug || readDebugFlag();
  const log = debug
    ? (...args: unknown[]) => console.log("[vue-chat:call]", ...args)
    : () => {};

  // A fresh id per call, so rejoining never collides with our previous, stale peers.
  const selfId = `${opts.self.id}:${nanoid()}`;
  const maxParticipants = maxParticipantsOf(handlers);

  let ended = false;
  // Each problem is shown once per call, not once per peer or per retry.
  const notified = new Set<string>();
  const notifyOnce = (key: string) => {
    if (notified.has(key) || ended) return;
    notified.add(key);
    opts.notify(key);
  };

  /** When we entered the call: set once our media is ready, just before the first join. */
  const joinedAt = ref<number | undefined>(undefined);
  /** When each remote was last heard from, for dropping the ones that went silent. */
  const lastHeard: Record<string, number> = {};

  const session = scope.run(() => {
    const signaling = createSignaling(handlers, {
      id: selfId,
      name: opts.self.name,
      joinedAt: () => joinedAt.value,
    });
    const media = useCallMedia({ notify: opts.notify, isMobile });
    const peers = usePeers({
      selfId,
      signaling,
      localStream: media.localStream,
      mediaReady: media.ready,
      screenStream: media.screenStream,
      log,
      onMissingConfig: () => retryCredential(),
      onConnectionFailed: () => notifyOnce("chat.call.errors.connectionFailed"),
      onRelayUnavailable: () => notifyOnce("chat.call.errors.callServerUnreachable"),
      rtcConfig() {
        const policy = handlers.iceTransportPolicy ?? "relay";
        const cred = handlers.credential;
        const iceServers: RTCIceServer[] = cred?.urls?.length
          ? [{ urls: withTcpFallback(cred.urls), username: cred.user, credential: cred.pass }]
          : [];
        // Relay-only without a relay can never connect.
        if (policy === "relay" && !iceServers.length) return null;
        return { iceTransportPolicy: policy, iceServers };
      },
    });

    /** Everyone in the call as we know it, the user first among equals, in join order. */
    const participants = computed<Participant[]>(() => {
      const self: Participant = {
        id: selfId,
        userId: opts.self.id,
        name: opts.self.name(),
        isSelf: true,
        joinedAt: joinedAt.value,
        media: { audio: media.isAudioOn.value, video: media.isVideoOn.value },
        camera: media.localStream.value ?? undefined,
        screen: media.screenStream.value ?? undefined,
        status: "connected",
      };
      const remotes = Object.entries(peers.remoteNames.value).map(
        ([id, name]): Participant => ({
          id,
          userId: id.split(":")[0] ?? id,
          name,
          isSelf: false,
          joinedAt: peers.remoteJoinedAt.value[id],
          media: peers.remoteMedia.value[id],
          camera: peers.remoteVideos.value[id]?.stream,
          screen: peers.remoteScreens.value[id]?.stream,
          status: peers.peerStatus.value[id] ?? "connecting",
        }),
      );
      return [self, ...remotes.sort(byJoinOrder)];
    });

    const participantCount = computed(() => participants.value.length);
    const tileCount = computed(
      () =>
        (media.screenStream.value ? 1 : 0) +
        Object.keys(peers.remoteVideos.value).length +
        Object.keys(peers.remoteScreens.value).length,
    );

    /** Set when the call is over, or we were turned away from it; otherwise `phase` follows the peers. */
    const finalPhase = ref<"full" | "ended" | null>(null);
    const joined = ref(false);
    const hasConnectedRemote = computed(() =>
      Object.values(peers.peerStatus.value).some((s) => s === "connected"),
    );
    const phase = computed<CallPhase>(() => {
      if (finalPhase.value) return finalPhase.value;
      if (!joined.value) return "connecting";
      return hasConnectedRemote.value ? "active" : "waiting";
    });
    /** Someone else was in the call with us at some point: alone again, "everyone else left". */
    const hadOthers = ref(false);
    watch(hasConnectedRemote, (connected) => {
      if (connected) hadOthers.value = true;
    });

    // A pair that comes up (new, or rebuilt after a failure) may have missed our last media
    // state; say it again, once for any number of pairs connecting together.
    let reannounce: ReturnType<typeof setTimeout> | undefined;
    watch(
      () => Object.entries(peers.peerStatus.value).filter(([, s]) => s === "connected").map(([id]) => id).join(),
      (now, before) => {
        const added = now.split(",").some((id) => id && !before?.split(",").includes(id));
        if (!added || !joined.value) return;
        clearTimeout(reannounce);
        reannounce = setTimeout(() => {
          if (!ended) void signaling.trackTypes(media.trackTypes.value, mediaState());
        }, 250);
      },
    );

    // The others learn about a mute or a camera turned off from the same message that describes
    // our streams, so their tiles can show it (an old client just ignores the field).
    watch([media.isAudioOn, media.isVideoOn], () => {
      if (joined.value) void signaling.trackTypes(media.trackTypes.value, mediaState());
    });

    return {
      signaling,
      media,
      peers,
      participants,
      participantCount,
      tileCount,
      phase,
      finalPhase,
      joined,
      hadOthers,
    };
  })!;
  const { signaling, media, peers, participants, finalPhase, joined } = session;

  const mediaState = (): CallMediaState => ({
    audio: media.isAudioOn.value,
    video: media.isVideoOn.value,
  });
  const announceTracks = () => signaling.trackTypes(media.trackTypes.value, mediaState());

  let credentialRetry: ReturnType<typeof setTimeout> | undefined;
  let presenceTimer: ReturnType<typeof setInterval> | undefined;
  let silenceTimer: ReturnType<typeof setInterval> | undefined;
  let capacityCheck: ReturnType<typeof setTimeout> | undefined;
  let credentialAttempts = 0;

  /**
   * Peers are waiting for ICE servers: fetch the credential again, with backoff, and retry them.
   * Without this a failed credential request left the call silently unable to connect.
   */
  function retryCredential() {
    if (credentialRetry || ended) return;
    notifyOnce("chat.call.errors.callServerUnavailable");
    if (credentialAttempts >= CREDENTIAL_RETRIES) return;
    const delay = 2_000 * 2 ** credentialAttempts++;
    log("no ICE servers, fetching the credential again in", delay, "ms");
    credentialRetry = setTimeout(async () => {
      try {
        await handlers.handleGenerateCred();
      } catch (err) {
        console.error("[vue-chat] Fetching the call credential failed:", err);
      }
      credentialRetry = undefined;
      if (!ended) peers.retryPending();
    }, delay);
  }

  async function ringOtherSide() {
    const blob = opts.self.avatar();
    let avatar: string | undefined;
    if (blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      avatar = `data:${blob.type};base64,${btoa(String.fromCharCode(...bytes))}`;
    }
    await signaling.ring(channel, avatar);
  }

  const heard = (from: string) => (lastHeard[from] = Date.now());

  /**
   * The same user is back under a new id (they rejoined) while their old one never said goodbye:
   * drop the old one, or it stays as a ghost tile. Two live devices of one user both stay.
   */
  function dropStaleSelvesOf(from: string) {
    const user = from.split(":")[0];
    for (const id of Object.keys(peers.remoteNames.value)) {
      if (id === from || id.split(":")[0] !== user) continue;
      if (peers.peerStatus.value[id] === "connected") continue;
      log("dropping stale", id, "now rejoined as", from);
      peers.remove(id);
    }
  }

  /**
   * A remote we have no working connection to and haven't heard from in a while has gone without
   * a hangup (a closed tab, a dead network): forget them, or their tile stays forever.
   */
  function dropSilent() {
    const now = Date.now();
    for (const id of Object.keys(peers.remoteNames.value)) {
      if (peers.peerStatus.value[id] === "connected") continue;
      if (now - (lastHeard[id] ?? now) < SILENT_AFTER_MS) continue;
      log("no word from", id, "for", SILENT_AFTER_MS, "ms: gone");
      peers.remove(id);
      delete lastHeard[id];
    }
  }

  /**
   * Two people pressing Join at once can take a call past its cap, which the Join button can't
   * see coming. Every client orders the participants the same way, so whoever ranks past the cap
   * leaves on their own, and only they do (research R4). Waits a moment for near-simultaneous
   * joins to settle.
   */
  function checkCapacity() {
    clearTimeout(capacityCheck);
    capacityCheck = setTimeout(() => {
      if (ended || !joined.value) return;
      const rank = participants.value.slice().sort(byJoinOrder).findIndex((p) => p.isSelf) + 1;
      if (rank <= maxParticipants) return;
      log("ranked", rank, "of", participants.value.length, "with a cap of", maxParticipants, ": leaving");
      finalPhase.value = "full";
      opts.notify("chat.call.errors.callFull", { max: maxParticipants });
      opts.onFull?.();
      end();
    }, 500);
  }

  async function start() {
    await signaling.listen({
      onSignal(from, name, signal) {
        heard(from);
        peers.signal(from, name, signal);
      },
      onJoin(from, name, { restart, joinedAt: at }) {
        log(restart ? "restart from" : "join from", from, name);
        heard(from);
        peers.setJoinedAt(from, at);
        void announceTracks();
        const isNew = restart || !peers.has(from);
        if (!restart) dropStaleSelvesOf(from);
        // The sender has already dropped its end; ours may still look alive, and keeping it would
        // leave the pair waiting on each other forever. A restart aimed at someone else never
        // gets here (signaling filters it), so only this one pair rebuilds.
        if (restart) peers.restart(from, name);
        else peers.add(from, name);
        // Only whoever is already in the call hears a newcomer's join. If the newcomer has to
        // make the offer, it doesn't know about us yet, so announce ourselves back to it.
        // Not before our media is up: our own join follows then, and an early one starts the
        // other side's connect timer while we may still sit at the camera prompt.
        if (isNew && !peers.isInitiator(from) && joined.value) void signaling.join();
        checkCapacity();
      },
      onTrackTypes(from, types, { media: remoteMedia, joinedAt: at }) {
        heard(from);
        peers.remoteStreamTypes.value[from] = types;
        peers.setMedia(from, remoteMedia);
        peers.setJoinedAt(from, at);
        if (at !== undefined) checkCapacity();
      },
      onHangup(from) {
        log("hangup from", from);
        peers.remove(from);
        delete lastHeard[from];
      },
      onPresence(from, at) {
        if (!peers.remoteNames.value[from]) return;
        heard(from);
        peers.setJoinedAt(from, at);
      },
    });

    // A failed credential must not stop us joining: peers fetch it again when they find none.
    try {
      await handlers.handleGenerateCred();
    } catch (err) {
      console.error("[vue-chat] Fetching the call credential failed:", err);
    }
    await media.checkPermissions();
    await media.start();
    // Hung up while the camera prompt was open.
    if (ended) return media.stopAll();
    // A voice call keeps the camera track, disabled, so it can still be turned on mid-call.
    if (opts.video === false && media.isVideoOn.value) media.toggleVideo();
    log("local media ready:", media.localStream.value?.getTracks().map((t) => t.kind));

    joinedAt.value = Date.now();
    void announceTracks();
    void ringOtherSide();
    void signaling.join();
    joined.value = true;

    // Repeated, so members who open the conversation later still see the call, and a call whose
    // last member vanished without a hangup (a closed tab) stops showing once it falls silent.
    const announce = () => void signaling.presence(channel, opts.video !== false);
    announce();
    presenceTimer = setInterval(announce, PRESENCE_INTERVAL);
    silenceTimer = setInterval(dropSilent, 5_000);
  }

  function stopScreenShare() {
    const stream = media.stopScreenShare();
    stream?.getVideoTracks().forEach((track) => peers.removeTrackFromAll(track));
  }

  async function toggleScreenShare() {
    if (media.isScreenSharing.value) return stopScreenShare();
    const stream = await media.startScreenShare(stopScreenShare);
    if (!stream) return;
    // Tell the others this stream is a screen before it reaches them.
    await announceTracks();
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
    finalPhase.value ??= "ended";
    // Who ended it: the hang-up button, or the host reacting to the other side leaving.
    if (debug) console.trace("[vue-chat:call] leaving the call, peers:", Object.keys(peers.peers.value));
    clearTimeout(credentialRetry);
    clearTimeout(capacityCheck);
    clearInterval(presenceTimer);
    clearInterval(silenceTimer);
    void signaling.hangup(channel);
    signaling.stop();
    peers.destroyAll();
    media.stopAll();
    scope.stop();
  }

  return {
    ...session,
    channel,
    selfId,
    joinedAt,
    maxParticipants,
    start,
    end,
    toggleScreenShare,
    switchCamera,
    /** Tries an unreachable participant again. */
    retryPeer: (id: string) => peers.retry(id),
  };
}

export type CallSession = ReturnType<typeof createCallSession>;
