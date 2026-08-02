<template>
  <div class="relative z-20 w-full">
    <div
      v-if="selectedChat"
      class="relative z-50 flex h-16 w-full items-center justify-between gap-x-4 border-b border-b-chat-outline-variant bg-chat-background py-4 px-5 md:h-20"
    >
      <div
        class="relative flex w-full flex-row-reverse items-center justify-end gap-x-4 md:flex-row md:justify-between"
      >
        <div
          class="flex cursor-pointer items-center gap-x-3"
          @click="openProfile"
        >
          <div class="relative h-10 w-10 shrink-0">
            <ContactAvatar v-if="contact" :contact="contact" />
          </div>
          <div class="select-none">
            <div class="text-label-md text-chat-on-background">
              {{ selectedChat.name }} {{ selectedChat.lastName }}
            </div>
            <div class="text-body-sm text-chat-on-background/50">
              {{
                t("lastSeen", {
                  time: formatRelativeDate(selectedChat.lastSeen),
                })
              }}
            </div>
          </div>
        </div>

        <div class="relative z-[1001] h-6">
          <div
            class="relative transition-all duration-200 ease-in-out"
            :class="[isSelectMode ? '-translate-y-6' : 'translate-y-0']"
          >
            <div
              class="relative flex items-center gap-x-4 transition-all duration-200 ease-in-out"
            >
              <div class="hidden md:block">
                <BIcon
                  icon="PhPhone"
                  class="h-6 w-6 cursor-pointer fill-chat-on-background/50"
                  @click="initCall"
                  v-if="selectedChat.serviceType !== 'chat'"
                />
              </div>
            </div>
            <!-- <div
              class="hidden items-center gap-x-4 md:flex"
             
            >
              <BIcon
                icon="PhTrash"
                class="h-6 w-6"
                :class="[
                  canDelete
                    ? 'cursor-pointer fill-chat-error'
                    : 'cursor-not-allowed fill-chat-on-background/50',
                ]"
                @click="deleteMessages"
              />
              <BIcon
                icon="PhCopy"
                class="h-6 w-6 cursor-pointer fill-chat-on-background"
                @click="copy"
              />
            </div> -->
          </div>
        </div>
      </div>
      <BIcon
        icon="PhArrowLeft"
        class="md:hidden h-6 w-6 cursor-pointer fill-chat-on-background/50"
        @click="goBack"
      />
    </div>

    <div class="absolute bottom-0 z-20 h-0 w-full overflow-visible">
      <div
        class="flex w-full items-center overflow-hidden whitespace-nowrap bg-diamond-primary-secondary text-wrap px-2 transition-all duration-200 ease-in-out"
        :class="[callData.show ? 'h-11' : 'h-0']"
      >
        <div
          class="flex w-full items-center gap-x-3 transition-all duration-200 ease-in-out"
          :class="[callData.show ? 'opacity-100' : 'opacity-0']"
        >
          <BIcon icon="PhPhoneCall" class="h-5 w-5 shrink-0 fill-white" />
          <div class="flex-1 select-none text-label-md text-white">
            {{ callData.duration }}
          </div>
          <BIcon
            icon="PhFrameCorners"
            class="h-5 w-5 shrink-0 cursor-pointer fill-white"
            @click="backToCall"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMessagesStore } from "~/stores/messageStores.js";
import ContactAvatar from "./contact/ContactAvatar.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { useCallStore } from "~/stores/callStore.js";
import { useChatStore } from "~/stores/chatStore.js";
import { useDate } from "~/composables/useDate.js";
import { formatDuration } from "~/utils/format";
import { chatPageBar } from "@i18n/locales";
import type { Contact } from "~/types";
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    contact: Contact | null;
    options: any[];
  }>(),
  {
    contact: null,
    options: () => [],
  },
);

const emit = defineEmits<{
  call: [];
  "open-profile": [];
}>();

const messagesStore = useMessagesStore();
const { formatRelativeDate } = useDate();
const { t } = useLocalI18n(chatPageBar);
const callStore = useCallStore();
const chatStore = useChatStore();

const currentConversationId = computed(() => chatStore.activeConversationId);
const isSelectMode = computed(() => messagesStore.isSelectMode);
const selectedChat = computed(() => props.contact);
const callData = computed(() => ({
  show: callStore.isActive,
  duration: formatDuration(callStore.elapsedTime),
}));

const openProfile = () => {
  emit("open-profile");
};

const goBack = () => {
  chatStore.setSelectedChat(null);
};

const initCall = () => {
  if (currentConversationId.value) {
    callStore.startCall(currentConversationId.value);
  }
};

const backToCall = () => {
  callStore.maximize();
};
</script>
