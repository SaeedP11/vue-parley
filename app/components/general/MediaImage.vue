<script setup lang="ts">
/** An image that shows a PrimeVue Skeleton until it loads, then fades in. Sized by its class. */
import { ref, watch } from "vue";
import Skeleton from "primevue/skeleton";

const props = withDefaults(
  defineProps<{
    src?: string;
    alt?: string;
    fit?: "cover" | "contain";
    /** Skip the skeleton, e.g. for decorative images that load from the bundle. */
    noLoading?: boolean;
  }>(),
  { src: "", alt: "", fit: "cover", noLoading: false },
);

const loaded = ref(false);
watch(
  () => props.src,
  () => (loaded.value = false),
);
</script>

<template>
  <div class="relative overflow-hidden">
    <div v-if="!loaded && !noLoading" class="absolute inset-0">
      <Skeleton width="100%" height="100%" border-radius="0" />
    </div>
    <img
      v-if="src"
      :key="src"
      :src="src"
      :alt="alt"
      draggable="false"
      class="block size-full select-none transition-opacity duration-300"
      :class="[
        fit === 'cover' ? 'object-cover' : 'object-contain',
        loaded || noLoading ? 'opacity-100' : 'opacity-0',
      ]"
      @load="loaded = true"
      @error="loaded = true"
    />
    <div v-if="$slots.default" class="absolute inset-0">
      <slot />
    </div>
  </div>
</template>
