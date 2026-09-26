<script setup lang="ts">
import MediaImage from "./MediaImage.vue";

defineProps<{
  imagePath?: string;
  title?: string;
}>();
</script>
<template>
  <div class="w-full h-full flex flex-col items-center justify-center gap-y-5">
    <div class="h-50 w-50">
      <MediaImage :src="imagePath" fit="contain" no-loading class="size-full" />
    </div>
    <div class="select-none text-label-sm text-center text-chat-on-background/50">
      {{ title }}
    </div>
  </div>
</template>
