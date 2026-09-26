<template>
  <ResponsiveDialog
    v-model:visible="visible"
    :show-header="false"
    width="30rem"
    @hide="onHide"
  >
    <div class="flex w-full items-center gap-x-2 pt-5 pb-3">
      <BIcon
        :icon="popupIcon.icon"
        weight="fill"
        :class="[popupIcon.color]"
        class="size-7"
      />
      <div class="text-label-lg text-chat-on-background select-none">
        {{ popupContent.title }}
      </div>
    </div>
    <p class="text-body-md text-chat-muted select-none">
      {{ popupContent.description }}
    </p>
    <div class="flex w-full items-center gap-x-3 pt-5">
      <Button
        :label="actionButtonText"
        :loading="isLoading"
        @click="handleAction"
      />
      <Button
        severity="secondary"
        outlined
        :label="t('permissions.notNow')"
        @click="closePopup"
      />
    </div>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import {
  useAppPermissions,
  type PopupState,
} from "~/composables/useAppPermissions";
import { ref, computed, onUnmounted } from "vue";
import Button from "primevue/button";
import ResponsiveDialog from "~/components/general/ResponsiveDialog.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { permissionPopup } from "@i18n/locales";
import { useEventBus } from "@vueuse/core";

const { t } = useLocalI18n(permissionPopup);
const { requestMediaAccess, getNativeScreenShare } = useAppPermissions();

const visible = ref(false);
const popupMode = ref<PopupState>("mic-permission");
const isLoading = ref(false);
const currentResolver = ref<((v: boolean) => void) | null>(null);

// --- Event Bus ---
const bus = useEventBus<{ resolve: (v: boolean) => void; state: PopupState }>(
  "global-permission-popup",
);

// `bus.on(handler)` returns the cleanup function directly — not an object with an `off` property.
const offBus = bus.on((payload) => {
  currentResolver.value = payload.resolve;
  switchMode(payload.state);
});

onUnmounted(() => {
  offBus();
});

// --- Computed ---
const popupIcon = computed(() => ({
  icon: popupMode.value.endsWith("permission")
    ? "PhWarningCircle"
    : "PhWarningOctagon",
  color: popupMode.value.endsWith("permission")
    ? "text-chat-primary"
    : "text-chat-error",
}));

const actionButtonText = computed(() =>
  popupMode.value.endsWith("permission")
    ? t("permissions.allow")
    : t("permissions.retry"),
);

const popupContent = computed(() => {
  switch (popupMode.value) {
    case "permission":
      return {
        title: t("permissions.permissionTitle"),
        description: t("permissions.description"),
      };
    case "cam-error":
      return {
        title: t("permissions.camError.title"),
        description: t("permissions.camError.description"),
      };
    case "mic-error":
      return {
        title: t("permissions.micError.title"),
        description: t("permissions.micError.description"),
      };
    case "cam-permission":
      return {
        title: t("permissions.cam.title"),
        description: t("permissions.cam.description"),
      };
    case "mic-permission":
      return {
        title: t("permissions.mic.title"),
        description: t("permissions.mic.description"),
      };
    case "screen-share-error":
      return {
        title: t("permissions.screenError.title"),
        description: t("permissions.screenError.description"),
      };
    case "screen-share-permission":
      return {
        title: t("permissions.screen.title"),
        description: t("permissions.screen.description"),
      };
  }
});

// --- Methods ---
const settle = (granted: boolean) => {
  currentResolver.value?.(granted);
  currentResolver.value = null;
};

let switching = false;

// Dismissing the dialog (Escape) refuses, like "Not now"; switching to another state does not.
const onHide = () => {
  if (!switching) settle(false);
};

const switchMode = async (newMode: PopupState) => {
  switching = true;
  visible.value = false;

  // Let the closing dialog finish animating before it reopens with new content.
  await new Promise((resolve) => setTimeout(resolve, 300));

  popupMode.value = newMode;
  isLoading.value = false;
  visible.value = true;
  switching = false;
};

const closePopup = () => {
  settle(false);
  visible.value = false;
};

const handleAction = async () => {
  isLoading.value = true;
  let success = false;

  // --- 1. SCREEN SHARE FLOW (Standalone) ---
  if (popupMode.value === "screen-share-permission") {
    try {
      const stream = await getNativeScreenShare();
      if (stream) success = true;
    } catch (err: unknown) {
      console.error("Screen Share Error:", (err as Error).name);
      success = false;
    }

    isLoading.value = false;
    if (success) {
      settle(true);
      visible.value = false;
    } else {
      // macOS often throws NotAllowedError if System Settings are off
      await switchMode("screen-share-error");
    }
    return; // EXIT HERE so it doesn't run the Mic/Cam logic below
  }

  // --- 2. MIC / CAM FLOW ---
  let need: "audio" | "video" | "both" = "audio";
  if (popupMode.value.startsWith("cam")) need = "video";
  if (popupMode.value === "permission") need = "both";

  const result = await requestMediaAccess(need);

  isLoading.value = false;
  if (result.success) {
    settle(true);
    visible.value = false;
  } else {
    // If hardware is missing (Mac Mini), show a specific error
    const errorMode =
      need === "video" || need === "both" ? "cam-error" : "mic-error";
    await switchMode(errorMode);
  }
};

defineExpose<{
  open: (state: PopupState) => void;
  close: () => void;
  setLoading: (state: boolean) => void;
}>({
  open: (state: PopupState) => {
    popupMode.value = state;
    isLoading.value = false;
    visible.value = true;
  },
  close: closePopup,
  setLoading: (state: boolean) => {
    isLoading.value = state;
  },
});
</script>
