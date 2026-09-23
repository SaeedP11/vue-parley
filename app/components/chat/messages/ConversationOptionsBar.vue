<script setup lang="ts">
/** Quick actions for the conversation (e.g. "End chat"), hidden while scrolling back in history. */
import type { MenuOption } from "~/types/components/menu-options";

defineProps<{ options: MenuOption[]; visible: boolean }>();
const emit = defineEmits<{ select: [key: string] }>();
</script>

<template>
  <div
    class="grid transition-all pointer-events-none duration-200 ease-in-out"
    :class="[visible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0']"
  >
    <div class="min-h-0">
      <div
        :class="[visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0']"
        class="pointer-events-none transition-all duration-200 w-full lg:max-w-full max-w-dvw p-2 flex items-center gap-x-3 overflow-x-auto lg:overflow-visible hide-scrollbar whitespace-nowrap"
      >
        <div
          v-for="option in options"
          :key="option.key"
          @click="emit('select', option.key)"
          class="px-2.5 pointer-events-auto flex items-center gap-x-2 cursor-pointer bg-chat-surface-3 rounded-lg h-9 shrink-0"
        >
          <BIcon :icon="option.icon" class="w-5 h-5 fill-chat-on-background/50" />
          <div class="text-body-sm select-none text-chat-on-background/70">
            {{ option.label }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
