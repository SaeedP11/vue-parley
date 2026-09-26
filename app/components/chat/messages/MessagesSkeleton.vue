<script setup lang="ts">
/**
 * Placeholder bubbles while a conversation's messages load, laid out like ChatBubble: the other
 * side's at the end with an avatar on the last of each group, yours at the start.
 */
import { computed } from "vue";
import Skeleton from "primevue/skeleton";

const props = withDefaults(defineProps<{ count?: number }>(), { count: 6 });

// A fixed, varied pattern, so the placeholder reads as a conversation rather than a stripe.
const PATTERN = [
  { mine: false, width: "55%", height: "2.75rem" },
  { mine: false, width: "38%", height: "2.75rem" },
  { mine: true, width: "62%", height: "4rem" },
  { mine: false, width: "46%", height: "2.75rem" },
  { mine: true, width: "34%", height: "2.75rem" },
  { mine: true, width: "50%", height: "2.75rem" },
];

const rows = computed(() =>
  Array.from({ length: props.count }, (_, i) => {
    const row = PATTERN[i % PATTERN.length]!;
    const next = PATTERN[(i + 1) % PATTERN.length]!;
    return { ...row, avatar: !row.mine && (i === props.count - 1 || next.mine) };
  }),
);
</script>

<template>
  <div class="vue-chat flex w-full flex-col gap-y-2 px-5 py-3" aria-hidden="true">
    <div
      v-for="(row, i) in rows"
      :key="i"
      class="flex w-full items-end gap-x-2"
      :class="row.mine ? 'justify-start' : 'justify-end'"
    >
      <Skeleton
        :width="row.width"
        :height="row.height"
        border-radius="1rem"
        class="max-w-4/5"
      />
      <div v-if="!row.mine" class="size-8 shrink-0">
        <Skeleton v-if="row.avatar" shape="circle" size="2rem" />
      </div>
    </div>
  </div>
</template>
