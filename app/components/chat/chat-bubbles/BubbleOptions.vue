<script setup lang="ts">
/**
 * The message's action menu, opened at the pointer by a right click or long press. It is one
 * PrimeVue ContextMenu laid out as a card: a header with when the message was sent (and, on your
 * own, whether it was seen), a row of quick-action tiles, then the destructive action set apart.
 * The header is a disabled item, so arrow keys and typeahead skip it; the tiles and the delete row
 * are ordinary items in one wrapping list, so keyboard navigation still walks them in order.
 */
import { computed, ref } from "vue";
import ContextMenu from "primevue/contextmenu";
import type { MenuItem } from "primevue/menuitem";
import { useMessagesStore } from "~/stores/messageStores";
import type { ExtendedMessage } from "~/types";
import useLocalI18n from "~/composables/useLocalI18n";
import { useDate } from "~/composables/useDate.js";
import { bubbleOptions } from "@i18n/locales";

const props = defineProps<{
  message: ExtendedMessage;
  isMine: boolean;
}>();

const { t } = useLocalI18n(bubbleOptions);
const { formatDateShort, formatTime } = useDate();
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

const sentOn = computed(() => {
  const date = new Date(props.message.date);
  const day =
    date.toDateString() === new Date().toDateString()
      ? t("meta.today")
      : formatDateShort(date);
  return t("meta.sentOn", { day, time: formatTime(date) });
});

const isSeen = computed(() => props.message.isSent && props.message.isRead);

// Tiles share the first row; anything else takes a full row. `class` lands on the item's <li>.
const TILE = "flex-1 min-w-0";
const ROW = "basis-full";

const items = computed<MenuItem[]>(() => [
  { key: "meta", meta: true, disabled: true, class: `${ROW} opacity-100!` },
  {
    key: "reply",
    phIcon: "PhArrowBendUpLeft",
    label: t("messageOptions.reply"),
    visible: props.message.isSent,
    class: TILE,
    command: () => {
      messagesStore.replyingTo = props.message;
    },
  },
  {
    key: "copy",
    phIcon: "PhCopy",
    label: t("messageOptions.copy"),
    // Copy takes only text, so there is nothing to copy from a photo, voice note or file.
    visible: messagesStore.selectedArray.some((m) => m.text?.trim()),
    class: TILE,
    command: () => messagesStore.copyMessageText(),
  },
  {
    key: "edit",
    phIcon: "PhPencilSimpleLine",
    label: t("messageOptions.edit"),
    visible: messagesStore.canEdit,
    class: TILE,
    command: () => messagesStore.triggerEdit(props.message),
  },
  {
    key: "select",
    phIcon: showAsDeselect.value ? "PhXCircle" : "PhCheckCircle",
    label: showAsDeselect.value
      ? t("messageOptions.deselect")
      : t("messageOptions.select"),
    class: TILE,
    command: () => {
      if (!messagesStore.isSelectMode) {
        messagesStore.startSelectMode(props.message);
      } else {
        messagesStore.toggleSelection(props.message);
      }
    },
  },
  {
    key: "danger-separator",
    separator: true,
    visible: messagesStore.canDelete,
    class: `${ROW} mx-2! my-1! border-chat-outline-variant!`,
  },
  {
    key: "delete",
    phIcon: "PhTrash",
    label: t("messageOptions.delete"),
    visible: messagesStore.canDelete,
    danger: true,
    class: `${ROW} [&>div:hover]:bg-chat-error/10! [&.p-focus>div]:bg-chat-error/10!`,
    command: () => messagesStore.triggerDelete(targetIds()),
  },
]);

const pt = {
  root: {
    class:
      "w-72! rounded-2xl! border-chat-outline-variant/60! bg-chat-background/90! p-1.5! shadow-xl! backdrop-blur-md!",
  },
  rootList: { class: "flex-row! flex-wrap! gap-0.5! p-0!" },
  itemContent: { class: "rounded-xl!" },
  // Grows out of the pointer rather than just fading in.
  transition: {
    enterFromClass: "opacity-0 scale-95",
    enterActiveClass:
      "transition duration-150 ease-out origin-top-left rtl:origin-top-right motion-reduce:transition-none",
    leaveActiveClass: "transition-opacity duration-100 ease-in motion-reduce:transition-none",
    leaveToClass: "opacity-0",
  },
};
</script>
<template>
  <ContextMenu
    ref="menu"
    :model="items"
    :pt="pt"
    class="vue-chat"
    @hide="onMenuClosed"
  >
    <template #item="{ item, props: itemProps }">
      <div
        v-if="item.meta"
        class="flex select-none items-center justify-between gap-x-3 px-2.5 pt-1 pb-0.5 text-body-sm text-chat-muted"
      >
        <span class="truncate">{{ sentOn }}</span>
        <span
          v-if="isMine && message.isSent"
          class="flex shrink-0 items-center gap-x-1"
          :class="isSeen && 'text-chat-primary'"
        >
          <BIcon :icon="isSeen ? 'PhChecks' : 'PhCheck'" class="size-4" />
          {{ isSeen ? t("meta.seen") : t("meta.sent") }}
        </span>
      </div>

      <a
        v-else-if="!item.danger"
        v-bind="itemProps.action"
        class="flex-col! gap-y-1.5! px-1! py-2.5!"
      >
        <span
          class="flex size-9 items-center justify-center rounded-full bg-chat-on-background/6"
        >
          <BIcon :icon="item.phIcon" class="size-5 text-chat-on-background" />
        </span>
        <span
          v-bind="itemProps.label"
          class="w-full truncate text-center text-label-sm text-chat-on-background"
        >
          {{ item.label }}
        </span>
      </a>

      <a v-else v-bind="itemProps.action" class="gap-x-3! px-2.5! py-2!">
        <span
          class="flex size-9 items-center justify-center rounded-full bg-chat-error/10"
        >
          <BIcon :icon="item.phIcon" class="size-5 text-chat-error" />
        </span>
        <span v-bind="itemProps.label" class="text-label-md text-chat-error">
          {{ item.label }}
        </span>
      </a>
    </template>
  </ContextMenu>
</template>
