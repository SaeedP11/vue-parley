<template>
  <div v-if="contact" class="relative w-full h-full overflow-hidden">
    <FloatingDateHeader
      :label="floatingHeader"
      :opacity="scroll.headerOpacity.value"
      :offset="hasCall"
    />

    <!-- Flipped Scroll Container -->
    <div
      dir="rtl"
      id="list"
      ref="scrollContainer"
      class="h-full w-full max-w-dvw overflow-x-hidden overflow-y-auto pb-4 hide-scrollbar flip-vertical bg-chat-surface/30"
      :class="[
        !scroll.showOptionsBar.value ? 'pt-16' : 'pt-4',
        lockScroll ? 'overflow-hidden' : '',
      ]"
      @scroll="scroll.handleScroll"
      @wheel.prevent="scroll.handleWheel"
    >
      <div
        class="w-full max-w-dvw overflow-x-hidden"
        v-show="msgList.messages.value.length"
      >
        <div
          :style="{
            height: scroll.virtualizer.value.getTotalSize() + 'px',
            width: '100%',
            position: 'relative',
          }"
        >
          <div
            v-for="{ row, message } in virtualRows"
            :key="message.id"
            :data-index="row.index"
            :ref="
              (el) => el && scroll.virtualizer.value.measureElement(el as any)
            "
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${row.start}px)`,
            }"
          >
            <div
              class="flip-vertical pt-0"
              :class="[row.index === 0 ? 'pb-2' : '', enterAnimation(message)]"
            >
              <ChatBubble
                :is-deleting="msgList.deletingIds.value.has(message.id)"
                :is-first-unread="message.id === msgList.firstUnreadId.value"
                :message="message"
                :contact="contact"
              />
            </div>
          </div>
        </div>

        <div
          v-show="msgList.isLoading.value"
          class="w-full flex h-16 justify-center items-center shrink-0 overflow-hidden transition-all duration-300 flip-vertical py-4"
        >
          <LottieAnimation
            :animation-data="loading"
            :height="52"
            :width="52"
            :loop="true"
            :auto-play="true"
          />
        </div>
      </div>

      <!-- Empty States -->
      <div
        v-show="msgList.messages.value.length === 0 && !msgList.isLoading.value"
        class="h-full flex items-center justify-center text-chat-on-background/50 text-body-md flip-vertical"
      >
        <NoDataDisplay :title="t('noMessages')" :image-path="NoMessages" />
      </div>

      <div
        v-show="msgList.messages.value.length === 0 && msgList.isLoading.value"
        class="w-full flex h-full flip-vertical items-center justify-center"
      >
        <LottieAnimation
          :animation-data="loading"
          :height="52"
          :width="52"
          :loop="true"
          :auto-play="true"
        />
      </div>

      <div
        class="transition-all duration-200 ease-in-out pointer-events-none"
        :class="[scroll.canScroll.value ? 'h-16' : 'h-0']"
      ></div>
    </div>

    <!-- Bottom UI (Options & Scroll to Bottom) -->
    <div
      class="absolute pointer-events-none bottom-0 right-0 w-full transition-all duration-300 ease-in-out"
      @click.self.stop
    >
      <div class="flex flex-col pointer-events-none" @click.self.stop>
        <ScrollToBottomButton
          :visible="scroll.canScroll.value"
          :unseen="newWhileScrolledUp"
          @click="scroll.resetScroll()"
        />
        <ConversationOptionsBar
          :options="options"
          :visible="!scroll.showOptionsBar.value"
          @select="handleOption"
        />
      </div>
    </div>
  </div>

  <BModal ref="modal" :loading="modalBusy" @action="handleModalConfirm" />
</template>

<script setup lang="ts">
import { Vue3Lottie as LottieAnimation } from "vue3-lottie";
import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { chat, chatMessages } from "@i18n/locales";
import { useAppToast } from "~/composables/useAppToast";
import ChatBubble from "./ChatBubble.vue";
import FloatingDateHeader from "./messages/FloatingDateHeader.vue";
import ScrollToBottomButton from "./messages/ScrollToBottomButton.vue";
import ConversationOptionsBar from "./messages/ConversationOptionsBar.vue";
import type { Contact, ExtendedMessage } from "~/types";
import loading from "~/assets/lottie/loading.json";
import NoDataDisplay from "../general/NoDataDisplay.vue";
import NoMessages from "~/assets/lib-images/chat/no-messages.webp";
import type { Modal } from "~/types/components/modal";
import type { MenuOption } from "~/types/components/menu-options";
import { useMessagesStore } from "~/stores/messageStores";
import { useChatStore } from "~/stores/chatStore";
import { useCallStore } from "~/stores/callStore";
import { useDate } from "~/composables/useDate";
import { useChatMessageList } from "~/composables/useChatMessageList.js";
import { useFlippedVirtualScroll } from "~/composables/useFlippedVirtualScroll.js";
import { useProfileStore } from "~/stores/profileStore.js";

const props = withDefaults(
  defineProps<{ contact: Contact | null; options: MenuOption[] }>(),
  { contact: null, options: () => [] },
);

const modal = ref<Modal | null>(null);
const chatStore = useChatStore();
const callStore = useCallStore();
const messagesStore = useMessagesStore();
const { t } = useLocalI18n(chatMessages);
const { t: tChat } = useLocalI18n(chat);
const { openToast } = useAppToast();
const { formatDateShort } = useDate();
const profileStore = useProfileStore();
const currentUserId = computed(() => profileStore.userId);

const chatId = computed(() => chatStore.activeConversationId);
const hasCall = computed(() => callStore.isActive);
const lockScroll = computed(() => messagesStore.isOptionMenuOpen);
const scrollContainer = ref<HTMLElement | null>(null);
const selectedToDelete = ref<string[]>([]);

// --- Initialize Composables ---

// 1. Message List State
const msgList = useChatMessageList(chatId);

// 2. Scroll Mechanics (Depends on msgList for loadMore and count updates)
const scroll = useFlippedVirtualScroll({
  scrollContainer,
  hasCall,
  isLoading: msgList.isLoading,
  chosenRole: computed(() => chatStore.chosenRole),
  isLocked: lockScroll,
  onLoadMore: msgList.loadNextPage,
});

// Each rendered row paired with its message, so the template looks it up once.
const virtualRows = computed(() =>
  scroll.virtualizer.value
    .getVirtualItems()
    .map((row) => ({ row, message: msgList.reversedMessages.value[row.index]! }))
    .filter(({ message }) => !!message),
);

const enterAnimation = (message: ExtendedMessage) => {
  if (!msgList.animatingIds.value.has(message.id)) return "";
  if (message.request) return "animate-request-in";
  return message.senderId === currentUserId.value
    ? "animate-slide-right"
    : "animate-slide-left";
};

// Keep Virtualizer count in sync with messages
watch(
  () => msgList.reversedMessages.value.length,
  (len) => {
    scroll.setItemCount(len);
    scroll.setGetItemKey(
      (index: number) => msgList.reversedMessages.value[index]?.id ?? index,
    );
  },
  { immediate: true },
);

// Messages from the other side that arrived while the user was reading history, shown on the
// scroll-to-bottom button. Keyed off the newest message so older pages loading in don't count.
const newWhileScrolledUp = ref(0);
watch(
  () => msgList.messages.value.at(-1),
  (last, prev) => {
    if (!last || !prev || last.id === prev.id) return;
    if (last.conversationId !== prev.conversationId) return;
    if (scroll.canScroll.value && last.senderId !== currentUserId.value)
      newWhileScrolledUp.value++;
  },
);
watch(scroll.canScroll, (away) => {
  if (!away) newWhileScrolledUp.value = 0;
});
watch(chatId, () => (newWhileScrolledUp.value = 0));

// --- Event Bus Wiring ---
msgList.subscribeToBus({
  onSend: (hasMyMessage) => {
    if (hasMyMessage) nextTick(() => scroll.resetScroll());
  },
  onDelete: (ids) => handleDeleteMessages(ids),
});

// --- Modal / Delete Actions (UI specific logic stays in component) ---
// The modal is shared, and a cancelled delete leaves `selectedToDelete` behind.
const modalAction = ref<"delete" | "end-chat" | null>(null);
const modalBusy = ref(false);

const handleOption = (key: string) => {
  if (key !== "end-chat" || !chatId.value) return;
  modalAction.value = "end-chat";
  modal.value?.openModal(
    t("endChat.title"),
    t("endChat.message"),
    "error",
    true,
    t("endChat.confirm"),
  );
};

const handleDeleteMessages = (idsToDelete: string[]) => {
  modalAction.value = "delete";
  selectedToDelete.value = idsToDelete;
  const isRequestDeletion =
    idsToDelete.length === 1 &&
    msgList.messages.value.find((m) => m.id === idsToDelete[0])?.request;

  modal.value?.openModal(
    isRequestDeletion ? t("delete.requestTitle") : t("delete.title"),
    isRequestDeletion
      ? t("delete.request")
      : idsToDelete.length === 1
        ? t("delete.singleMessage")
        : t("delete.multipleMessages", { count: idsToDelete.length }),
    "error",
    true,
    t("delete.confirm"),
  );
};

const handleModalConfirm = () => {
  const action = modalAction.value;
  modalAction.value = null;

  if (action === "end-chat" && chatId.value) {
    // Stay open with the button spinning until the server answers; the host reports failures.
    if (modalBusy.value) return;
    modalBusy.value = true;
    chatStore
      .endConversation(chatId.value)
      .catch(() => {})
      .finally(() => {
        modalBusy.value = false;
        modal.value?.closeModal();
      });
    return;
  }

  if (action === "delete" && selectedToDelete.value.length > 0) {
    modal.value?.closeModal();
    const ids = [...selectedToDelete.value];
    const conversationId = chatId.value;
    const snapshot = msgList.messages.value.filter((m) => ids.includes(m.id));

    // Removal is optimistic; if the server refuses, wait for the animation to finish removing
    // them and then put them back, so the thread never shows messages that still exist as gone.
    const removed = new Promise<void>((resolve) =>
      msgList.executeDelete(ids, () => {
        selectedToDelete.value = [];
        resolve();
      }),
    );
    messagesStore.confirmDelete(ids).catch(async () => {
      await removed;
      if (conversationId) messagesStore.restoreMessages(conversationId, snapshot);
      openToast(tChat("chat.deleteFailed"), "error");
    });
  }
};

// --- Floating Header Text ---
const floatingHeader = computed(() => {
  const msg =
    msgList.reversedMessages.value[scroll.topVisibleMessageIndex.value];
  if (!msg) return null;
  if (msg.id === msgList.firstUnreadId.value) return t("unreadMessages");
  return formatDateShort(msg.date);
});

// --- Lifecycle ---
onMounted(() => {
  if (chatId.value) {
    messagesStore.markAsRead(chatId.value);
    msgList.fetchMessages(1);
  }
});

onBeforeUnmount(() => {
  scroll.cleanup();
});

watch(
  () => chatId.value,
  (newId, oldId) => {
    if (newId && newId !== oldId) {
      messagesStore.markAsRead(newId);
      if (scrollContainer.value) scrollContainer.value.scrollTop = 0;
      msgList.fetchMessages(1);
    }
  },
);
</script>

<style scoped>
/* Styles remain exactly the same */
.flip-vertical {
  transform: scaleY(-1);
  will-change: transform;
}
[data-index] {
  will-change: transform;
  backface-visibility: hidden;
}
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

@keyframes slide-in-right {
  0% {
    opacity: 0;
    transform: scaleY(-1) translateX(30px);
  }
  100% {
    opacity: 1;
    transform: scaleY(-1) translateX(0);
  }
}
@keyframes slide-in-left {
  0% {
    opacity: 0;
    transform: scaleY(-1) translateX(-30px);
  }
  100% {
    opacity: 1;
    transform: scaleY(-1) translateX(0);
  }
}
.animate-slide-right {
  animation: slide-in-right 300ms ease-out forwards;
  will-change: transform, opacity;
}
.animate-slide-left {
  animation: slide-in-left 300ms ease-out forwards;
  will-change: transform, opacity;
}
#list {
  will-change: padding-top;
}

.animate-request-in {
  animation: request-in 0.4s ease-out forwards;
  overflow: hidden;
  transform: scaleY(-1);
}
@keyframes request-in {
  0% {
    opacity: 0;
    max-height: 0;
    transform: scaleY(-1) translateY(10px);
  }
  100% {
    opacity: 1;
    max-height: 1000px;
    transform: scaleY(-1) translateY(0);
  }
}
</style>
