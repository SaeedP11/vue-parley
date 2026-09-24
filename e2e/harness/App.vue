<script setup lang="ts">
import {
  ChatPage,
  useCallStore,
  useChatStore,
  useMessagesStore,
} from "~/index";
import { backend, call } from "./backend";

// Test hooks. Stores are created here rather than in main.ts: some need a component's setup.
Object.assign(window, {
  __harness: {
    // Live objects: specs flip `state.failNext*` and read `state.calls`.
    state: backend.state,
    published: call.published,
    chatStore: useChatStore(),
    messagesStore: useMessagesStore(),
    callStore: useCallStore(),
  },
});
</script>

<template>
  <div style="height: 100vh">
    <ChatPage />
  </div>
</template>
