<script setup lang="ts">
/** The round mark beside a message while it is selected in select mode. */
defineProps<{ selected: boolean }>();
</script>

<template>
  <div
    class="shrink-0 transition-all duration-200 overflow-hidden ease-in-out whitespace-nowrap"
    :class="{ 'w-auto': selected, 'w-0': !selected }"
  >
    <div
      class="transition-all duration-200 ease-in-out w-5 h-5 rounded-full bg-gradient-primary-secondary flex items-center justify-center"
      :class="{
        'opacity-100 scale-100': selected,
        'opacity-0 scale-0': !selected,
      }"
    >
      <div class="w-2.5 h-2.5 rounded-full bg-surface"></div>
    </div>
  </div>
</template>
