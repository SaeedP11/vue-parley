<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from "vue";
import type { Contact, ExtendedMessage, Message } from "~/types";
import ImageGroupDisplay from "./chat-bubbles/ImageGroupDisplay.vue";
import BubbleOptions from "./chat-bubbles/BubbleOptions.vue";
import VoiceDisplay from "./chat-bubbles/VoiceDisplay.vue";
import BubbleVideo from "./chat-bubbles/BubbleVideo.vue";
import FileDisplay from "./chat-bubbles/FileDisplay.vue";
import SafeEmojiText from "../general/SafeEmojiText.vue";
import ContactAvatar from "./contact/ContactAvatar.vue";
import BubbleDivider from "./chat-bubbles/BubbleDivider.vue";
import BubbleImages from "./chat-bubbles/BubbleImages.vue";
import BubbleSelectionMark from "./chat-bubbles/BubbleSelectionMark.vue";
import BubbleRequest from "./chat-bubbles/BubbleRequest.vue";
import BubbleStatus from "./chat-bubbles/BubbleStatus.vue";
import BubbleMeta from "./chat-bubbles/BubbleMeta.vue";
import ReplyPreview from "./chat-bubbles/ReplyPreview.vue";

import { useMessagesStore } from "~/stores/messageStores.js";
import { useLongPress } from "~/composables/useLongPress";
import useLocalI18n from "~/composables/useLocalI18n";
import { useDate } from "~/composables/useDate.js";
import { chatBubble } from "@i18n/locales";
import { useProfileStore } from "~/stores/profileStore.js";

const props = withDefaults(
  defineProps<{
    message: ExtendedMessage;
    contact: Contact;
    isFirstUnread?: boolean;
    isDeleting?: boolean;
  }>(),
  {
    isFirstUnread: false,
    isDeleting: false,
  },
);

const { t } = useLocalI18n(chatBubble);
const messagesStore = useMessagesStore();
const { formatDateShort } = useDate();

type ImageDisplayInstance = InstanceType<typeof ImageGroupDisplay>;
type BubbleOptionsInstance = InstanceType<typeof BubbleOptions>;

const imageDisplayRef = useTemplateRef<ImageDisplayInstance>("imageDisplay");
const bubbleOptionsRef =
  useTemplateRef<BubbleOptionsInstance>("bubbleOptions");

const profileStore = useProfileStore();
const currentUserId = computed(() => profileStore.userId);

const isMine = computed(() => props.message.senderId === currentUserId.value);
const isSelected = computed(() =>
  messagesStore.selectedMessages.has(props.message.id),
);
const isSelectMode = computed(() => messagesStore.isSelectMode);

const messageType = computed(() => {
  if (props.message.voiceUrl?.trim()) return "voice";
  if (props.message.imageUrl && props.message.imageUrl.length > 1)
    return "multiImage";
  if (props.message.imageUrl?.length === 1 && props.message.imageUrl[0]?.trim())
    return "image";
  if (props.message.videoUrl?.trim()) return "video";
  if (props.message.fileUrl?.trim()) return "file";
  return "text";
});

const isTextBased = computed(() =>
  ["text", "file", "voice"].includes(messageType.value),
);

// Consecutive messages from one sender on one day form a group: they sit close together, share
// one avatar (on the last) and round off into each other on the sender's side.
const sameGroup = (a?: Message | null, b?: Message | null) =>
  !!a &&
  !!b &&
  !a.request &&
  !b.request &&
  a.senderId === b.senderId &&
  new Date(a.date).toDateString() === new Date(b.date).toDateString();

// The unread divider splits a group, like the date divider does.
const groupedWithPrev = computed(
  () =>
    !props.isFirstUnread && sameGroup(props.message.prevMessage, props.message),
);
const groupedWithNext = computed(() =>
  sameGroup(props.message, props.message.nextMessage),
);

// Logical corners, so the sender's side is right whichever way the host lays the chat out: your
// messages sit at the start, theirs at the end. The last bubble of a group keeps a tail.
const roundingClasses = computed(() => {
  const prev = groupedWithPrev.value;
  const next = groupedWithNext.value;
  if (isMine.value)
    return [prev && "rounded-ss-md", next ? "rounded-es-md" : "rounded-es-xs"];
  return [prev && "rounded-se-md", next ? "rounded-ee-md" : "rounded-ee-xs"];
});

const uploadData = computed(() =>
  messagesStore.uploadProgress.get(props.message.id),
);

// --- Actions ---
const viewerMounted = ref(false);
const previewImage = async (index: number) => {
  if (!viewerMounted.value) {
    viewerMounted.value = true;
    await nextTick();
  }
  imageDisplayRef.value?.open(index);
};

const optionsMounted = ref(false);

const handleRightClick = async (event: MouseEvent | PointerEvent) => {
  if (props.message.request || !props.message.isSent) return;
  if (!messagesStore.isSelectMode) {
    messagesStore.selectedMessages.clear();
    messagesStore.toggleSelection(props.message);
  }
  if (!optionsMounted.value) {
    optionsMounted.value = true;
    await nextTick();
  }
  bubbleOptionsRef.value?.openMenu(event);
};

const handleLeftClick = () => {
  if (messagesStore.isSelectMode) messagesStore.toggleSelection(props.message);
};

