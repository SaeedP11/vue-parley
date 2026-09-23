<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from "vue";
import type { Contact, ExtendedMessage } from "~/types";
import ImageGroupDisplay from "./chat-bubbles/ImageGroupDisplay.vue";
import BubbleOptions from "./chat-bubbles/BubbleOptions.vue";
import VoiceDisplay from "./chat-bubbles/VoiceDisplay.vue";
import BubbleVideo from "./chat-bubbles/BubbleVideo.vue";
import FileDisplay from "./chat-bubbles/FileDisplay.vue";
import SafeEmojiText from "../general/SafeEmojiText.vue";
import ContactAvatar from "./contact/ContactAvatar.vue";

import { useMessagesStore } from "~/stores/messageStores.js";
import { useLongPress } from "~/composables/useLongPress";
import useLocalI18n from "~/composables/useLocalI18n";
import { useChatStore } from "~/stores/chatStore.js";
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
const chatStore = useChatStore();
const messagesStore = useMessagesStore();
const { formatDateShort, formatTime } = useDate();

type ImageDisplayInstance = InstanceType<typeof ImageGroupDisplay>;
type BubbleOptionsInstance = InstanceType<typeof BubbleOptions>;

const imageDisplayRef = useTemplateRef<ImageDisplayInstance>("imageDisplayRef");
const bubbleOptionsRef =
  useTemplateRef<BubbleOptionsInstance>("bubbleOptionsRef");

const MAX_VISIBLE_IMAGES = 3;

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

const isSameDayNext = computed(() => {
  if (!props.message.nextMessage) return false;
  return (
    new Date(props.message.date).toDateString() ===
    new Date(props.message.nextMessage.date).toDateString()
  );
});

const roundingClasses = computed(() => {
  const isPrevSameSender =
    props.message.prevMessage?.senderId === props.message.senderId;
  if (isMine.value)
    return isPrevSameSender ? "rounded-r-none" : "rounded-br-none";
  return isPrevSameSender ? "rounded-l-none" : "rounded-bl-none";
});

const shouldShowStatus = computed(() => {
  const nextMsg = props.message.nextMessage;
  if (!nextMsg) return true;
  const isNextSameSender = nextMsg.senderId === props.message.senderId;
  if (!isNextSameSender || !isSameDayNext.value) return true;
  const currentTime = new Date(props.message.date).getTime();
  const nextTime = new Date(nextMsg.date).getTime();
  return nextTime - currentTime > 2 * 60 * 1000; // 2 minutes
});

const isSameSenderNext = computed(
  () => props.message.nextMessage?.senderId === props.message.senderId,
);

const displayedImages = computed(
  () => props.message.imageUrl?.slice(0, MAX_VISIBLE_IMAGES) || [],
);

const checkIcon = computed(() => {
  if (props.message.isFailed) return "PhWarningCircle";
  if (props.message.isSent)
    return props.message.isRead ? "PhChecks" : "PhCheck";
  return "PhClock";
});

const uploadData = computed(() =>
  messagesStore.uploadProgress.get(props.message.id),
);

// --- Actions ---
const previewImage = (index: number) => imageDisplayRef.value?.open(index);

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
  bubbleOptionsRef.value?.openMenu(
    (event as MouseEvent).clientX,
    (event as MouseEvent).clientY,
  );
};

const handleLeftClick = () => {
  if (messagesStore.isSelectMode) messagesStore.toggleSelection(props.message);
};

// Replaces 40 lines of pointer event logic
const longPress = useLongPress(handleRightClick);
</script>

