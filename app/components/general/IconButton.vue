<script setup lang="ts">
/**
 * An icon-only PrimeVue Button showing a Phosphor icon. Defaults to a round, text, secondary
 * button; any Button prop (severity, variant, size, loading, disabled...) and listener passes
 * through and overrides those defaults.
 */
import Button from "primevue/button";
import BIcon from "~/components/global/BIcon.vue";

defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    icon: string;
    /** Accessible name; the button has no visible text. */
    label: string;
    weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
    iconClass?: string;
  }>(),
  { weight: "regular", iconClass: "size-5" },
);
</script>

<template>
  <Button rounded text severity="secondary" v-bind="$attrs" :aria-label="label">
    <template #icon>
      <BIcon :icon="icon" :weight="weight" :class="iconClass" />
    </template>
  </Button>
</template>
