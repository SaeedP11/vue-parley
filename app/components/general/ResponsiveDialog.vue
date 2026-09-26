<script setup lang="ts">
/**
 * A modal PrimeVue Dialog that is centred on wide screens and becomes a full-width bottom sheet
 * on phones. Dialog props, listeners and slots pass through.
 */
import Dialog from "primevue/dialog";
import { useSlots } from "vue";
import { useMediaQuery } from "@vueuse/core";

defineOptions({ inheritAttrs: false });

withDefaults(defineProps<{ width?: string }>(), { width: "30rem" });

const visible = defineModel<boolean>("visible", { default: false });
const slotNames: string[] = Object.keys(useSlots());

// Tailwind's `md` breakpoint.
const isSheet = useMediaQuery("(max-width: 767.98px)");
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :position="isSheet ? 'bottom' : 'center'"
    :draggable="false"
    :style="{ width }"
    :breakpoints="{ '767.98px': '100vw' }"
    v-bind="$attrs"
    :class="['vue-chat', isSheet && 'm-0! rounded-b-none!']"
  >
    <template v-for="name in slotNames" #[name]="scope">
      <slot :name="name" v-bind="scope ?? {}" />
    </template>
  </Dialog>
</template>
