<template>
  <ResponsiveDialog
    v-model:visible="visible"
    :show-header="false"
    :closable="!loading"
    :close-on-escape="!loading"
    :dismissable-mask="!loading"
    width="30rem"
    @after-hide="emit('closed')"
  >
    <div class="flex flex-col items-center pt-6 text-center">
      <div
        class="flex size-16 items-center justify-center rounded-full"
        :class="stateStyle.bg"
      >
        <BIcon
          :icon="stateStyle.icon"
          weight="fill"
          class="size-8"
          :class="stateStyle.text"
        />
      </div>
      <div class="mt-4 flex w-full flex-col items-center gap-y-3 select-none">
        <div v-if="title.trim()" class="text-label-lg text-chat-on-background">
          {{ title }}
        </div>
        <div v-if="text.trim()" class="text-body-md text-chat-on-background/50">
          {{ text }}
        </div>
      </div>
      <div class="mt-8 flex w-full items-center gap-x-3">
        <Button
          class="flex-1"
          :label="hasAction ? actionText : t('confirm')"
          :severity="hasAction ? stateStyle.severity : undefined"
          :loading="loading"
          @click="handleAction"
        />
        <Button
          v-if="hasAction"
          class="flex-1"
          :label="t('cancel')"
          severity="secondary"
          outlined
          :disabled="loading"
          @click="closeModal"
        />
      </div>
    </div>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import Button from "primevue/button";
import ResponsiveDialog from "./ResponsiveDialog.vue";
import type { ModalState } from "~/types/components/modal";
import useLocalI18n from "~/composables/useLocalI18n";
import { bModal } from "@i18n/locales";

withDefaults(
  defineProps<{
    /** Keeps the modal open, with the action button spinning, until cleared. */
    loading?: boolean;
  }>(),
  { loading: false },
);

const emit = defineEmits<{
  cancel: [];
  action: [];
  closed: [];
}>();

const { t } = useLocalI18n(bModal);
const visible = ref(false);
const state = ref<ModalState>("success");
const text = ref("");
const title = ref("");
const hasAction = ref(false);
const actionText = ref("");

const STATE_STYLES = {
  error: {
    icon: "PhWarningOctagon",
    severity: "danger",
    bg: "bg-chat-error/10",
    text: "text-chat-error",
  },
  warning: {
    icon: "PhWarning",
    severity: "warn",
    bg: "bg-chat-warning/10",
    text: "text-chat-warning",
  },
  success: {
    icon: "PhCheckCircle",
    severity: undefined,
    bg: "bg-chat-success/10",
    text: "text-chat-success",
  },
} as const;

const stateStyle = computed(() => STATE_STYLES[state.value]);

const closeModal = () => {
  visible.value = false;
};

const openModal = (
  modalTitle: string,
  description: string,
  color: ModalState,
  action: boolean = false,
  modalActionText?: string,
) => {
  text.value = description;
  title.value = modalTitle;
  state.value = color;
  hasAction.value = action;
  actionText.value = modalActionText || t("confirm");
  visible.value = true;
};

const handleAction = () => {
  if (hasAction.value) {
    emit("action");
  } else {
    closeModal();
    emit("cancel");
  }
};

defineExpose({ openModal, closeModal });
</script>
