import { useToast } from "primevue/usetoast";

/** Rendered by `<Toast group="vue-parley" />` in ChatView, so the host's own toasts stay apart. */
export const TOAST_GROUP = "vue-parley";

const SEVERITY = {
  success: "success",
  error: "error",
  warning: "warn",
  info: "info",
} as const;

export const useAppToast = () => {
  const toast = useToast();

  const openToast = (
    message: string,
    type: keyof typeof SEVERITY = "success",
  ) => {
    toast.add({
      group: TOAST_GROUP,
      severity: SEVERITY[type],
      summary: message,
      life: 4000,
    });
  };

  return { openToast };
};
