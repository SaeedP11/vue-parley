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
import Skeleton from "primevue/skeleton";
import type { MenuItem } from "primevue/menuitem";
import { useMessagesStore } from "~/stores/messageStores";
import type { ExtendedMessage, MessageReader } from "~/types";
import ContactAvatar from "~/components/chat/contact/ContactAvatar.vue";
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

// --- Who has read it ("Seen by"), on the viewer's own sent messages when the host can say ---
const readers = ref<MessageReader[]>([]);
const loadingReaders = ref(false);
let readersRequest = 0;

const canShowReaders = computed(
  () =>
    props.isMine &&
    props.message.isSent &&
    !props.message.id.startsWith("tmp-") &&
    messagesStore.canListReaders(),
);

// Asked afresh on every open: someone may have read it since the menu was last shown.
const loadReaders = async () => {
  if (!canShowReaders.value) return;
  const request = ++readersRequest;
  loadingReaders.value = true;
  try {
    const found = await messagesStore.fetchReaders(props.message);
    if (request === readersRequest) readers.value = found;
  } catch (error) {
    console.error("[chat] failed to load who read the message", error);
    if (request === readersRequest) readers.value = [];
  } finally {
    if (request === readersRequest) loadingReaders.value = false;
  }
};

const readerName = (reader: MessageReader) => `${reader.name} ${reader.lastName ?? ""}`.trim();
const readerAvatar = (reader: MessageReader) => ({
  name: reader.name,
  lastName: reader.lastName ?? "",
  imageUrl: reader.imageUrl ?? "",
});

/** Opens at the pointer: a right click, or where a long press began. */
const openMenu = (event: MouseEvent | PointerEvent) => {
  messagesStore.isOptionMenuOpen = true;
  void loadReaders();
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

const onDay = (value: Date | string) => {
  const date = new Date(value);
  const day =
    date.toDateString() === new Date().toDateString()
      ? t("meta.today")
      : formatDateShort(date);
  return t("meta.sentOn", { day, time: formatTime(date) });
};

const sentOn = computed(() => onDay(props.message.date));

const isSeen = computed(() => props.message.isSent && props.message.isRead);

// Tiles share the first row; anything else takes a full row. `class` lands on the item's <li>.
const TILE = "flex-1 min-w-0";
const ROW = "basis-full";

const items = computed<MenuItem[]>(() => [
  { key: "meta", meta: true, disabled: true, class: `${ROW} opacity-100!` },
  {
    // One reader is shown in place; several open a list of who and when.
    key: "readers",
    readers: true,
    visible: canShowReaders.value && (loadingReaders.value || readers.value.length > 0),
    disabled: loadingReaders.value || readers.value.length < 2,
    class: `${ROW} opacity-100!`,
    items:
      !loadingReaders.value && readers.value.length > 1
        ? readers.value.map((reader) => ({
            key: `reader-${reader.id}`,
            reader,
            disabled: true,
            class: "opacity-100!",
          }))
        : undefined,
  },
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
  // The readers list: a card like the menu itself, scrolling past a handful of people.
  submenu: {
    class:
      "min-w-64! max-h-72! overflow-y-auto! rounded-2xl! border! border-chat-outline-variant/60! bg-chat-background/95! p-1.5! shadow-xl! backdrop-blur-md!",
  },
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
        v-else-if="item.readers"
        v-bind="itemProps.action"
        data-testid="message-readers"
        class="gap-x-2.5! px-2.5! py-2!"
      >
        <template v-if="loadingReaders">
          <Skeleton shape="circle" size="1.75rem" class="shrink-0" />
          <Skeleton width="8rem" height="0.75rem" />
        </template>

        <template v-else-if="readers.length === 1">
          <span class="size-7 shrink-0">
            <ContactAvatar :contact="readerAvatar(readers[0]!)" :show-online="false" />
          </span>
          <span class="min-w-0 flex-1 truncate text-label-md text-chat-on-background">
            {{ readerName(readers[0]!) }}
          </span>
          <span v-if="readers[0]!.readAt" class="shrink-0 text-body-sm text-chat-muted">
            {{ onDay(readers[0]!.readAt) }}
          </span>
        </template>

        <template v-else>
          <span class="flex shrink-0 -space-x-2 rtl:space-x-reverse">
            <span
              v-for="reader in readers.slice(0, 3)"
              :key="reader.id"
              class="size-7 rounded-full ring-2 ring-chat-background"
            >
              <ContactAvatar :contact="readerAvatar(reader)" :show-online="false" />
            </span>
          </span>
          <span class="min-w-0 flex-1 truncate text-label-md text-chat-on-background">
            {{ t("readers.seenBy", { count: readers.length }) }}
          </span>
          <BIcon icon="PhCaretRight" class="size-4 shrink-0 text-chat-muted rtl:rotate-180" />
        </template>
      </a>

      <div
        v-else-if="item.reader"
        data-testid="message-reader"
        class="flex select-none items-center gap-x-2.5 px-2 py-1.5"
      >
        <span class="size-8 shrink-0">
          <ContactAvatar :contact="readerAvatar(item.reader)" :show-online="false" />
        </span>
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-label-md text-chat-on-background">
            {{ readerName(item.reader) }}
          </span>
          <span v-if="item.reader.readAt" class="text-body-sm text-chat-muted">
            {{ onDay(item.reader.readAt) }}
          </span>
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
