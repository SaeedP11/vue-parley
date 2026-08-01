<script setup lang="ts">
import EmojiPicker, { EmojiExt } from "vue3-emoji-picker";
import "vue3-emoji-picker/css";

const emit = defineEmits(["select"]);
</script>

<template>
  <EmojiPicker
    :native="true"
    @select="(emoji: EmojiExt) => emit('select', emoji)"
  />
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
