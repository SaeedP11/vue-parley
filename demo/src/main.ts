import { createApp } from "vue";
import { createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createChat } from "@yonus_amire01/chat";
import { createFakeBackend } from "../../fakes/backend";
import { allowDirectPeerConnections, createBroadcastCallHandlers } from "../../fakes/call";
import { demoData } from "../../fakes/data";
import App from "./App.vue";
import "./style.css";

// Open the demo in two tabs and start a call from both: they signal over a BroadcastChannel and
// connect directly, with no server. `?user=` picks who you are in each tab.
allowDirectPeerConnections();

const userId = new URLSearchParams(location.search).get("user") ?? "me";
const backend = createFakeBackend(demoData(userId), { latency: 300 });

createApp(App)
  .use(createPinia())
  .use(createI18n({ legacy: false, locale: "fa", fallbackLocale: "en", messages: {} }))
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
