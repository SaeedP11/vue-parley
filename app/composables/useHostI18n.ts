import {
  computed,
  getCurrentInstance,
  inject,
  isRef,
  watch,
  type App,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from "vue";
import { createI18n, type I18n } from "vue-i18n";

// vue-i18n provides itself under a per-instance symbol, reachable only through the app. createChat()
// re-provides it under this key so stores, which have no component, can find it too.
const hostI18nKey: InjectionKey<I18n> = Symbol("vue-chat:i18n");

type I18nApp = App & { __VUE_I18N_SYMBOL__?: InjectionKey<I18n> };

function injectFromApp(app: I18nApp): I18n | undefined {
  const symbol = app.__VUE_I18N_SYMBOL__;
  return symbol ? app.runWithContext(() => inject(symbol, undefined)) : undefined;
}

export function provideHostI18n(app: App) {
  const i18n = injectFromApp(app);
  if (i18n) app.provide(hostI18nKey, i18n);
}

function injectHostI18n(): I18n {
  const instance = getCurrentInstance();
  const i18n =
    inject(hostI18nKey, undefined) ??
    // Stores configured through setHandlers() instead of createChat(), used from a component.
    (instance ? injectFromApp(instance.appContext.app) : undefined);
  if (!i18n) {
    throw new Error(
      "[vue-chat] vue-i18n not found: install it, then createChat(), before using the chat",
    );
  }
  return i18n;
}

function read(value: string | Ref<string> | undefined): string | undefined {
  return isRef(value) ? value.value : value;
}

/**
 * The host's current locale. Unlike useI18n(), works in a store as well as a component, so a
 * store can be created anywhere (a Nuxt plugin, a route guard), not only in a component's setup.
 */
export function useHostLocale(): ComputedRef<string> {
  const global = injectHostI18n().global as unknown as { locale: string | Ref<string> };
  return computed(() => read(global.locale) ?? "en");
}

/**
 * Translations for a store: `messages` on their own, following the host's locale. A component
 * uses useLocalI18n() instead, which scopes them to the component.
 */
export function useStoreI18n(messages: Record<string, any>): { t: (key: string) => string } {
  const host = injectHostI18n().global as unknown as {
    locale: string | Ref<string>;
    fallbackLocale: string | Ref<string>;
  };
  const locale = useHostLocale();
  const { global } = createI18n({
    legacy: false,
    locale: locale.value,
    fallbackLocale: read(host.fallbackLocale) ?? "en",
    messages,
  });
  watch(locale, (value) => (global.locale.value = value));
  return { t: (key) => global.t(key) };
}
