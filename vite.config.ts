import Components from "unplugin-vue-components/vite";
import AutoImport from "unplugin-auto-import/vite";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import dts from "vite-plugin-dts";
import { readFileSync } from "node:fs";
import postcss, { type AtRule, type Plugin as PostcssPlugin } from "postcss";
import type { Plugin } from "vite";

const SCOPE = ":where(.vue-chat, .vue-chat *)";

function scopeSelector(sel: string): string {
  if (sel.includes(".vue-chat")) return sel;
  if (sel === ":root" || sel === ":host") return ".vue-chat";
  if (sel === ".dark") return ".dark .vue-chat";
  const prefix = sel.match(/^(:where\(\.dark\)|\.dark)\s+/)?.[0] ?? sel.match(/^[a-zA-Z][\w-]*/)?.[0] ?? "";
  return prefix + SCOPE + sel.slice(prefix.length);
}

// Confines chat.css to `.vue-chat` roots so its compiled utilities and theme cannot override the
// host's own Tailwind (e.g. our `.hidden` beating the host's `lg:flex`).
const scopeRules: PostcssPlugin = {
  postcssPlugin: "scope-vue-chat",
  Rule(rule) {
    for (let p = rule.parent; p; p = p.parent) {
      if (p.type !== "atrule") continue;
      const { name, params } = p as AtRule;
      if (name.endsWith("keyframes") || (name === "layer" && params === "properties")) return;
    }
    rule.selectors = [...new Set(rule.selectors.map(scopeSelector))];
  },
};

function scopeChatCss(): Plugin {
  return {
    name: "scope-chat-css",
    apply: "build",
    generateBundle: {
      order: "post",
      handler(_, bundle) {
        for (const asset of Object.values(bundle)) {
          if (asset.type !== "asset" || !asset.fileName.endsWith(".css")) continue;
          asset.source = postcss([scopeRules]).process(String(asset.source), { from: undefined }).css;
        }
      },
    },
  };
}

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
// Dependencies stay external: the host installs them anyway, and can dedupe and tree-shake them.
const external = [
  ...Object.keys(pkg.peerDependencies ?? {}),
  ...Object.keys(pkg.dependencies ?? {}),
];

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    scopeChatCss(),
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
      entry: {
        index: resolve(__dirname, "app/index.ts"),
        fakes: resolve(__dirname, "fakes/index.ts"),
      },
      formats: ["es", "cjs"],
      // Otherwise named after the package; the "./style.css" export points here.
      cssFileName: "chat",
    },
    rollupOptions: {
      external: (id) => external.some((dep) => id === dep || id.startsWith(`${dep}/`)),
      // Per format, so lazy chunks get the extension package.json's "type" expects.
      output: [
        {
          format: "es",
          entryFileNames: "[name].mjs",
          chunkFileNames: "chunks/[name]-[hash].mjs",
        },
        {
          format: "cjs",
          entryFileNames: "[name].cjs",
          chunkFileNames: "chunks/[name]-[hash].cjs",
        },
      ],
    },
  },
});
