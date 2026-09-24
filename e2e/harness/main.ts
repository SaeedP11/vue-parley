import { createApp } from "vue";
import { createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createChat } from "~/index";
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
