<script setup lang="ts">
/** Jumps back to the newest message; shows how many arrived while the user was scrolled up. */
defineProps<{ visible: boolean; unseen: number }>();
const emit = defineEmits<{ click: [] }>();
</script>

<template>
  <div class="relative pr-3 pb-1 w-11">
    <div
      @click="emit('click')"
      :class="[
        visible
          ? 'scale-100 pointer-events-auto opacity-100'
          : 'opacity-0 pointer-events-none scale-0',
      ]"
      class="w-11 origin-bottom transition-all duration-200 ease-in-out h-11 rounded-full overflow-hidden bg-chat-background shadow-floating flex items-center justify-center cursor-pointer"
    >
      <BIcon icon="PhArrowDown" class="fill-chat-on-background w-6 h-6" />
    </div>
    <div
      v-if="visible && unseen > 0"
      dir="ltr"
      class="absolute -top-2 right-3 min-w-5 h-5 px-1.5 rounded-full bg-gradient-primary-secondary flex items-center justify-center text-white text-[10px] font-bold select-none pointer-events-none"
    >
      {{ unseen > 99 ? "99+" : unseen }}
    </div>
  </div>
</template>
