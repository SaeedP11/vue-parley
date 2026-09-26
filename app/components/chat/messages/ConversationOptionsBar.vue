<script setup lang="ts">
/** Quick actions for the conversation (e.g. "End chat"), hidden while scrolling back in history. */
import Button from "primevue/button";
import type { MenuOption } from "~/types/components/menu-options";

defineProps<{ options: MenuOption[]; visible: boolean }>();
const emit = defineEmits<{ select: [key: string] }>();
</script>

<template>
  <div
    class="pointer-events-none grid transition-all duration-200 ease-in-out"
    :class="[visible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0']"
  >
    <div class="min-h-0">
      <div
        :class="[visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0']"
        class="hide-scrollbar pointer-events-none flex w-full max-w-dvw items-center gap-x-3 overflow-x-auto p-2 whitespace-nowrap transition-all duration-200 lg:max-w-full lg:overflow-visible"
      >
        <Button
          v-for="option in options"
          :key="option.key"
          :label="option.label"
          severity="secondary"
          size="small"
          class="pointer-events-auto shrink-0"
          :tabindex="visible ? undefined : -1"
          @click="emit('select', option.key)"
        >
          <template #icon>
            <BIcon :icon="option.icon ?? ''" class="size-5" />
          </template>
        </Button>
      </div>
    </div>
  </div>
</template>
