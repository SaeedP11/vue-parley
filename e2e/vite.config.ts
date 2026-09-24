import { nodePolyfills } from "vite-plugin-node-polyfills";
import Components from "unplugin-vue-components/vite";
import AutoImport from "unplugin-auto-import/vite";
import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Serves the e2e harness straight from the library sources (same plugins and aliases as the
// library build, minus the lib/dts output).
const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./harness", import.meta.url)),
  plugins: [
    vue(),
    tailwindcss(),
    nodePolyfills(),
    AutoImport({ imports: ["vue", "@vueuse/core"], dts: false }),
    Components({
      dirs: [root("app/components/global")],
      dts: false,
      extensions: ["vue"],
      deep: true,
    }),
  ],
  resolve: {
    alias: {
      "~": root("app"),
      "@i18n": root("i18n"),
    },
  },
  server: { port: 5179, strictPort: true },
});
