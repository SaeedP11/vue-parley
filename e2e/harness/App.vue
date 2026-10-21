<script setup lang="ts">
import { ref } from "vue";
import {
  ChatPage,
  useCallStore,
  useChatStore,
  useMediaStore,
  useMessagesStore,
} from "~/index";
import { backend, blocked, call } from "./backend";

const renderCall = ref(true);

// `open=<id>` selects a conversation before the chat mounts, as a host routing straight to one does.
const open = new URLSearchParams(location.search).get("open");
if (open) useChatStore().setSelectedChat(open);

const callStore = useCallStore();

// Each connection object gets a number the first time it is seen, so a spec can tell whether a
// pair was rebuilt (a new number) or kept (the same one).
const connectionIds = new WeakMap<object, number>();
let nextConnectionId = 0;
const connectionId = (peer: object) => {
  if (!connectionIds.has(peer)) connectionIds.set(peer, ++nextConnectionId);
  return connectionIds.get(peer)!;
};

const peersOf = () => callStore.session?.peers.peers.value ?? {};

/** Makes the connection to `remoteId` fail, as a dropped network path would. */
function failPeer(remoteId: string) {
  const error = Object.assign(new Error("Failed by the test"), { code: "ERR_CONNECTION_FAILURE" });
  peersOf()[remoteId]?.destroy(error);
}

// Test hooks. Stores are created here rather than in main.ts: some need a component's setup.
Object.assign(window, {
  __harness: {
    // Live objects: specs flip `state.failNext*` and read `state.calls`.
    state: backend.state,
    published: call.published,
    chatStore: useChatStore(),
    messagesStore: useMessagesStore(),
    callStore,
    mediaStore: useMediaStore(),
    /** Mounts or unmounts the call view, as a host navigating away would. */
    setRenderCall: (value: boolean) => (renderCall.value = value),
    /** The running call as plain data: who is in it, its phase, and each pair's connection. */
    session() {
      const session = callStore.session;
      if (!session) return null;
      return {
        selfId: session.selfId,
        phase: session.phase.value,
        participants: session.participants.value.map(({ camera, screen, ...p }) => ({
          ...p,
          hasCamera: !!camera,
          hasScreen: !!screen,
        })),
        peerIds: Object.fromEntries(
          Object.entries(peersOf()).map(([id, peer]) => [id, connectionId(peer)]),
        ),
        peerStatus: { ...session.peers.peerStatus.value },
      };
    },
    failPeer,
    /** Stops hearing `remoteId` and fails the pair, so it can't be rebuilt until unblocked. */
    blockPeer(remoteId: string) {
      blocked.add(remoteId);
      failPeer(remoteId);
    },
    unblockPeer: (remoteId: string) => blocked.delete(remoteId),
    /** What each connection's senders send with: remote id → senders. */
    senderParams: () =>
      Object.fromEntries(
        Object.entries(peersOf()).map(([id, peer]) => [id, peer.describeSenders()]),
      ),
  },
});
</script>

<template>
  <div style="height: 100vh">
    <ChatPage :render-call="renderCall" />
  </div>
</template>
