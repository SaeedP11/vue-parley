<script setup lang="ts">
/** The pill above a message that starts a new day, or the first unread one. */
defineProps<{ label: string }>();
</script>

<template>
  <div class="py-5 w-full flex items-center justify-center">
    <div
      class="rounded-full bg-on-surface/10 flex items-center justify-center px-4 py-0.5"
    >
      <div class="text-on-surface select-none text-body-sm">
        {{ label }}
      </div>
    </div>
  </div>
</template>
