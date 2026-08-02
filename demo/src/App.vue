<script setup lang="ts">
import {
  ChatPage,
  useChatStore,
  useCallStore,
  useMessagesStore,
  useMediaStore,
} from "../../dist";

import { createMockChatHelpers } from "./mock/conversations";
import { createMockMessagesHandlers } from "./mock/messages";
import { createMockMediaHandlers } from "./mock/media";

const chatStore = useChatStore();
const messagesStore = useMessagesStore();
const mediaStore = useMediaStore();
const callStore = useCallStore();

chatStore.setHandlers(createMockChatHelpers());
messagesStore.setHandlers(createMockMessagesHandlers());
mediaStore.setHandlers(createMockMediaHandlers());

function startCall() {
  callStore.startCall("test-channel");
}
function minimizeCall() {
  callStore.minimize();
}
function maximizeCall() {
  callStore.maximize();
}
</script>

<template>
  <div style="padding: 4px; background: #ddd; display: flex; gap: 4px">
    <button @click="startCall">Start call</button>
    <button @click="minimizeCall">Minimize</button>
    <button @click="maximizeCall">Maximize</button>
  </div>
  <ChatPage />
</template>