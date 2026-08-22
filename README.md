# Vue Chat 🚀

Reusable Vue 3 chat dashboard component extracted from the Behayand frontend.

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
- [What `BehayandChat.install` does](#what-behayandchatinstall-does-✅)
- [i18n Keys](#i18n-keys-🌍)
- [Styles](#styles-💅)
- [Build](#build-🔧)
- [Project Structure](#project-structure-📁)
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

Configure your `main.ts`:

```ts
// main.ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { BehayandChat, ChatPage } from '@yonus_amire01/chat';
import '@yonus_amire01/chat/style.css';

import App from './App.vue';
// Required message keys — see "i18n keys" below.
import faMessages from './locales/fa.json';

const app = createApp(App);

app.use(createPinia()); // Pinia must be installed BEFORE BehayandChat.
app.use(
  createI18n({
    legacy: false,
    locale: 'fa',
    messages: { fa: faMessages },
  }),
);
app.use(BehayandChat /* , { adapter: myAdapter } */);

app.mount('#app');
```

Then, render the `<ChatPage />` component anywhere in your application:

```vue
<template>
  <ChatPage />
</template>
```

If no `adapter` is provided, `createMockAdapter()` is used, allowing you to preview the UI without a backend.

**Adapter Interface:**

```ts
import type { HostAdapter } from '@yonus_amire01/chat';

const adapter: HostAdapter = {
  chat: /* ChatAdapter */,
  chatAction: /* ChatActionAdapter */,
  service: /* ServiceAdapter */,
  medication: /* MedicationAdapter */,
};
```

### Nuxt 3 / 4

Create `app/plugins/behayand-chat.ts`:

```ts
import { BehayandChat } from '@yonus_amire01/chat';
import '@yonus_amire01/chat/style.css';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(BehayandChat /* , { adapter } */);
});
```

Pinia and i18n are managed by `@pinia/nuxt` and `@nuxtjs/i18n` modules, so manual installation is not required.

## What `BehayandChat.install` does ✅

- **Store Initialization:** Creates and registers the chat, chat-action, service, medication, and call stores, driven by the provided (or mock) adapter.
- **Global Component Registration:** Automatically registers all components located in `components/global/*.vue` (e.g., `BButton`, `BLabel`, `BVirtualVerticalList`) within the Vue application. This ensures that components used internally by `<ChatPage />` are readily available.

Note: You do not need to install PrimeVue, as this package does not rely on any of its components.

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

- **Tailwind v4 Base & Utilities:** Scoped to the package's class usage.
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
2. **Initialize Plugin:** Use `BehayandChat.install()` in your Vue app's main entry point (`main.ts` or Nuxt plugin).
3. **Provide Adapter:** Supply a `HostAdapter` implementation or rely on the mock adapter for development.
4. **Render `<ChatPage />`:** Include the `<ChatPage />` component in your application's templates.

**Example (from `demo/src/App.vue`):**

```vue
<script setup lang="ts">
import {
  ChatPage,
  useChatStore,
  useCallStore,
  useMessagesStore,
  useMediaStore,
} from '../../dist';

// Mock handlers for demonstration
import { createMockChatHelpers } from './mock/conversations';
import { createMockMessagesHandlers } from './mock/messages';
import { createMockMediaHandlers } from './mock/media';

const chatStore = useChatStore();
const messagesStore = useMessagesStore();
const mediaStore = useMediaStore();
const callStore = useCallStore();

// Set up mock handlers
chatStore.setHandlers(createMockChatHelpers());
messagesStore.setHandlers(createMockMessagesHandlers());
mediaStore.setHandlers(createMockMediaHandlers());

// Example functions to control calls
function startCall() { callStore.startCall('test-channel'); }
function minimizeCall() { callStore.minimize(); }
function maximizeCall() { callStore.maximize(); }
</script>

<template>
  <!-- Call control buttons (for demo purposes) -->
  <div style="padding: 4px; background: #ddd; display: flex; gap: 4px">
    <button @click="startCall">Start call</button>
    <button @click="minimizeCall">Minimize</button>
    <button @click="maximizeCall">Maximize</button>
  </div>
  <!-- Render the main ChatPage component -->
  <ChatPage />
</template>
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
