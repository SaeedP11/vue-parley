import { nodePolyfills } from "vite-plugin-node-polyfills";
import Components from "unplugin-vue-components/vite";
import AutoImport from "unplugin-auto-import/vite";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import dts from "vite-plugin-dts";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
// simple-peer (and its `events` shim) need Node polyfills that host bundlers don't provide, so
// they are bundled, in the lazily loaded call chunk. Everything else the host installs anyway;
// leaving it external lets the host dedupe and tree-shake it.
const BUNDLED = new Set(["simple-peer", "events"]);
const external = [
  ...Object.keys(pkg.peerDependencies ?? {}),
  ...Object.keys(pkg.dependencies ?? {}).filter((dep) => !BUNDLED.has(dep)),
];

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
    },
    rollupOptions: {
      external: (id) => external.some((dep) => id === dep || id.startsWith(`${dep}/`)),
      // Per format, so lazy chunks get the extension package.json's "type" expects.
      output: [
        {
          format: "es",
          entryFileNames: "index.mjs",
          chunkFileNames: "chunks/[name]-[hash].mjs",
        },
        {
          format: "cjs",
          entryFileNames: "index.cjs",
          chunkFileNames: "chunks/[name]-[hash].cjs",
        },
      ],
    },
  },
});
