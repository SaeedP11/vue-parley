<script setup lang="ts">
import { ref } from "vue";
import {
  ChatPage,
  useCallStore,
  useChatStore,
  useMessagesStore,
} from "~/index";
import { backend, call } from "./backend";

const renderCall = ref(true);

// Test hooks. Stores are created here rather than in main.ts: some need a component's setup.
Object.assign(window, {
  __harness: {
    // Live objects: specs flip `state.failNext*` and read `state.calls`.
    state: backend.state,
    published: call.published,
    chatStore: useChatStore(),
    messagesStore: useMessagesStore(),
    callStore: useCallStore(),
    /** Mounts or unmounts the call view, as a host navigating away would. */
    setRenderCall: (value: boolean) => (renderCall.value = value),
  },
});
</script>

<template>
  <div style="height: 100vh">
    <ChatPage :render-call="renderCall" />
  </div>
</template>
