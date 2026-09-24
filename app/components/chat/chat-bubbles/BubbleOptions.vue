<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { useMessagesStore } from "~/stores/messageStores";
import type { Menu } from "~/types/components/menu";
import type { ExtendedMessage } from "~/types";
import BMenu from "~/components/global/BMenu.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { bubbleOptions } from "@i18n/locales";
const props = defineProps<{
  message: ExtendedMessage;
}>();

const { t } = useLocalI18n(bubbleOptions);
const messagesStore = useMessagesStore();
const isOpen = ref(false);

const menuRef = ref<Menu | null>(null);
const position = ref({ x: 0, y: 0 });

const openMenu = (x: number, y: number) => {
  const adjustedX = Math.min(x, window.innerWidth - 250);
  const adjustedY = Math.min(y, window.innerHeight - 300);

  position.value = { x: adjustedX, y: adjustedY };
  isOpen.value = true;
  messagesStore.isOptionMenuOpen = true;

  nextTick(() => {
    menuRef.value?.open();
  });
};

const closeMenu = () => {
  menuRef.value?.close();
  messagesStore.isOptionMenuOpen = false;
};

const onMenuClosed = () => {
  isOpen.value = false;
  messagesStore.isOptionMenuOpen = false;
};

defineExpose({ openMenu, closeMenu });

const showAsDeselect = computed(() => {
  return (
    messagesStore.isSelectMode &&
    messagesStore.selectedMessages.has(props.message.id)
  );
});
const options = computed(() => {
  const allOptions = [
    {
      icon: "PhArrowBendUpLeft",
      key: "reply",
      label: t("messageOptions.reply"),
      canShow: props.message.isSent,
    },
    {
      icon: "PhPencilSimpleLine",
      key: "edit",
      label: t("messageOptions.edit"),
      canShow: messagesStore.canEdit,
    },
    {
      icon: "PhCopy",
      key: "copy",
      label: t("messageOptions.copy"),
      canShow: true,
    },
    {
      icon: showAsDeselect.value ? "PhXCircle" : "PhCheckCircle",
      key: "select_toggle",
      label: showAsDeselect.value
        ? t("messageOptions.deselect")
        : t("messageOptions.select"),
      canShow: true,
    },
    {
      icon: "PhTrash",
      key: "delete",
      label: t("messageOptions.delete"),
      canShow: messagesStore.canDelete,
      color: "error",
    },
  ];
  return allOptions.filter((option) => option.canShow);
});

const handleOption = (key: string) => {
  const targetIds =
    messagesStore.isSelectMode &&
    messagesStore.selectedMessages.has(props.message.id)
      ? messagesStore.selectedArray.map((m) => m.id)
      : [props.message.id];

  closeMenu();

  // Defer the action so the menu's exit animation finishes first.
  // Track the timer so we can cancel it if the component unmounts mid-delay.
  pendingAction = setTimeout(() => {
    pendingAction = null;
    switch (key) {
      case "delete":
        messagesStore.triggerDelete(targetIds);
        break;
      case "select_toggle":
        if (!messagesStore.isSelectMode) {
          messagesStore.startSelectMode(props.message);
        } else {
          messagesStore.toggleSelection(props.message);
        }
        break;
      case "edit":
        messagesStore.triggerEdit(props.message);
        break;
      case "reply":
        if (!props.message.isSent) return;
        messagesStore.replyingTo = props.message;
        break;
      case "copy":
        messagesStore.copyMessageText();
        break;
    }
  }, 300);
};

let pendingAction: ReturnType<typeof setTimeout> | null = null;

onBeforeUnmount(() => {
  if (pendingAction) clearTimeout(pendingAction);
});
</script>
<template>
  <Teleport to="body">
    <div
      class="vue-chat"
      :style="{
        position: 'fixed',
        top: `${position.y}px`,
        left: `${position.x}px`,
        zIndex: 99999,
        pointerEvents: 'none',
      }"
      dir="rtl"
    >
      <BMenu
        @select="handleOption"
        :options="options"
        ref="menuRef"
        @close="onMenuClosed"
      >
        <template #trigger>
          <div style="width: 1px; height: 1px"></div>
        </template>
      </BMenu>
    </div>
  </Teleport>
</template>
