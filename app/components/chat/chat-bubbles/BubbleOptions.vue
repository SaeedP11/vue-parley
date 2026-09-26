<script setup lang="ts">
import { computed, ref } from "vue";
import ContextMenu from "primevue/contextmenu";
import type { MenuItem } from "primevue/menuitem";
import { useMessagesStore } from "~/stores/messageStores";
import type { ExtendedMessage } from "~/types";
import useLocalI18n from "~/composables/useLocalI18n";
import { bubbleOptions } from "@i18n/locales";
const props = defineProps<{
  message: ExtendedMessage;
}>();

const { t } = useLocalI18n(bubbleOptions);
const messagesStore = useMessagesStore();

const menu = ref<InstanceType<typeof ContextMenu> | null>(null);

/** Opens at the pointer: a right click, or where a long press began. */
const openMenu = (event: MouseEvent | PointerEvent) => {
  messagesStore.isOptionMenuOpen = true;
  menu.value?.show(event);
};

const closeMenu = () => {
  menu.value?.hide();
};

const onMenuClosed = () => {
  messagesStore.isOptionMenuOpen = false;
};

defineExpose({ openMenu, closeMenu });

const showAsDeselect = computed(() => {
  return (
    messagesStore.isSelectMode &&
    messagesStore.selectedMessages.has(props.message.id)
  );
});

const targetIds = () =>
  messagesStore.isSelectMode &&
  messagesStore.selectedMessages.has(props.message.id)
    ? messagesStore.selectedArray.map((m) => m.id)
    : [props.message.id];

const items = computed<MenuItem[]>(() => [
  {
    phIcon: "PhArrowBendUpLeft",
    label: t("messageOptions.reply"),
    visible: props.message.isSent,
    command: () => {
      messagesStore.replyingTo = props.message;
    },
  },
  {
    phIcon: "PhPencilSimpleLine",
    label: t("messageOptions.edit"),
    visible: messagesStore.canEdit,
    command: () => messagesStore.triggerEdit(props.message),
  },
  {
    phIcon: "PhCopy",
    label: t("messageOptions.copy"),
    command: () => messagesStore.copyMessageText(),
  },
  {
    phIcon: showAsDeselect.value ? "PhXCircle" : "PhCheckCircle",
    label: showAsDeselect.value
      ? t("messageOptions.deselect")
      : t("messageOptions.select"),
    command: () => {
      if (!messagesStore.isSelectMode) {
        messagesStore.startSelectMode(props.message);
      } else {
        messagesStore.toggleSelection(props.message);
      }
    },
  },
  {
    phIcon: "PhTrash",
    label: t("messageOptions.delete"),
    visible: messagesStore.canDelete,
    danger: true,
    command: () => messagesStore.triggerDelete(targetIds()),
  },
]);
</script>
<template>
  <ContextMenu ref="menu" :model="items" class="vue-chat" @hide="onMenuClosed">
    <template #item="{ item, props: itemProps }">
      <a
        v-bind="itemProps.action"
        :class="item.danger && 'text-chat-error!'"
      >
        <BIcon
          :icon="item.phIcon"
          class="size-5"
          :class="item.danger ? 'text-chat-error' : 'text-chat-on-background/50'"
        />
        <span v-bind="itemProps.label">{{ item.label }}</span>
      </a>
    </template>
  </ContextMenu>
</template>
