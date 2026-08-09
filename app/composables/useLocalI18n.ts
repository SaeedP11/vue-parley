import { useI18n } from "vue-i18n";
import { computed } from "vue";

function mergeLocaleObjects(objects) {
  return objects.reduce((result, obj: Record<string, any>) => {
    for (const [key, value] of Object.entries(obj)) {
      result[key] = {
        ...(result[key] || {}),
        ...value,
      };
    }

    return result;
  }, {});
}

export default function useLocalI18n(...messages: Record<string, any>[]) {
  return useI18n({
    useScope: "local",
    inheritLocale: true,
    messages: mergeLocaleObjects(messages),
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
