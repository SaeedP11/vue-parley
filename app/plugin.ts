import type { App, Plugin } from "vue";
import type { Pinia } from "pinia";
import ToastService from "primevue/toastservice";
import type {
  CallHandlers,
  ChatHandlers,
  MediaHandlers,
  MessagesHandlers,
  ProfileHandlers,
} from "./types";
import { useCallStore } from "./stores/callStore";
import { useChatStore } from "./stores/chatStore";
import { useMessagesStore } from "./stores/messageStores";
import { useMediaStore } from "./stores/mediaStore";
import { useProfileStore } from "./stores/profileStore";
import { provideHostI18n } from "./composables/useHostI18n";

export interface ChatUser {
  id: string;
  name: string;
  avatar?: Blob;
}

export interface ChatOptions {
  chat: ChatHandlers;
  messages: MessagesHandlers;
  media: MediaHandlers;
  /** Needed for the profile panel's media and files tabs. */
  profile?: ProfileHandlers;
  /** Omit to leave calling out; `provideCallHandlers()` can still supply them later. */
  call?: CallHandlers;
  /** The signed-in user. Can also be set later through `useProfileStore()`. */
  user?: ChatUser;
}

/**
 * Wires the chat into an app in one call:
 *
 *   app.use(createPinia()).use(i18n).use(PrimeVue, { theme }).use(createChat({ chat, messages, media, user }))
 *
 * Pinia, vue-i18n and PrimeVue must be installed first; the stores, translations and UI depend
 * on them.
 */
export function createChat(options: ChatOptions): Plugin {
  return {
    install(app: App) {
      const pinia = app.config.globalProperties.$pinia as Pinia | undefined;
      if (!pinia) {
        throw new Error(
          "[vue-chat] Install Pinia before createChat(): app.use(createPinia()).use(createChat(...))",
        );
      }
      if (!app.config.globalProperties.$i18n) {
        throw new Error(
          "[vue-chat] Install vue-i18n (legacy: false) before createChat()",
        );
      }
      // The UI is built from PrimeVue components, themed by the host's own preset.
      if (!app.config.globalProperties.$primevue) {
        throw new Error(
          "[vue-chat] Install PrimeVue before createChat(): app.use(PrimeVue, { theme }).use(createChat(...))",
        );
      }
      // The chat's toasts go through PrimeVue's toast service; hosts that use it already keep theirs.
      if (!app.config.globalProperties.$toast) app.use(ToastService);

      // Lets stores translate without a component, so they can be created anywhere.
      provideHostI18n(app);

      // Configure each store when it first comes to life, whoever creates it.
      pinia.use(({ store }) => {
        switch (store.$id) {
          case useChatStore.$id:
            store.setHandlers(options.chat);
            break;
          case useMessagesStore.$id:
            store.setHandlers(options.messages);
            break;
          case useMediaStore.$id:
            store.setHandlers(options.media);
            break;
          case useCallStore.$id:
            if (options.call) store.setHandlers(options.call);
            break;
          case useProfileStore.$id:
            if (options.profile) store.setHandlers(options.profile);
            if (options.user) {
              store.userId = options.user.id;
              store.userName = options.user.name;
              store.userAvatar = options.user.avatar;
            }
            break;
        }
      });

    },
  };
}
