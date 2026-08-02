import { useI18n } from "vue-i18n";
import { computed } from "vue";

export default function useLocalI18n(messages: Record<string, any>) {
  return useI18n({
    useScope: "local",
    inheritLocale: true,
    messages,
  });
}

export function useDirection() {
  const { locale } = useI18n();

  const dir = computed<"rtl" | "ltr">(() => {
    const currentLocale = locale.value;

    if (currentLocale.startsWith("fa") || currentLocale.startsWith("ar")) {
      return "rtl";
    }

    return "ltr";
  });

  return {
    dir,
  };
}
