<template>
  <div v-if="contact" class="relative w-full h-full overflow-hidden">
    <!-- Floating Header -->
    <div
      :class="[hasCall ? 'top-12' : 'top-4']"
      class="absolute left-0 right-0 z-20 flex justify-center pointer-events-none transition-opacity duration-200"
      :style="{ opacity: scroll.headerOpacity.value }"
    >
      <div
        v-if="floatingHeader"
        class="rounded-full bg-chat-on-background/10 flex items-center justify-center px-4 py-0.5"
      >
        <div class="text-chat-on-background select-none text-label-sm">
          {{ floatingHeader }}
        </div>
      </div>
    </div>

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
            v-for="virtualRow in scroll.virtualizer.value.getVirtualItems()"
            :key="msgList.reversedMessages.value[virtualRow.index].id"
            :data-index="virtualRow.index"
            :ref="
              (el) => el && scroll.virtualizer.value.measureElement(el as any)
            "
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }"
          >
            <div
              class="flip-vertical pt-0"
              :class="[
                virtualRow.index === 0 ? 'pb-2' : '',
                msgList.animatingIds.value.has(
                  msgList.reversedMessages.value[virtualRow.index].id,
                )
                  ? msgList.reversedMessages.value[virtualRow.index]?.request
                    ? 'animate-request-in'
                    : msgList.reversedMessages.value[virtualRow.index]
                          .senderId === currentUserId
                      ? 'animate-slide-right'
                      : 'animate-slide-left'
                  : '',
              ]"
            >
              <ChatBubble
                :is-deleting="
                  msgList.deletingIds.value.has(
                    msgList.reversedMessages.value[virtualRow.index].id,
                  )
                "
                :is-first-unread="
                  msgList.reversedMessages.value[virtualRow.index].id ===
                  msgList.firstUnreadId.value
                "
                :message="msgList.reversedMessages.value[virtualRow.index]"
                :is-self="
                  msgList.reversedMessages.value[virtualRow.index].senderId ===
                  currentUserId
                "
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
        <div class="pr-3 pb-1 w-11">
          <div
            @click="scroll.resetScroll()"
            :class="[
              scroll.canScroll.value
                ? 'scale-100 pointer-events-auto opacity-100'
                : 'opacity-0 pointer-events-none scale-0',
            ]"
            class="w-11 origin-bottom transition-all duration-200 ease-in-out h-11 rounded-full overflow-hidden bg-chat-background shadow-floating flex items-center justify-center cursor-pointer"
          >
            <BIcon icon="PhArrowDown" class="fill-chat-on-background w-6 h-6" />
          </div>
        </div>

        <div
          class="grid transition-all pointer-events-none duration-200 ease-in-out"
          :class="[
            !scroll.showOptionsBar.value
              ? 'grid-rows-[1fr] opacity-100'
              : 'grid-rows-[0fr] opacity-0',
          ]"
        >
          <div class="min-h-0">
            <div
              :class="[
                !scroll.showOptionsBar.value
                  ? 'translate-y-0 opacity-100 pointer-events-none'
                  : '-translate-y-2 opacity-0 pointer-events-none',
              ]"
              class="transition-all duration-200 w-full lg:max-w-full max-w-dvw p-2 flex items-center gap-x-3 overflow-x-auto lg:overflow-visible hide-scrollbar whitespace-nowrap"
            >
              <div
                v-for="option in options"
                :key="option.key"
                class="px-2.5 pointer-events-auto flex items-center gap-x-2 cursor-pointer bg-chat-surface-3 rounded-lg h-9 shrink-0"
              >
                <BIcon
                  :icon="option.icon"
                  class="w-5 h-5 fill-chat-on-background/50"
                />
                <div
                  class="text-body-sm select-none text-chat-on-background/70"
                >
                  {{ option.label }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <BModal ref="modal" @action="handleModalConfirm" />
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { chatMessages } from "@i18n/locales";
import ChatBubble from "./ChatBubble.vue";
import type { Contact } from "~/types";
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

// --- Event Bus Wiring ---
msgList.subscribeToBus({
  onSend: (hasMyMessage) => {
    if (hasMyMessage) nextTick(() => scroll.resetScroll());
  },
  onDelete: (ids) => handleDeleteMessages(ids),
});

// --- Modal / Delete Actions (UI specific logic stays in component) ---
const handleDeleteMessages = (idsToDelete: string[]) => {
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
  if (selectedToDelete.value.length > 0) {
    modal.value?.closeModal();
    msgList.executeDelete(selectedToDelete.value, () => {
      selectedToDelete.value = [];
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
      messagesStore.markAsRead(chatId.value);
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
