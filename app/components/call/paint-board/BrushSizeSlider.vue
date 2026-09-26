<script setup lang="ts">
/** Vertical brush-size picker, with a dot that previews the size in the brush colour. */
import Slider from "primevue/slider";

withDefaults(
  defineProps<{
    min?: number;
    max?: number;
    color?: string;
  }>(),
  {
    min: 1,
    max: 20,
    color: "#000000",
  },
);

const model = defineModel<number>({ required: true });
</script>

<template>
  <div class="flex flex-col items-center gap-y-4 px-3 py-2">
    <Slider
      v-model="model"
      :min="min"
      :max="max"
      orientation="vertical"
      class="h-36"
    />
    <div class="flex size-6 items-center justify-center">
      <div
        class="rounded-full"
        :style="{ width: `${model + 2}px`, height: `${model + 2}px`, backgroundColor: color }"
      />
    </div>
  </div>
</template>