// Replaces 40 lines of pointer event logic
const longPress = useLongPress(handleRightClick);
</script>

<template>
  <div
    data-testid="chat-bubble"
    :data-message-id="message.id"
    @contextmenu.prevent="handleRightClick"
    class="vue-chat w-full transition-all duration-300 ease-in-out"
    :class="{
      'max-h-0 opacity-0 overflow-hidden': isDeleting,
      'max-h-250 opacity-100': !isDeleting,
    }"
  >
    <BubbleDivider
      v-if="message.isFirstInDate || isFirstUnread"
      :label="
        isFirstUnread ? t('unreadMessages') : formatDateShort(message.date)
      "
    />

    <!-- Message Row -->
    <div
      class="w-full px-5 transition-all duration-200 flex items-center ease-in-out"
      :class="{
        'pt-0.5': groupedWithPrev,
        'pt-3': !groupedWithPrev,
        'bg-on-surface/5 gap-x-3': isSelectMode && isSelected,
        'bg-on-surface/0 gap-x-0': !(isSelectMode && isSelected),
        'cursor-pointer select-none': isSelectMode,
      }"
    >
      <BubbleSelectionMark
        v-if="!message.request"
        :selected="isSelectMode && isSelected"
      />

      <!-- Request Card Fallback -->
      <div v-if="message.request" class="py-3 w-full flex justify-center">
        <BubbleRequest :message="message" :contact="contact" />
      </div>

      <!-- Standard Message Bubble -->
      <div
        v-else
        class="flex items-center flex-1 min-w-0 relative"
        :class="{ 'justify-start': isMine, 'justify-end': !isMine }"
        @click="handleLeftClick"
        v-on="longPress"
      >
        <div class="select-none md:select-auto w-full">
          <div
            class="w-full flex items-center"
            :class="{ 'justify-start': isMine, 'justify-end': !isMine }"
          >
            <div class="flex max-w-4/5 items-end gap-x-2">
              <div class="flex-1 min-w-0">
                <!-- Text / File / Voice Bubble Wrapper -->
                <div
                  v-if="isTextBased"
                  class="relative rounded-2xl p-1 shadow-xs"
                  :class="[
                    roundingClasses,
                    isMine ? 'bg-chat-bubble-mine' : 'bg-chat-bubble',
                    { 'text-chat-base text-chat-on-background': messageType === 'text' },
                  ]"
                >
                  <ReplyPreview
                    v-if="messageType === 'text' && message.repliedTo"
                    :message="message"
                    :contact="contact"
                    :is-mine="isMine"
                    :current-user-id="currentUserId"
                  />
                  <p
                    v-if="messageType === 'text'"
                    class="max-w-full wrap-break-word px-2.5 py-1.5"
                  >
                    <SafeEmojiText :text="message.text" />
                    <!-- Holds the last line clear of the time, which sits over the bubble's end corner. -->
                    <span
                      aria-hidden="true"
                      class="inline-block h-3"
                      :class="isMine ? 'w-14' : 'w-10'"
                    />
                  </p>
                  <BubbleMeta
                    v-if="messageType === 'text'"
                    :message="message"
                    :is-mine="isMine"
                    class="absolute end-3 bottom-2"
                  />
                  <FileDisplay
                    v-else-if="messageType === 'file'"
                    :is-mine="isMine"
                    :url="message.fileUrl ?? ''"
                    :file-name="message.fileName"
                    :message-id="message.id"
                    :is-sent="message.isSent"
                  />
                  <VoiceDisplay
                    v-else-if="messageType === 'voice'"
                    :url="message.voiceUrl ?? ''"
                    :message-id="message.id"
                    :is-sent="message.isSent"
                  />
                  <div v-if="messageType !== 'text'" class="flex justify-end px-2 pb-1">
                    <BubbleMeta :message="message" :is-mine="isMine" />
                  </div>
                </div>

                <!-- Photos and video carry the time as a pill over their end corner. -->
                <div v-else class="relative">
                  <BubbleImages
                    v-if="messageType === 'image' || messageType === 'multiImage'"
                    :images="message.imageUrl!"
                    :is-sent="message.isSent"
                    :upload="uploadData"
                    @preview="previewImage"
                  />
                  <BubbleVideo
                    v-else-if="messageType === 'video'"
                    :video-url="message.videoUrl"
                    mode="playback"
                  />
                  <BubbleMeta
                    :message="message"
                    :is-mine="isMine"
                    overlay
                    class="absolute end-2 bottom-2 z-20"
                  />
                </div>

                <BubbleStatus v-if="isMine && message.isFailed" :message="message" />
              </div>

              <!-- Avatar, once per group, level with its last bubble. -->
              <div v-if="!isMine" class="size-8 shrink-0">
                <ContactAvatar
                  v-if="!groupedWithNext"
                  :contact="contact"
                  :show-online="false"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Overlays, each mounted on first open: otherwise every bubble keeps idle copies. -->
        <ImageGroupDisplay
          v-if="viewerMounted && message.imageUrl && message.imageUrl.length > 0"
          ref="imageDisplay"
          :images="message.imageUrl"
        />
        <BubbleOptions
          v-if="optionsMounted"
          :message="message"
          ref="bubbleOptions"
        />
      </div>
    </div>
  </div>
</template>
