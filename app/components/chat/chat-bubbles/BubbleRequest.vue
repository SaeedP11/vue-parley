<script setup lang="ts">
import type { Contact, ExtendedMessage } from "~/types";

// A request message is drawn by the host's own globally registered `RequestCard`. It is looked up
// here rather than in ChatBubble because a template resolves its components on every render, so
// every ordinary bubble would warn about a `RequestCard` that hosts without requests never register.
defineProps<{ message: ExtendedMessage; contact?: Contact | null }>();
</script>

<template>
  <RequestCard :message="message" :contact="contact" />
</template>
