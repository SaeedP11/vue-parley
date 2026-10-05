<script setup lang="ts">
/**
 * IconButton for the call screen: an icon-only, round PrimeVue Button showing a Material Symbol
 * (CallIcon). Any Button prop (severity, size, dt...) and listener passes through.
 */
import Button from "primevue/button";
import CallIcon, { type CallIconName } from "./CallIcon.vue";

defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    icon: CallIconName;
    /** Accessible name; the button has no visible text. */
    label: string;
    iconClass?: string;
  }>(),
  { iconClass: "size-5" },
);
</script>

<template>
  <Button rounded text severity="secondary" v-bind="$attrs" :aria-label="label">
    <template #icon>
      <CallIcon :name="icon" :class="iconClass" />
    </template>
  </Button>
</template>
