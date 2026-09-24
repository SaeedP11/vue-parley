import { nodePolyfills } from "vite-plugin-node-polyfills";
import Components from "unplugin-vue-components/vite";
import AutoImport from "unplugin-auto-import/vite";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    nodePolyfills(),
    AutoImport({
      imports: ["vue", "@vueuse/core"],
      dts: fileURLToPath(new URL("./auto-imports.d.ts", import.meta.url)),
    }),
    Components({
      dirs: ["app/components/global"],
      dts: "./components.d.ts",
      extensions: ["vue"],
      deep: true,
    }),
    dts({
      outDir: "dist/types",
      insertTypesEntry: true,
    }),
  ],
  publicDir: false,
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./app", import.meta.url)),
      "@i18n": fileURLToPath(new URL("./i18n", import.meta.url)),
    },
  },
  build: {
    minify: false,
    sourcemap: true,
    lib: {
      name: "VueChat",
      entry: resolve(__dirname, "app/index.ts"),
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "index.mjs" : "index.cjs"),
    },
    rollupOptions: {
      external: ["vue", "vue-i18n", "pinia", "@vueuse/core"],
      output: {
        compact: false,
      },
    },
  },
});
