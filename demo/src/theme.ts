import { definePreset } from "@primeuix/themes";
import Aura from "@primeuix/themes/aura";

/**
 * Aura with the chat's teal as its primary colour. The chat takes its colours from whatever
 * preset the host gives PrimeVue; this is only what the demo and the e2e harness use.
 */
export const ParleyPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: "#d4f9f5",
      100: "#afeee7",
      200: "#7eded4",
      300: "#59c9be",
      400: "#40b8ac",
      500: "#26a99c",
      600: "#1a9d90",
      700: "#0e9688",
      800: "#047c70",
      900: "#055850",
      950: "#033b36",
    },
  },
});

export const primeVueOptions = {
  theme: { preset: ParleyPreset, options: { darkModeSelector: ".dark" } },
};
