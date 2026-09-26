<script setup lang="ts">
/** A placeholder conversation row, the size and shape of ChatContactDisplay, for loading more. */
import Skeleton from "primevue/skeleton";
</script>

<template>
  <div
    class="vue-chat flex h-19 w-full items-center gap-x-3 p-2.5"
    aria-hidden="true"
  >
    <Skeleton shape="circle" size="2.75rem" class="shrink-0" />
    <div class="flex flex-1 flex-col gap-y-2.5 overflow-hidden">
      <div class="flex items-center justify-between">
        <Skeleton width="7rem" height="0.875rem" />
        <Skeleton width="2rem" height="0.625rem" />
      </div>
      <Skeleton width="60%" height="0.75rem" />
    </div>
  </div>
</template>