<template>
  <div
    @contextmenu.prevent="handleRightClick"
    class="w-full transition-all duration-300 ease-in-out"
    :class="{
      'max-h-0 opacity-0 overflow-hidden': isDeleting,
      'max-h-250 opacity-100': !isDeleting,
    }"
  >
    <!-- Date / Unread Divider -->
    <div
      v-if="message.isFirstInDate || isFirstUnread"
      class="py-5 w-full flex items-center justify-center"
    >
      <div
        class="rounded-full bg-on-surface/10 flex items-center justify-center px-4 py-0.5"
      >
        <div class="text-on-surface select-none text-body-sm">
          {{
            !isFirstUnread
              ? formatDateShort(message.date)
              : t("unreadMessages")
          }}
        </div>
      </div>
    </div>

    <!-- Message Row -->
    <div
      class="w-full px-5 pt-2 transition-all duration-200 flex items-center ease-in-out"
      :class="{
        'bg-on-surface/5 gap-x-3': isSelectMode && isSelected,
        'bg-on-surface/0 gap-x-0': !(isSelectMode && isSelected),
        'cursor-pointer select-none': isSelectMode,
      }"
    >
      <!-- Selection Checkbox -->
      <div
        v-if="!message.request"
        class="shrink-0 transition-all duration-200 overflow-hidden ease-in-out whitespace-nowrap"
        :class="{
          'w-auto': isSelectMode && isSelected,
          'w-0': !(isSelectMode && isSelected),
        }"
      >
        <div
          class="transition-all duration-200 ease-in-out w-5 h-5 rounded-full bg-gradient-primary-secondary flex items-center justify-center"
          :class="{
            'opacity-100 scale-100': isSelectMode && isSelected,
            'opacity-0 scale-0': !(isSelectMode && isSelected),
          }"
        >
          <div class="w-2.5 h-2.5 rounded-full bg-surface"></div>
        </div>
      </div>

      <!-- Request Card Fallback -->
      <div v-if="message.request" class="py-3 w-full flex justify-center">
        <RequestCard :message="message" :contact="contact" />
      </div>

      <!-- Standard Message Bubble -->
      <div
        v-else
        class="flex items-center flex-1 relative"
        :class="{ 'justify-start': isMine, 'justify-end': !isMine }"
        @click="handleLeftClick"
        v-on="longPress"
      >
        <div class="select-none md:select-auto w-full">
          <div
            class="w-full flex items-center"
            :class="{ 'justify-start': isMine, 'justify-end': !isMine }"
          >
            <div class="flex max-w-4/5 items-end gap-x-3">
              <div class="flex-1">
                <!-- Text / File / Voice Bubble Wrapper -->
                <div
                  v-if="isTextBased"
                  class="p-1 rounded-xl"
                  :class="[
                    roundingClasses,
                    isMine ? 'bg-surface-variant-2' : 'bg-surface',
                    { 'text-body-sm text-on-surface': messageType === 'text' },
                  ]"
                >
                  <ReplyPreview
                    v-if="messageType === 'text' && message.repliedTo"
                    :message="message"
                    :contact="contact"
                    :is-mine="isMine"
                    :current-user-id="currentUserId"
                  />
                  <p v-if="messageType === 'text'" class="p-3 max-w-full">
                    <SafeEmojiText :text="message.text" />
                  </p>
                  <FileDisplay
                    v-else-if="messageType === 'file'"
                    :is-mine="isMine"
                    :url="message.fileUrl"
                    :file-name="message.fileName"
                    :message-id="message.id"
                    :is-sent="message.isSent"
                  />
                  <VoiceDisplay
                    v-else-if="messageType === 'voice'"
                    :url="message.voiceUrl"
                    :message-id="message.id"
                    :is-sent="message.isSent"
                  />
                </div>

                <!-- Single Image Bubble -->
                <div
                  v-else-if="messageType === 'image'"
                  @click.stop="previewImage(0)"
                  class="relative cursor-pointer overflow-hidden rounded-xl max-w-4/5 md:max-w-85 w-85 h-40.5"
                >
                  <BImage
                    fit="cover"
                    :src="message.imageUrl[0]"
                    class="w-full h-full rounded-xl overflow-hidden"
                  />
                  <UploadProgressOverlay
                    v-if="!message.isSent && uploadData"
                    :progress="uploadData.progress"
                    size="lg"
                  />
                </div>

                <!-- Multi Image Bubble -->
                <div
                  v-else-if="messageType === 'multiImage'"
                  class="max-w-75 flex items-center gap-x-3 h-16"
                >
                  <div
                    v-if="message.imageUrl.length > MAX_VISIBLE_IMAGES"
                    @click="previewImage(MAX_VISIBLE_IMAGES)"
                    class="h-full rounded-xl cursor-pointer overflow-hidden aspect-square flex items-center justify-center bg-surface-variant-2"
                  >
                    <div class="text-on-surface select-none text-label-md">
                      +{{ message.imageUrl.length - MAX_VISIBLE_IMAGES }}
                    </div>
                  </div>

                  <div
                    v-for="(image, index) in displayedImages"
                    :key="index"
                    @click.stop="previewImage(index)"
                    class="relative h-full rounded-xl cursor-pointer overflow-hidden aspect-square"
                  >
                    <BImage
                      :src="image"
                      class="min-w-full min-h-full max-w-full max-h-full h-full w-full"
                    />
                    <UploadProgressOverlay
                      v-if="!message.isSent && uploadData"
                      :progress="uploadData.progress"
                      size="sm"
                    />
                  </div>
                </div>

                <!-- Video Bubble -->
                <BubbleVideo
                  v-else-if="messageType === 'video'"
                  :video-url="message.videoUrl"
                  mode="playback"
                />

                <!-- Status / Timestamp Footer -->
                <div
                  v-if="isMine && message.isFailed"
                  role="button"
                  class="w-full pt-2 flex items-center gap-x-2 cursor-pointer justify-start"
                  @click.stop="messagesStore.retryMessage(message)"
                >
                  <BIcon :icon="checkIcon" class="w-4 h-4 fill-error" />
                  <div class="select-none text-body-sm text-error">
                    {{ t("sendFailed") }}
                  </div>
                </div>
                <div
                  v-else-if="shouldShowStatus"
                  class="w-full pt-2 flex items-center gap-x-2.5"
                  :class="{ 'justify-start': isMine, 'justify-end': !isMine }"
                >
                  <BIcon
                    v-if="isMine"
                    :icon="checkIcon"
                    class="w-4 h-4"
                    :class="{
                      'fill-primary': message.isRead && message.isSent,
                      'fill-on-surface/50': !(message.isRead && message.isSent),
                    }"
                  />
                  <div class="select-none text-body-sm text-on-surface/50">
                    {{ formatTime(message.date) }}
                  </div>
                </div>
              </div>

              <!-- Avatar -->
              <div class="shrink-0 w-10 pb-8">
                <div
                  v-if="!isMine && (!isSameSenderNext || !isSameDayNext)"
                  class="w-10 h-10"
                >
                  <ContactAvatar :contact="contact" :show-online="false" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Hidden Modals / Overlays -->
        <ImageGroupDisplay
          v-if="message.imageUrl && message.imageUrl.length > 0"
          ref="imageDisplayRef"
          :images="message.imageUrl"
        />
        <!-- Mounted on first open: a menu per bubble is otherwise dozens of idle instances. -->
        <BubbleOptions
          v-if="optionsMounted"
          :message="message"
          ref="bubbleOptionsRef"
        />
      </div>
    </div>
  </div>
</template>
