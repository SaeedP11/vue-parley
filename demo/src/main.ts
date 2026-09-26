import { createApp } from "vue";
import { createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import PrimeVue from "primevue/config";
import { createChat } from "vue-parley";
import { createBroadcastCallHandlers, createFakeBackend, demoData } from "vue-parley/fakes";
import App from "./App.vue";
import { primeVueOptions } from "./theme";
import "./style.css";

// Open the demo in two tabs and start a call from both: they signal over a BroadcastChannel and
// connect directly, with no server. `?user=` picks who you are in each tab.

const userId = new URLSearchParams(location.search).get("user") ?? "me";
const backend = createFakeBackend(demoData(userId), { latency: 300 });

createApp(App)
  .use(createPinia())
  .use(createI18n({ legacy: false, locale: "fa", fallbackLocale: "en", messages: {} }))
  .use(PrimeVue, primeVueOptions)
  .use(
    createChat({
      chat: backend.chat,
      messages: backend.messages,
      media: backend.media,
      profile: backend.profile,
      call: createBroadcastCallHandlers(),
      user: { id: userId, name: userId },
    }),
  )
  .mount("#app");
