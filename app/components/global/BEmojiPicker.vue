<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import type { EmojiExt } from "vue3-emoji-picker";

// Loaded when a picker first renders, not with the chat.
const EmojiPicker = defineAsyncComponent(async () => {
  const [picker] = await Promise.all([
    import("vue3-emoji-picker"),
    import("vue3-emoji-picker/css"),
  ]);
  return picker.default;
});

const emit = defineEmits<{ select: [emoji: EmojiExt] }>();
</script>

<template>
  <EmojiPicker :native="true" @select="(emoji: EmojiExt) => emit('select', emoji)" />
</template>

<style>
.v3-emoji-picker {
  height: 407px;
  width: 332px;
}

.v3-emoji-picker .v3-footer {
  display: none !important;
}
</style>
