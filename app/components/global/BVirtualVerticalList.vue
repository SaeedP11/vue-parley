<template>
  <div
    ref="parentRef"
    class="h-full w-full overflow-y-auto"
    :class="[scrollbar ? '' : 'hide-scrollbar']"
  >
    <div
      :style="{
        height: `${virtualizer.getTotalSize()}px`,
        width: '100%',
        position: 'relative',
      }"
    >
      <div
        v-for="virtualRow in virtualizer.getVirtualItems()"
        :key="virtualRow.index"
        :data-index="virtualRow.index"
        :ref="(el) => virtualizer.measureElement(el as HTMLElement)"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${virtualRow.start}px)`,
        }"
      >
        <slot
          name="item"
          :item="items[virtualRow.index]"
          :index="virtualRow.index"
        />
      </div>
    </div>

    <div
      v-show="pagination && hasNextPage"
      ref="sentinelRef"
      class="flex h-13 w-full items-center justify-center"
    >
      <slot v-if="hasNextPage" name="loader">
        <ProgressSpinner class="size-10!" stroke-width="4" />
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends Record<string, any>">
import { ref, onMounted, onUnmounted } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import ProgressSpinner from "primevue/progressspinner";

const props = withDefaults(
  defineProps<{
    items: T[];
    loading: boolean;
    hasNextPage: boolean;
    scrollbar?: boolean;
    pagination?: boolean;
  }>(),
  {
    scrollbar: false,
    pagination: true,
  },
);

const emit = defineEmits<{
  "load-more": [];
}>();

const parentRef = ref<HTMLElement | null>(null);
const sentinelRef = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const virtualizer = useVirtualizer({
  get count() {
    return props.items.length;
  },
  getScrollElement: () => parentRef.value,
  // Internal default guess. TanStack will correct this instantly upon rendering.
  estimateSize: () => 45,
  overscan: 10,
});

defineExpose<{
  resetScroll: () => void;
}>({
  resetScroll: () => {
    if (parentRef.value) {
      parentRef.value.scrollTop = 0;
    }
  },
});

// Auto-trigger load-more when reaching the bottom
onMounted(() => {
  if (!sentinelRef.value) return;

  observer = new IntersectionObserver(
    ([entry]) => {
      if (
        entry.isIntersecting &&
        props.hasNextPage &&
        !props.loading &&
        props.pagination
      ) {
        emit("load-more");
      }
    },
    { threshold: 0.1 },
  );

  observer.observe(sentinelRef.value);
});

onUnmounted(() => {
  observer?.disconnect();
});
</script>
