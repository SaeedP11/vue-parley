<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Slider from "primevue/slider";
import InputText from "primevue/inputtext";
import InputNumber from "primevue/inputnumber";
import useLocalI18n from "~/composables/useLocalI18n";
import { callPaintBoard } from "@i18n/locales";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    presets?: string[];
    showAlpha?: boolean;
  }>(),
  {
    modelValue: "#2563eb",
    presets: () => [
      "#1e293b",
      "#64748b",
      "#ef4444",
      "#f97316",
      "#eab308",
      "#22c55e",
      "#14b8a6",
      "#3b82f6",
      "#8b5cf6",
      "#ec4899",
      "#ffffff",
    ],
    showAlpha: true,
  },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const { t } = useLocalI18n(callPaintBoard);

function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  if (color.startsWith("rgba") || color.startsWith("rgb")) {
    const parts = color.match(/[\d.]+/g);
    if (parts && parts.length >= 3) {
      return {
        r: Math.round(Number(parts[0]) || 0),
        g: Math.round(Number(parts[1]) || 0),
        b: Math.round(Number(parts[2]) || 0),
        a: parts[3] !== undefined ? Math.round(Number(parts[3]) * 100) / 100 : 1,
      };
    }
  }
  let c = color.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const num = parseInt(c.slice(0, 6), 16);
  if (isNaN(num)) return { r: 37, g: 99, b: 235, a: 1 };
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const a = c.length === 8 ? Math.round((parseInt(c.slice(6, 8), 16) / 255) * 100) / 100 : 1;
  return { r, g, b, a };
}

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0"))
      .join("")
  );
}

const initial = parseColor(props.modelValue);
const r = ref(initial.r);
const g = ref(initial.g);
const b = ref(initial.b);
const a = ref(Math.round(initial.a * 100));
const hexInput = ref(toHex(r.value, g.value, b.value));

let updatingFromProp = false;

watch(
  () => props.modelValue,
  (val) => {
    updatingFromProp = true;
    const parsed = parseColor(val);
    r.value = parsed.r;
    g.value = parsed.g;
    b.value = parsed.b;
    a.value = Math.round(parsed.a * 100);
    hexInput.value = toHex(parsed.r, parsed.g, parsed.b);
    updatingFromProp = false;
  },
);

const emitColor = () => {
  if (updatingFromProp) return;
  const alphaDecimal = a.value / 100;
  if (props.showAlpha && alphaDecimal < 1) {
    emit("update:modelValue", `rgba(${r.value}, ${g.value}, ${b.value}, ${alphaDecimal.toFixed(2)})`);
  } else {
    emit("update:modelValue", toHex(r.value, g.value, b.value));
  }
};

watch([r, g, b, a], () => {
  if (!updatingFromProp) {
    hexInput.value = toHex(r.value, g.value, b.value);
    emitColor();
  }
});

const onHexBlur = () => {
  const parsed = parseColor(hexInput.value);
  r.value = parsed.r;
  g.value = parsed.g;
  b.value = parsed.b;
  emitColor();
};

const selectPreset = (preset: string) => {
  const parsed = parseColor(preset);
  r.value = parsed.r;
  g.value = parsed.g;
  b.value = parsed.b;
  hexInput.value = toHex(parsed.r, parsed.g, parsed.b);
  emitColor();
};

const currentColorCss = computed(() => {
  return `rgba(${r.value}, ${g.value}, ${b.value}, ${a.value / 100})`;
});
</script>

<template>
  <div class="flex flex-col gap-3 p-3 w-64 text-xs select-none">
    <!-- Presets -->
    <div class="flex flex-wrap gap-1.5 justify-center">
      <button
        v-for="color in presets"
        :key="color"
        type="button"
        class="size-6 rounded-full border border-gray-300 dark:border-gray-600 transition-transform hover:scale-110 active:scale-95 shadow-xs"
        :style="{ backgroundColor: color }"
        :class="{ 'ring-2 ring-chat-primary ring-offset-1': toHex(r, g, b).toLowerCase() === color.toLowerCase() }"
        @click="selectPreset(color)"
      />
    </div>

    <!-- Preview swatch & Hex -->
    <div class="flex items-center gap-2 mt-1">
      <div
        class="size-8 rounded-lg border border-gray-300 dark:border-gray-700 shadow-inner shrink-0"
        :style="{ backgroundColor: currentColorCss }"
      />
      <div class="flex items-center gap-1 flex-1">
        <span class="text-gray-500 font-medium">#</span>
        <InputText
          v-model="hexInput"
          size="small"
          class="w-full text-xs font-mono py-1 px-1.5"
          placeholder="RRGGBB"
          @blur="onHexBlur"
          @keyup.enter="onHexBlur"
        />
      </div>
    </div>

    <!-- RGB Sliders -->
    <div class="flex flex-col gap-2 mt-1">
      <!-- RED -->
      <div class="flex items-center gap-2">
        <span class="w-4 font-semibold text-red-500">R</span>
        <Slider v-model="r" :min="0" :max="255" class="flex-1" />
        <InputNumber
          v-model="r"
          :min="0"
          :max="255"
          class="w-12 text-xs"
          input-class="w-12 text-center text-xs py-0.5 px-1 font-mono"
        />
      </div>

      <!-- GREEN -->
      <div class="flex items-center gap-2">
        <span class="w-4 font-semibold text-green-500">G</span>
        <Slider v-model="g" :min="0" :max="255" class="flex-1" />
        <InputNumber
          v-model="g"
          :min="0"
          :max="255"
          class="w-12 text-xs"
          input-class="w-12 text-center text-xs py-0.5 px-1 font-mono"
        />
      </div>

      <!-- BLUE -->
      <div class="flex items-center gap-2">
        <span class="w-4 font-semibold text-blue-500">B</span>
        <Slider v-model="b" :min="0" :max="255" class="flex-1" />
        <InputNumber
          v-model="b"
          :min="0"
          :max="255"
          class="w-12 text-xs"
          input-class="w-12 text-center text-xs py-0.5 px-1 font-mono"
        />
      </div>

      <!-- ALPHA (if enabled) -->
      <div v-if="showAlpha" class="flex items-center gap-2">
        <span class="w-4 font-semibold text-gray-500">A</span>
        <Slider v-model="a" :min="0" :max="100" class="flex-1" />
        <div class="w-12 text-center text-xs font-mono text-gray-600 dark:text-gray-300">
          {{ a }}%
        </div>
      </div>
    </div>
  </div>
</template>
