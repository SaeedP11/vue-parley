# vue-parley

A drop-in Vue 3 chat and video-call UI. You supply the backend through a few handler objects; the package brings the screens, the state (Pinia stores), the translations and the styles.

Formerly `@yonus_amire01/chat`. To switch, replace that name with `vue-parley` in `package.json` and in imports; nothing else changed.

- Contact list with search, filters and infinite scroll
- Virtualised message list with text, image, file, voice and video messages, replies, edits, deletes, drafts and retries on failed sends
- Voice and video calls with screen sharing over plain browser WebRTC
- English and Persian translations built in, with RTL layout for `fa` and `ar`
- Built from PrimeVue components, laid out with Tailwind; it takes its look from the host's PrimeVue theme
- Precompiled, scoped CSS: no Tailwind needed in the host, and no leaks into the host's styles

## Contents

- [Installation](#installation)
- [Usage](#usage)
  - [Plain Vue + Vite](#plain-vue--vite)
  - [Nuxt 3 / 4](#nuxt-3--4)
  - [Customising the page](#customising-the-page)
  - [Calls outside the chat page](#calls-outside-the-chat-page)
  - [Fake backend](#fake-backend)
- [What `createChat()` does](#what-createchat-does)
- [Exports](#exports)
- [Translations](#translations)
- [Styles](#styles)
- [Upgrading from 3.x](#upgrading-from-3x)
- [Upgrading from 2.x](#upgrading-from-2x)
- [Development](#development)
- [License](#license)

## Installation

```bash
pnpm add vue-parley
# peer dependencies, if the app doesn't have them yet
pnpm add vue vue-i18n pinia @vueuse/core primevue@^4.5 @primeuix/themes@^1
```

npm and yarn work the same way. Peer ranges: `vue` ^3.5, `pinia` 2.2+, 3 or 4, `vue-i18n` 9 to 11, `@vueuse/core` 11 to 14, `primevue` 4.5+ (4.x). PrimeVue 5 is not supported: it moved from MIT to a commercial licence that needs a key and does not allow redistribution inside a component library.

## Usage

### Plain Vue + Vite

Install the plugin once in `main.ts`. Pinia, vue-i18n (with `legacy: false`) and PrimeVue (styled mode, with any preset) must be installed before it.

```ts
// main.ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import PrimeVue from 'primevue/config';
import Aura from '@primeuix/themes/aura';
import { createChat } from 'vue-parley';
import 'vue-parley/style.css';
import App from './App.vue';

createApp(App)
  .use(createPinia())
  .use(createI18n({ legacy: false, locale: 'fa', fallbackLocale: 'en' }))
  .use(PrimeVue, { theme: { preset: Aura, options: { darkModeSelector: '.dark' } } })
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
import { ChatPage } from 'vue-parley';
</script>

<template>
  <ChatPage />
</template>
```

All handler interfaces (`ChatHandlers`, `MessagesHandlers`, `MediaHandlers`, `ProfileHandlers`, `CallHandlers`) are exported as types. For demos, playgrounds and tests there is an in-memory implementation of each; see [Fake backend](#fake-backend).

### Nuxt 3 / 4

Create `app/plugins/chat.client.ts` (Pinia, i18n and PrimeVue come from `@pinia/nuxt`, `@nuxtjs/i18n` and `@primevue/nuxt-module`):

```ts
import { createChat } from 'vue-parley';
import 'vue-parley/style.css';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(createChat({ chat, messages, media, call, user }));
});
```

Render the chat inside `<ClientOnly>`: its handlers are only installed in the browser, and it needs browser APIs (IndexedDB, WebRTC, the camera and mic). Importing the package on the server is safe, and so is creating its stores from a plugin or middleware.

### Customising the page

`<ChatPage />` has four slots:

| Slot               | Where                                              | Slot props                      |
| ------------------ | -------------------------------------------------- | ------------------------------- |
| `empty`            | Replaces the "no conversation selected" placeholder | none                            |
| `header-actions`   | Conversation header, beside the call button        | `{ contact }`                   |
| `conversation-top` | Between the header and the messages                | `{ conversationId, contact }`   |
| `above-input`      | Above the input, while the conversation is active  | `{ conversationId, contact }`   |

To build a different layout, use the exported building blocks instead: `ChatList`, `ChatConversation`, `ChatHeader`, `ChatMessages`, `ChatInput` and `ChatBubble`. They read the same stores, so they work together once `createChat()` is installed.

### Calls outside the chat page

A call belongs to the call store, not to a component, so it keeps running when the chat page unmounts. To keep it **on screen** while the user navigates, render the call view once near the app root and turn off the chat page's own:

```vue
<!-- App.vue -->
<RouterView />
<Call v-if="callStore.session" />

<!-- the chat route -->
<ChatPage :render-call="false" />
```

`Call` is an async component, so apps that never call don't download it.

Calls use the browser's WebRTC API directly (no `simple-peer`, no Node polyfills). The signalling messages keep simple-peer's format, so tabs still on an older, simple-peer based release can call this one and back; `e2e/tests/interop.spec.ts` checks that.

Call handlers also accept `iceTransportPolicy` (default `"relay"`; `"all"` allows direct connections without TURN) and `debug` (logs signalling to the console).

### Fake backend

`vue-parley/fakes` is an in-memory implementation of every handler, for demos, playgrounds and tests. It is a separate entry, so apps that don't import it don't ship it.

```ts
import { createFakeBackend, createBroadcastCallHandlers, demoData } from 'vue-parley/fakes';

const backend = createFakeBackend(demoData('me'), { latency: 300 });

app.use(
  createChat({
    chat: backend.chat,
    messages: backend.messages,
    media: backend.media,
    profile: backend.profile,
    call: createBroadcastCallHandlers(),
    user: { id: 'me', name: 'Me' },
  }),
);
```

- `demoData(userId, count?)` seeds conversations and messages (Persian text); `e2eData(userId)` is the smaller set the e2e tests use.
- `backend.state` makes the next send, edit or delete fail, to try the retry and error paths.
- `createBroadcastCallHandlers()` signals over a `BroadcastChannel`, so two tabs of the same browser can call each other with no server. Give the tabs different user ids.

Nothing is persisted, and calls never leave the browser: don't use it in production.

## What `createChat()` does

- Checks that Pinia, vue-i18n and PrimeVue are installed, and installs PrimeVue's `ToastService` if the host hasn't. The chat's own toasts use the group `vue-parley`, rendered by `ChatConversation`, so they never show up in the host's `<Toast />`.
- Gives each store its handlers when that store is first created (via a Pinia plugin), whether a component, a Nuxt plugin or a route guard creates it.
- Sets the signed-in user on the profile store.
- Hands the call handlers to the call store. `provideCallHandlers()` in a component does the same, for handlers that only exist further down the tree.

Every component and directive the chat uses is imported by the component itself, so nothing else needs to be registered.

## Exports

| Export | What it is |
| ------ | ---------- |
| `createChat(options)` | The Vue plugin. See [Usage](#usage). |
| `provideCallHandlers(handlers)` | Supplies call handlers from inside a component. |
| `ChatPage` | The whole chat: contact list, conversation and call view. |
| `Call` | The call view (async). |
| `ChatList`, `ChatConversation`, `ChatHeader`, `ChatMessages`, `ChatInput`, `ChatBubble` | Building blocks for custom layouts. |
| `BIcon`, `BEmojiPicker`, `BVirtualVerticalList` | A Phosphor icon by name, the emoji picker and the virtualised list the chat uses. Every other control is a PrimeVue component. |
| `useChatStore`, `useMessagesStore`, `useMediaStore`, `useProfileStore`, `useCallStore` | The Pinia stores. |
| Types | Handler interfaces, `Contact`, `Message`, `SignalData`, `ChatOptions`, `ChatUser` and the rest of `app/types`. |
| `vue-parley/fakes` | `createFakeBackend`, `createBroadcastCallHandlers`, `demoData`, `e2eData`: see [Fake backend](#fake-backend). |

Working with conversations the list page hasn't fetched (say, one opened from a link): add them with `chatStore.addContact(contact)` and change them with `chatStore.updateContact(id, changes)`. `chatStore.conversationStates` is a read-only view.

## Translations

English (`en`) and Persian (`fa`) ship with the package and load automatically; the host only has to install vue-i18n and set `locale`. The layout switches to right-to-left when the locale starts with `fa` or `ar`.

## Styles

Import the stylesheet once:

```ts
import 'vue-parley/style.css';
```

It holds the compiled Tailwind v4 theme and only the utilities the package uses, with every rule scoped to the `.vue-chat` root. The host needs no Tailwind of its own, and the chat's styles (including its reset) can't override the host's. Images and animations are bundled into the JavaScript, so there are no asset files to serve.

Controls (buttons, inputs, dialogs, menus, tabs, toasts, the image viewer) are PrimeVue components, so they follow the host's PrimeVue preset. The chat's own surfaces use CSS variables such as `--color-chat-primary`, `--color-chat-background` and `--color-chat-on-background` (see `app/assets/css/theme.css`); the accent, `--color-chat-primary`, is taken from the preset's primary colour. Message bubbles use `--color-chat-bubble` for the other side and `--color-chat-bubble-mine` for your own, which defaults to a tint of the accent. Adding the `dark` class to an ancestor switches the chat to its dark palette; set PrimeVue's `darkModeSelector` to `.dark` so both switch together.

The chat themes PrimeVue components through their props and design tokens; the few size and visibility tweaks it makes on them use important utilities, so it works whether or not the host puts PrimeVue in a CSS layer.

## Upgrading from 3.x

The UI is now built from PrimeVue (4.x) and Tailwind, so:

- **PrimeVue is a peer dependency.** Install `primevue` 4.5+ and a theme, and `app.use(PrimeVue, { theme })` before `createChat()`; it throws otherwise. Hosts that already use PrimeVue need nothing more.
- **Removed exports.** `BButton`, `BInput`, `BSelect`, `BModal`, `BPopup`, `BMenu`, `BTab`, `BToast`, `BImage`, `BLabel`, `BCheckBox` and `BCarousel` are gone; use PrimeVue's `Button`, `InputText`, `Select`, `Dialog`, `Menu`/`Popover`, `Tabs`, `Toast`, `Image`, `Tag`, `Checkbox` and `Galleria`.
- **Look.** Controls take their colours, radii and focus rings from the host's PrimeVue preset, and the chat's accent colour follows the preset's primary colour.
- **Dependencies.** `vue3-lottie` is no longer used; loading spinners are PrimeVue's `ProgressSpinner`.

## Upgrading from 2.x

3.0 needs no new setup, but a few things behave differently:

- **Contacts.** `chatStore.conversationStates` is now a read-only view. Add a conversation no list page has fetched with `chatStore.addContact(contact)` and change one with `chatStore.updateContact(id, changes)`; writing to `conversationStates[...].data` warns in development and has no effect.
- **Calls.** The running call lives in `callStore.session`, not in the call view. `callStore.endCall()` now also tells the other side (publishes `hangup`) and releases camera and mic. The exported `Call` is an async component; render it while `callStore.session` is set.
- **WebRTC.** `simple-peer` is gone; calls use the browser API directly. Signalling messages keep the old format, so 2.x tabs and 3.0 tabs can call each other during a rollout. Hosts can drop `simple-peer` and `@types/simple-peer`; `SignalData` is exported by this package.
- **Styles.** `style.css` is compiled: hosts need no Tailwind of their own, and a Tailwind `@source` pointing at this package can go. Tailwind's reset applies only inside `.vue-chat`.
- **Registration.** Components import their own directives (`v-file-pick`, `v-image-pick`, `v-loading`) and components (`LottieAnimation`, `UploadProgressOverlay`). Host shims for them are no longer needed.
- **Package layout.** Dependencies are no longer bundled (they install with the package), and `dist/` has lazy `chunks/`.
- **Removed defaults.** `chatStore.currentUserBirthDate` defaults to `null`; it and `chosenRole` are deprecated.
- **Media cache.** The IndexedDB cache format changed and is cleared once; it is now capped at 200 MB.

The recommended setup is now `app.use(createChat({ ... }))` (see [Usage](#usage)); the per-store `setHandlers()` calls and `provideCallHandlers()` keep working.

## Development

```bash
pnpm install
pnpm build        # dist/: ESM + CJS bundles, chat.css, lazy chunks/ and types/
pnpm dev          # build in watch mode
pnpm typecheck    # vue-tsc
pnpm demo         # build, then serve the demo
pnpm demo:build   # build the package and the demo
pnpm test:e2e     # Playwright suite (test:e2e:ui for the UI runner)
```

`prepublishOnly` runs `typecheck` and `build`, so a publish always ships a fresh `dist/`.

The demo (`demo/`, a workspace package that consumes the built `dist/`) runs on the fakes with a seeded Persian dataset. Open it in two tabs with different `?user=` values and start a call in both to try video calling.

`pnpm test:e2e` runs the Playwright suite in `e2e/`: every chat feature against the in-memory fakes, plus real two-tab video calls using Chromium's fake camera and mic. Tests also fail if a template uses a component or directive nobody registered.

On NixOS, use the Nix-built browsers (the nixpkgs `playwright-driver` version must match `@playwright/test`):

```sh
export PLAYWRIGHT_BROWSERS_PATH=$(nix build --no-link --print-out-paths nixpkgs#playwright-driver.browsers)
```

### Layout

```
app/
  index.ts        package entry: everything listed under Exports
  plugin.ts       createChat()
  components/     ChatPage, chat/, call/, general/ (small PrimeVue compositions), global/ (BIcon and friends)
  composables/    including call/: signalling, peers, media
  stores/         Pinia stores
  types/          handler interfaces and data types
  assets/css/     theme tokens and base styles
i18n/locales/     en and fa translations
fakes/            in-memory backend and call handlers (published as `vue-parley/fakes`)
demo/             demo app (workspace package)
e2e/              Playwright tests and harness
```

## License

[MIT](LICENSE)

Repository: [github.com/yonus-a/vue-chat](https://github.com/yonus-a/vue-chat)
