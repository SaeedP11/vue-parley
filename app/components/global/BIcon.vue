<script lang="ts">
import { computed, shallowReactive, useAttrs, watchEffect } from "vue";

import bold from "./icons/bold";
import fill from "./icons/fill";
import regular from "./icons/regular";

type Weight = "thin" | "light" | "regular" | "bold" | "fill" | "duotone";

/*
 * The icons are Phosphor's SVG markup, generated per weight by
 * scripts/generate-icons.mjs, instead of @phosphor-icons/vue's components:
 * each of those carries all six weights, ~105 KB brotli for the 84 icons here.
 * The chat itself uses regular, bold and fill (~23 KB); the other three load
 * the first time something asks for them, shared by every BIcon.
 */
const weights = shallowReactive<Partial<Record<Weight, Record<string, string>>>>({
  regular,
  bold,
  fill,
});

const lazyWeights: Partial<Record<Weight, () => Promise<{ default: Record<string, string> }>>> = {
  thin: () => import("./icons/thin"),
  light: () => import("./icons/light"),
  duotone: () => import("./icons/duotone"),
};

const loading = new Set<Weight>();

function loadWeight(weight: Weight) {
  const load = lazyWeights[weight];
  if (weights[weight] || loading.has(weight) || !load) return;
  loading.add(weight);
  void load().then((module) => {
    weights[weight] = module.default;
  });
}

function normalizeIconName(icon: string): string {
  // Strip a "Ph"/"ph" prefix (case-insensitive), then capitalize: "phX", "PhX" and "x" are all "X".
  const withoutPrefix = /^ph/i.test(icon) ? icon.slice(2) : icon;
  return withoutPrefix.charAt(0).toUpperCase() + withoutPrefix.slice(1);
}
</script>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    icon: string;
    weight?: Weight;
    size?: string | number;
    color?: string;
    mirrored?: boolean;
  }>(),
  {
    weight: "regular",
    size: "1em",
    color: "currentColor",
    mirrored: false,
  },
);

const attrs = useAttrs();

// Filter out 'class' to handle it separately and avoid duplication
const filteredAttrs = computed(() => {
  const { class: _, ...rest } = attrs;
  return rest;
});

watchEffect(() => loadWeight(props.weight));

const markup = computed(() =>
  props.icon ? weights[props.weight]?.[normalizeIconName(props.icon)] : undefined,
);
</script>

<template>
  <svg
    v-if="markup"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 256 256"
    :width="size"
    :height="size"
    :fill="color"
    :transform="mirrored ? 'scale(-1, 1)' : undefined"
    v-bind="filteredAttrs"
    :class="['inline-block fill-current transition-all duration-200']"
    v-html="markup"
  />
  <span v-else v-bind="filteredAttrs" :class="['inline-block fill-current transition-all duration-200']" />
</template>
