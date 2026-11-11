<script setup lang="ts">
import { ref, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { ChatPage, type Message } from "vue-parley";
import { userId } from "./user";

const { locale } = useI18n();
const dark = ref(matchMedia("(prefers-color-scheme: dark)").matches);
watchEffect(() => document.documentElement.classList.toggle("dark", dark.value));

const other = userId === "me" ? "sara" : "me";
const otherTab = `?user=${other}`;

// Host actions: the header's folded menu and each message's menu.
const notice = ref("");
const say = (text: string) => {
  notice.value = text;
  setTimeout(() => notice.value === text && (notice.value = ""), 2500);
};
const pinned = ref(new Set<string>());
const headerOptions = [
  { key: "info", label: "Demo info", icon: "PhInfo", command: () => say("Host header option") },
];
const messageOptions = (message: Message) => [
  {
    key: "pin",
    label: pinned.value.has(message.id) ? "Unpin" : "Pin",
    icon: "PhPushPin",
    command: () => {
      const set = new Set(pinned.value);
      set.has(message.id) ? set.delete(message.id) : set.add(message.id);
      pinned.value = set;
      say(set.has(message.id) ? "Pinned" : "Unpinned");
    },
  },
];
</script>

<template>
  <div class="demo">
    <header class="demo-bar">
      <strong>vue-parley demo</strong>
      <span class="demo-muted">you are <code>{{ userId }}</code></span>
      <span class="demo-spacer" />
      <a :href="otherTab" target="_blank">Open as {{ other }} (to call)</a>
      <select v-model="locale" aria-label="Language">
        <option value="fa">فارسی</option>
        <option value="en">English</option>
      </select>
      <label><input v-model="dark" type="checkbox" /> Dark</label>
    </header>

    <ChatPage class="demo-chat" :header-options="headerOptions" :message-options="messageOptions">
      <template #header-actions="{ compact }">
        <button v-if="!compact" class="demo-chip" @click="say('Host header action')">Host action</button>
      </template>
      <template #above-input="{ conversationId }">
        <div v-if="notice" class="demo-notice">{{ notice }}</div>
        <div v-else-if="pinned.size" class="demo-notice">
          {{ pinned.size }} pinned · {{ conversationId }}
        </div>
      </template>
    </ChatPage>
  </div>
</template>

<style scoped>
.demo {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.demo-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  font: 13px system-ui, sans-serif;
  border-bottom: 1px solid #8884;
}
.demo-spacer {
  flex: 1;
}
.demo-muted {
  opacity: 0.7;
}
.demo-chat {
  flex: 1;
  min-height: 0;
}
.demo-chip {
  padding: 0.25rem 0.6rem;
  border: 1px solid #8886;
  border-radius: 999px;
  background: none;
  color: inherit;
  cursor: pointer;
}
.demo-notice {
  padding: 0.35rem 1rem;
  font: 12px system-ui, sans-serif;
  background: #26a99c22;
}
</style>
