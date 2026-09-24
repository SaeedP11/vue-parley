# Vue Chat 🚀

Reusable Vue 3 chat component designed for integration into modern web applications.

The package ships a single composed page component (`<ChatPage />`) plus the host-adapter wiring needed to drive it.

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Vue.js Version](https://img.shields.io/badge/Vue.js-^3.5.0-brightgreen)](https://vuejs.org/)
[![TypeScript Version](https://img.shields.io/badge/TypeScript-^5.7.0-blue)](https://www.typescriptlang.org/)
[![Tailwind CSS Version](https://img.shields.io/badge/Tailwind%20CSS-^4.3.2-cyan)](https://tailwindcss.com/)

## Table of Contents 📑

- [Features](#features-🌟)
- [Tech Stack](#tech-stack-🛠️)
- [Installation](#installation--)
- [Usage](#usage-💡)
  - [Plain Vue + Vite](#plain-vue--vite)
  - [Nuxt 3 / 4](#nuxt-3--4)
- [What `createChat()` does](#what-createchat-does-✅)
- [i18n Keys](#i18n-keys-🌍)
- [Styles](#styles-💅)
- [Build](#build-🔧)
- [Project Structure](#project-structure-📁)
- [Testing](#testing-🧪)
- [Contributing](#contributing-🤝)
- [License](#license-📜)
- [Important Links](#important-links-🔗)
- [Footer](#footer-✨)

## Features 🌟

- **Reusable Chat Component:** Provides a complete chat UI out-of-the-box.
- **Vue 3 Composition API:** Leverages modern Vue features for better organization and reactivity.
- **Real-time Communication:** Supports WebRTC for video calls and screen sharing.
- **Internationalization (i18n):** Built with `vue-i18n` for multi-language support.
- **State Management:** Integrates with Pinia for robust state management.
- **Styling:** Utilizes Tailwind CSS for utility-first styling and theming.
- **Customizable Adapters:** Allows integration with custom backend services.
- **Mock Adapter:** Enables UI preview without a backend connection.
- **Rich Text Editor:** Includes a rich text input with emoji support.
- **File Uploads:** Supports uploading various file types.
- **Image Cropping:** Integrated with `vue-advanced-cropper`.
- **Animations:** Includes `vue3-lottie` for animations.

## Tech Stack 🛠️

| Category        | Technologies                                                                                                                                                                                           | Description                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **Frontend**    | Vue.js 3, TypeScript, Vite, Pinia, Vue Router (implied), Vue I18n, VueUse, Tailwind CSS                                                                                                                    | Core technologies for building the reactive UI and component library.           |
| **APIs/Protocols** | WebRTC, `simple-peer`                                                                                                                                                                                     | For real-time peer-to-peer communication (video calls, screen sharing).         |
| **Utilities**   | `nanoid` (unique IDs), `signature_pad` (signatures), `vue3-emoji-picker` (emojis), `@phosphor-icons/vue` (icons), `@tanstack/vue-virtual` (virtual scrolling)                                             | Various utilities for enhanced functionality.                                   |
| **Build Tools** | Vite, Vue-TS, Rollup (via Vite)                                                                                                                                                                          | For development, building, and type checking.                                   |
| **Other**       | Node.js (runtime), YAML (configuration)                                                                                                                                                                  | Environment and configuration languages.                                        |

## Installation 📦

Install the package and its peer dependencies:

```bash
yarn add @yonus_amire01/chat

# Install peer dependencies
yarn add vue vue-i18n pinia @vueuse/core
```

## Usage 💡

### Plain Vue + Vite

Install the plugin once in `main.ts`. Pinia and vue-i18n must be installed before it.

```ts
// main.ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createChat } from '@yonus_amire01/chat';
import '@yonus_amire01/chat/style.css';
import App from './App.vue';

createApp(App)
  .use(createPinia())
  .use(createI18n({ legacy: false, locale: 'fa', fallbackLocale: 'en' }))
  .use(
    createChat({
      chat: chatHandlers,         // ChatHandlers: fetch/delete/end conversations
      messages: messagesHandlers, // MessagesHandlers: fetch/send/edit/delete messages
      media: mediaHandlers,       // MediaHandlers: download files, file sizes
      profile: profileHandlers,   // optional: profile panel's media and files tabs
      call: callHandlers,         // optional: enables voice/video calls
      user: { id: me.id, name: me.fullName },
    }),
  )
  .mount('#app');
```

Then render `<ChatPage />` anywhere:

```vue
<script setup lang="ts">
import { ChatPage } from '@yonus_amire01/chat';
</script>

<template>
  <ChatPage />
</template>
```

All handler interfaces (`ChatHandlers`, `MessagesHandlers`, `MediaHandlers`, `ProfileHandlers`, `CallHandlers`) are exported as types. `fakes/` has an in-memory implementation of each (used by the demo and the e2e tests): `createFakeBackend(data)`, and `createBroadcastCallHandlers()`, which lets two browser tabs call each other with no server.

### Nuxt 3 / 4

Create `app/plugins/chat.client.ts` (Pinia and i18n come from `@pinia/nuxt` and `@nuxtjs/i18n`):

```ts
import { createChat } from '@yonus_amire01/chat';
import '@yonus_amire01/chat/style.css';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(createChat({ chat, messages, media, call, user }));
});
```

## What `createChat()` does ✅

- Gives each store its handlers when that store is first created (via a Pinia plugin, because some stores need a component's `setup` to start).
- Sets the signed-in user on the profile store.
- Hands the call handlers to the call store. `provideCallHandlers()` in a component does the same, for handlers that only exist further down the tree.

### Calls outside the chat page

A call belongs to the call store, not to a component, so it keeps running when the chat page unmounts. To keep it **on screen** while the user navigates, render the call view once near the app root and turn off the chat page's own:

```vue
<!-- App.vue -->
<RouterView />
<Call v-if="callStore.session" />

<!-- the chat route -->
<ChatPage :render-call="false" />
```

Calls use the browser's WebRTC API directly (no `simple-peer`, no Node polyfills). The signalling messages keep simple-peer's format, so tabs still on an older, simple-peer based release can call this one and back; `e2e/tests/interop.spec.ts` checks that.

Conversations a list page hasn't fetched (say, one opened from a link) are added with `chatStore.addContact(contact)`, and changed with `chatStore.updateContact(id, changes)`. `conversationStates` is a read-only view.

Call handlers also accept `iceTransportPolicy` (default `"relay"`; `"all"` allows direct connections without TURN) and `debug` (logs signalling to the console).

Every component and directive the chat uses is imported by the component itself, so nothing else needs to be registered.

## i18n Keys 🌍

The chat UI requires specific keys under `chat.*` for internationalization. At a minimum, the following keys should be provided:

```jsonc
{
  "chat": {
    "you": "You",
    "noConversationSelected": "Select a conversation",
    "noMessages": "No conversations yet",
    "copiedMessage": "Copied",
    "filters": {
      "online": "Online",
      "ended": "Ended",
      "active": "Active"
    }
  }
}
```

Additional translations are necessary for other message types (file/voice/request bubbles, medication picker, etc.) if those features are utilized. The Persian translation set used during development can be found in the host repository.

## Styles 💅

Importing the main CSS file handles all styling needs:

```ts
// main.ts or similar entry point
import '@yonus_amire01/chat/style.css';
```

This import includes:

- **Compiled Tailwind v4 theme & utilities:** only the classes the package uses. The host needs no Tailwind of its own, and Tailwind's global reset (preflight) is not included, so the host page's styles are left alone.
- **Theme Tokens:** Custom CSS variables for theming (e.g., `--color-primary-*`, `--color-surface`) and gradient utilities.
- **Font Declarations:** `IranYekan` / `IranYekanFaNum` `@font-face` rules (woff files are bundled).
- **Flag SVGs:** Bundled SVG assets for language flags (e.g., `fa`, `en`, `ar`).

There is no need to import separate `theme.css` or `components.css` files.

## Build 🔧

To build the package and its components:

```bash
yarn build       # Builds the package using Vite
yarn build:strict # Builds the package and runs type checking with vue-tsc
yarn dev         # Builds the package in watch mode for development
```

The build outputs are located in the `dist/` directory:

- `dist/index.mjs` / `dist/index.cjs`: ESM and CJS bundles.
- `dist/chat.css`: Extracted CSS styles (import once).
- `dist/assets/`: Bundled fonts, flag SVGs, and library images.
- `dist/types/`: Generated TypeScript declaration files (`.d.ts`), with the main entry point at `dist/types/index.d.ts`.

## Project Structure 📁

```
vue-chat/
├── app/
│   ├── components/
│   │   ├── call/
│   │   ├── chat/
│   │   ├── global/
│   │   └── ...
│   ├── composables/
│   ├── directives/
│   ├── polyfills/
│   ├── provider/
│   ├── stores/
│   └── index.ts           # Main entry point for the library
├── demo/
│   ├── src/
│   │   ├── App.vue
│   │   ├── main.ts
│   │   └── ...
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── i18n/
│   └── locales/
│       ├── en/
│       └── fa/
├── .gitignore
├── package.json
├── tsconfig.json
├── tsconfig.typecheck.json
└── vite.config.ts
```

## How to use 🛠️

This project provides a reusable Vue 3 chat component designed for integration into larger applications. The primary entry point is `app/index.ts`, which exports the main `<ChatPage />` component, various utility composables, and store modules.

**Key Components and Composables:**

- **`<ChatPage />`:** The main UI component rendering the chat interface, contact list, and call views.
- **`useCall()`:** A composable for managing WebRTC video calls, including joining calls, managing media streams, toggling audio/video, screen sharing, and handling call controls.
- **`useChatMessageList()`:** Manages fetching, displaying, and interacting with chat messages within a conversation.
- **`useAppPermissions()`:** Handles requesting and checking user permissions for microphone, camera, and screen sharing.
- **`useAppToast()`:** Provides a global toast notification system.

**Typical Integration Flow:**

1. **Install Dependencies:** As outlined in the Installation section.
2. **Install the plugin:** `app.use(createChat({ ... }))` after Pinia and vue-i18n (see Usage).
3. **Render `<ChatPage />`**, or compose your own layout from the exported building blocks (`ChatList`, `ChatConversation`, `ChatHeader`, `ChatMessages`, `ChatInput`).

## Testing 🧪

The demo (`pnpm demo:build`) runs on the same fakes with a seeded Persian dataset. Open it in two tabs with different `?user=` values and start a call in both to try video calling.


`pnpm test:e2e` runs the Playwright suite in `e2e/`: every chat feature against in-memory fake backends, plus real two-tab video calls using Chromium's fake camera and mic. Tests also fail if a template uses a component or directive nobody registered.

On NixOS, use the Nix-built browsers (the nixpkgs `playwright-driver` version must match `@playwright/test`):

```sh
export PLAYWRIGHT_BROWSERS_PATH=$(nix build --no-link --print-out-paths nixpkgs#playwright-driver.browsers)
```

## Contributing 🤝

Contributions are welcome! Please follow these steps:

1.  **Fork the repository** to your GitHub account.
2.  **Clone the repository** locally: `git clone <your-fork-url>`.
3.  **Create a new branch** for your feature or bug fix: `git checkout -b feature/your-feature-name`.
4.  **Make your changes** and ensure they are well-tested.
5.  **Commit your changes** with clear and concise commit messages.
6.  **Push your branch** to your fork: `git push origin feature/your-feature-name`.
7.  **Create a Pull Request** to the main repository.

Please ensure your contributions adhere to the project's coding standards and include relevant documentation.

## License 📜

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Important Links 🔗

- **Repository:** [https://github.com/yonus-a/vue-chat](https://github.com/yonus-a/vue-chat)

## Footer ✨

<p align="center">
  Made with ❤️ by yonus-a
</p>
<p align="center">
  If you find this project helpful, please consider starring ⭐, forking 🍴, and opening issues 🐛.
</p>


---
**<p align="center">Generated by [ReadmeCodeGen](https://www.readmecodegen.com/)</p>**
