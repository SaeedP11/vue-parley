import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // The package is linked from the workspace root, which has its own copies of its peers.
  // A real host has one of each; make the demo match.
  resolve: { dedupe: ["vue", "pinia", "vue-i18n", "@vueuse/core"] },
});
