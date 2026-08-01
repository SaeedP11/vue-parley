<script setup lang="ts">
import { computed } from "vue";
import { parseEmojiArray } from "~/utils/emojiParser";

const props = withDefaults(
  defineProps<{
    text?: string;
    truncate?: boolean;
  }>(),
  {
    text: "",
    truncate: false,
  },
);

const parsedText = computed(() => parseEmojiArray(props.text));
</script>

<template>
  <component
    :is="truncate ? 'div' : 'span'"
    :class="[
      truncate
        ? 'line-clamp-1 overflow-hidden text-ellipsis break-all w-full'
        : 'inline whitespace-pre-wrap break-words',
    ]"
  >
    <template v-for="(chunk, index) in parsedText" :key="index">
      <span
        v-if="chunk.type === 'emoji'"
        class="emoji-glyph inline-block h-5 w-5 leading-5 text-xl align-middle select-text"
      >{{ chunk.content }}</span>
      <span v-else>{{ chunk.content }}</span>
    </template>
  </component>
</template>
