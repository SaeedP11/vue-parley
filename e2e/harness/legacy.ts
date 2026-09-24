// A stand-in for a browser tab still running the previous release (commit 4fbb22e), whose calls
// went through simple-peer. It follows that release's call logic message for message, minus the
// UI, so the e2e suite can check that the current plain-WebRTC build still talks to it.
import Peer from "simple-peer";
import { nextTick } from "vue";

// The old build patched this in for simple-peer.
Object.assign(window, { process: { ...(window as any).process, nextTick } });

type Message = { type: string; payload: any };

const params = new URLSearchParams(location.search);
const userId = `${params.get("user") ?? "legacy"}:${Math.random().toString(36).slice(2)}`;
const name = params.get("name") ?? "Legacy";

const channel = new BroadcastChannel("vue-chat-e2e-call");
const publish = (message: Message) => channel.postMessage(JSON.stringify(message));

const peers: Record<string, Peer.Instance> = {};
const lastSdp: Record<string, string | undefined> = {};
const pendingSignals: Record<string, any> = {};
const remoteTypes: Record<string, { id: string; type: string }[]> = {};
const localTypes: { id: string; type: string }[] = [];
let localStream: MediaStream | null = null;
let screenStream: MediaStream | null = null;

/** What the specs read. */
const state = {
  userId,
  streams: [] as { from: string; kind: "video" | "screen"; id: string }[],
  closed: [] as string[],
  peerCount: () => Object.keys(peers).length,
};

function cleanupPeer(remoteId: string) {
  peers[remoteId]?.destroy();
  delete peers[remoteId];
  delete pendingSignals[remoteId];
  lastSdp[remoteId] = undefined;
  document.querySelectorAll(`[data-from="${remoteId}"]`).forEach((el) => el.remove());
}

function addPeer(remoteId: string, initiator: boolean, remoteName: string) {
  if (!localStream || peers[remoteId]) return;
  const peer = new Peer({
    initiator,
    trickle: false,
    stream: localStream,
    config: { iceTransportPolicy: "all", iceServers: [] },
  });
  if (screenStream) screenStream.getVideoTracks().forEach((t) => peer.addTrack(t, screenStream!));

  peer.on("signal", (signal) =>
    publish({ type: "signal", payload: { from: userId, to: remoteId, signal, name } }),
  );
  peer.on("stream", (stream: MediaStream) => {
    const isScreen = (remoteTypes[remoteId] ?? []).some((t) => t.type === "screen");
    const kind = isScreen && stream.getVideoTracks().length ? "screen" : "video";
    state.streams.push({ from: remoteId, kind, id: stream.id });
    const video = document.createElement("video");
    Object.assign(video, { autoplay: true, playsInline: true, muted: true, srcObject: stream });
    video.dataset.testid = `legacy-remote-${kind}`;
    video.dataset.from = remoteId;
    video.title = remoteName;
    document.getElementById("remotes")!.append(video);
  });
  peer.on("error", () => {
    cleanupPeer(remoteId);
    publish({ type: "join", payload: { from: userId, name } });
  });
  peer.on("close", () => {
    state.closed.push(remoteId);
    cleanupPeer(remoteId);
  });
  peers[remoteId] = peer;

  if (pendingSignals[remoteId]) {
    peer.signal(pendingSignals[remoteId]);
    delete pendingSignals[remoteId];
  }
}

channel.onmessage = (event) => {
  const message: Message = JSON.parse(event.data);
  const from = message.payload.from;
  if (from === userId) return;

  if (
    message.type === "signal" &&
    message.payload.signal &&
    message.payload.to === userId &&
    lastSdp[from] !== message.payload.signal.sdp
  ) {
    if (!peers[from]) addPeer(from, userId > from, message.payload.name);
    if (peers[from]) {
      lastSdp[from] = message.payload.signal.sdp;
      peers[from].signal(message.payload.signal);
    } else {
      pendingSignals[from] = message.payload.signal;
    }
  } else if (message.type === "join") {
    publish({ type: "track_type", payload: { from: userId, types: localTypes } });
    addPeer(from, userId > from, message.payload.name);
  } else if (message.type === "track_type") {
    remoteTypes[from] = message.payload.types;
  }
  // The old build ignored `hangup`: it noticed a leave through simple-peer's data channel.
};

async function shareScreen() {
  screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  localTypes.push({ id: screenStream.id, type: "screen" });
  publish({ type: "track_type", payload: { from: userId, types: localTypes } });
  Object.values(peers).forEach((peer) =>
    screenStream!.getVideoTracks().forEach((t) => peer.addTrack(t, screenStream!)),
  );
}

function leave() {
  Object.values(peers).forEach((peer) => peer.destroy());
  localStream?.getTracks().forEach((t) => t.stop());
}

(async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localTypes.push({ id: localStream.id, type: "webcam_audio" });
  (document.querySelector("[data-testid=legacy-local]") as HTMLVideoElement).srcObject =
    localStream;

  publish({ type: "track_type", payload: { from: userId, types: localTypes } });
  publish({ type: "call", payload: { from: userId, name, channel: "c1", avatar: "" } });
  publish({ type: "join", payload: { from: userId, name } });
  Object.assign(window, { __legacy: { ...state, shareScreen, leave, ready: true } });
})();
