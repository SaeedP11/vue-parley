import { createApp } from "vue";
import { createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createChat } from "~/index";
import {
  ME,
  MY_NAME,
  createChatHandlers,
  createMediaHandlers,
  createMessagesHandlers,
  createProfileHandlers,
} from "./mocks";
import { call } from "./calls";
import App from "./App.vue";
import "./style.css";

// The library forces `iceTransportPolicy: "relay"` through a TURN server. The test browser has
// none, so let the two tabs connect directly over host candidates instead.
const NativePC = window.RTCPeerConnection;
window.RTCPeerConnection = class extends NativePC {
  constructor(config?: RTCConfiguration) {
    super({ ...config, iceServers: [], iceTransportPolicy: "all" });
  }
} as typeof RTCPeerConnection;

const i18n = createI18n({
  legacy: false,
  locale: new URLSearchParams(location.search).get("locale") ?? "en",
  fallbackLocale: "en",
  messages: {},
});


// Set up the way a host app would.
const app = createApp(App)
  .use(createPinia())
  .use(i18n)
  .use(
    createChat({
      chat: createChatHandlers(),
      messages: createMessagesHandlers(),
      media: createMediaHandlers(),
      profile: createProfileHandlers(),
      call,
      user: { id: ME, name: MY_NAME },
    }),
  );

app.mount("#app");
