// Call signalling over BroadcastChannel, so two tabs of the same browser can call each other just
// as two clients behind a real pub/sub would. No server needed.
import type { CallHandlers, CallMessageSchema } from "../app/types";

export interface FakeCallHandlers extends CallHandlers {
  /** Everything this tab published, oldest first. */
  published: CallMessageSchema[];
}

export function createBroadcastCallHandlers(
  channelName = "vue-chat-fake-call",
): FakeCallHandlers {
  const channel = new BroadcastChannel(channelName);
  const listeners = new Map<number, (m: CallMessageSchema) => Promise<void>>();
  const published: CallMessageSchema[] = [];
  let nextId = 0;

  channel.onmessage = (e) => {
    const message = JSON.parse(e.data) as CallMessageSchema;
    listeners.forEach((cb) => void cb(message));
  };

  return {
    published,
    // No TURN server: peers on the same machine connect directly.
    credential: { ttl: 3600, user: "", pass: "", urls: [] },
    iceTransportPolicy: "all",
    async handleGenerateCred() {},
    async publisher(json) {
      published.push(JSON.parse(json));
      channel.postMessage(json);
    },
    async subscriber(cb) {
      const id = ++nextId;
      listeners.set(id, cb);
      return id;
    },
    async unSubscriber(id) {
      listeners.delete(id);
    },
  };
}

