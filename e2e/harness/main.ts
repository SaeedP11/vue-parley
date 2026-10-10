import { createApp } from "vue";
import { createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import PrimeVue from "primevue/config";
import { createChat, useCallStore, type CallMessageSchema } from "~/index";
import { primeVueOptions } from "../../demo/src/theme";
import { ME, MY_NAME, backend, call } from "./backend";
import App from "./App.vue";
import "./style.css";

const i18n = createI18n({
  legacy: false,
  locale: new URLSearchParams(location.search).get("locale") ?? "en",
  fallbackLocale: "en",
  messages: {},
});

// Set up the way a host app would.
createApp(App)
  .use(createPinia())
  .use(i18n)
  .use(PrimeVue, primeVueOptions)
  .use(
    createChat({
      chat: backend.chat,
      messages: backend.messages,
      media: backend.media,
      profile: backend.profile,
      call,
      user: { id: ME, name: MY_NAME },
    }),
  )
  .mount("#app");

// What a host does for every conversation's channel: hand each call message to the call store, so
// the header offers to join a call that others are in. The harness has a single bus.
const bus = new BroadcastChannel("vue-chat-e2e-call");
bus.onmessage = (e) => useCallStore().observeCall(JSON.parse(e.data) as CallMessageSchema);
