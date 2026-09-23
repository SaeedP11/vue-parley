<template>
  <div dir="rtl" class="w-full relative">
    <VideoRecordDisplay
      ref="videoDisplayRef"
      :stream="mediaStream"
      :is-paused="isPaused"
      :recording-time="currentRecordingSeconds"
      @flip-camera="handleFlipCamera"
    />
    <div>
      <div
        :class="[textMode !== 'normal' ? ' h-10' : 'h-0']"
        class="gap-x-3 px-3 w-full whitespace-nowrap overflow-hidden border-t select-none text-body-sm border-t-outline-variant flex relative z-30 justify-between items-center transition-all duration-200 ease-in-out bg-surface"
      >
        <BIcon
          :icon="
            textMode === 'edit' ? 'PhPencilSimpleLine' : 'PhArrowBendUpLeft'
          "
          class="w-5 h-5 fill-on-surface shrink-0"
        />
        <div class="flex-1 flex items-center gap-x-2">
          <div v-if="textMode === 'reply'" class="shrink-0 text-on-surface/50">
            {{ displayActionName }} :
          </div>
          <div class="flex-1">
            <div
              class="text-on-surface w-full overflow-hidden text-ellipsis line-clamp-1"
            >
              <SafeEmojiText :text="displayedActionText" />
            </div>
          </div>
        </div>
        <BIcon
          icon="PhX"
          class="cursor-pointer w-5 shrink-0 h-5 fill-on-surface/50"
          @click="cancelAction"
        />
      </div>
    </div>
    <div
      @contextmenu.prevent
      ref="rootElements"
      :class="[
        (isRecording && !isLocked) || editor.messageText.value.trim().length > 0
          ? 'px-4'
          : 'px-4',
      ]"
      class="transition-all duration-200 ease-in-out min-h-19 py-4 w-full bg-surface flex items-end border-t border-t-outline-variant gap-x-5 relative z-40 overflow-visible select-none"
    >
      <div
        class="relative flex items-center justify-center shrink-0 z-30 mb-0.5"
        :style="{
          transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
          transition: isDragging
            ? 'none'
            : 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }"
      >
        <div
          v-if="isRecording"
          class="absolute -top-20 flex flex-col items-center justify-center bg-surface shadow-floating rounded-full w-9 transition-opacity"
          :class="[
            isLocked
              ? 'pointer-events-auto py-1.5'
              : 'pointer-events-none py-3 gap-y-3',
          ]"
          :style="{ opacity: lockOpacity }"
        >
          <template v-if="!isLocked">
            <BIcon icon="PhLockKey" class="w-5 h-5 fill-on-surface" />
          </template>

          <template v-else>
            <div
              class="w-full h-9 flex items-center justify-center cursor-pointer"
              @click="togglePause"
            >
              <BIcon
                :icon="isPaused ? 'PhPlayCircle' : 'PhPauseCircle'"
                class="w-6 h-6 fill-on-surface"
              />
            </div>
          </template>
          <BIcon
            icon="PhCaretUp"
            class="w-4 h-4 fill-on-surface/60 animate-bounce"
          />
        </div>

        <div
          class="flex items-center w-11 touch-none h-11 justify-center transition-all duration-200"
          :class="[
            (isRecording && !isLocked) ||
            editor.messageText.value.trim().length > 0
              ? ' rounded-full bg-primary/10'
              : 'w-6 h-6 bg-primary/0',
          ]"
          @pointerdown="!isLocked ? handlePointerDown($event) : null"
          @click="!isLocked ? toggleSecondaryMessageType() : null"
        >
          <BIcon
            v-if="!isLocked && editor.messageText.value.trim().length == 0"
            :icon="secondaryMessageIcon"
            :weight="isRecording ? 'fill' : 'regular'"
            class="cursor-pointer w-6 h-6 shrink-0 transition-colors"
            :class="[isRecording ? ' fill-primary' : iconClass]"
          />
          <div
            v-else
            class="min-w-11 min-h-11 aspect-square rounded-full bg-gradient-primary-secondary flex items-center justify-center cursor-pointer"
          >
            <BIcon
              icon="PhPaperPlaneTilt"
              class="w-6 h-6 fill-white shrink-0"
              @click="sendRecording"
            />
          </div>
        </div>
      </div>

      <div v-show="!isRecording" class="flex-1 flex items-end gap-x-5">
        <div class="min-h-11 flex items-center w-full">
          <div
            ref="inputRef"
            contenteditable="true"
            @keydown.enter.exact.prevent="handleEnterKey"
            @input="editor.handleContentInput"
            @focus="onInputFocus"
            @blur="editor.saveCursorPosition"
            @keyup="editor.saveCursorPosition"
            @mouseup="editor.saveCursorPosition"
            :data-placeholder="inputPlaceholder"
            class="text-body-md text-on-surface outline-none flex-1 bg-transparent z-10 max-h-[144px] overflow-y-auto hide-scrollbar leading-6 py-1 cursor-text whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-on-surface/50 pointer-events-auto"
          ></div>
        </div>
        <div
          class="shrink-0 flex items-center gap-x-8 z-10 h-11"
          :class="[iconClass]"
        >
          <div class="hidden md:block">
            <BMenu ref="menuRef">
              <template #trigger>
                <BIcon
                  icon="PhSmiley"
                  class="cursor-pointer w-6 h-6 fill-on-surface"
                  @mousedown.prevent
                />
              </template>
              <div class="">
                <BEmojiPicker :native="true" @select="handleEmojiSelect" />
              </div>
            </BMenu>
          </div>

          <!-- MOBILE: Toggle Button -->
          <BIcon
            icon="PhSmiley"
            class="md:hidden cursor-pointer w-6 h-6 fill-on-surface"
            @mousedown.prevent
            @click="toggleMobileEmoji"
          />
          <InputAttachement
            :initial-caption="editor.messageText.value"
            @send-attachments="handleAttachments"
          />
        </div>
      </div>

      <div
        v-show="isRecording"
        class="flex-1 justify-between -translate-y-2 flex items-center"
      >
        <div></div>
        <div
          class="flex justify-center items-center text-body-md text-on-surface/70 transition-opacity"
          :style="{ opacity: cancelOpacity }"
        >
          <span v-if="!isLocked">{{ t("chat.swipeToCancel") }}</span>
          <span
            v-else
            class="text-primary cursor-pointer px-4 z-20"
            @click="cancelRecording"
            >{{ t("chat.cancel") }}</span
          >
        </div>

        <div class="left-6 flex items-center gap-x-2 shrink-0 z-10">
          <div class="w-2.5 h-2.5 relative">
            <div class="w-2.5 h-2.5 rounded-full bg-error"></div>
            <div
              class="w-2.5 h-2.5 rounded-full bg-error animate-ping absolute top-0 left-0 inset-0"
            ></div>
          </div>
          <span
            class="text-body-md min-w-12 text-center text-on-surface tabular-nums mt-0.5"
            dir="ltr"
            >{{ formattedTime }}</span
          >
        </div>
      </div>
    </div>
    <div
      class="md:hidden w-full transition-all relative z-30 duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] overflow-hidden"
      :class="
        showMobileEmojiPicker ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0'
      "
    >
      <BEmojiPicker @select="handleEmojiSelect" />
    </div>
  </div>
</template>
<script setup lang="ts">
import {
  ref,
  computed,
  nextTick,
  watch,
  onMounted,
  onUnmounted,
  useTemplateRef,
} from "vue";
import type { Menu } from "~/types/components/menu";
import type { ExtendedMessage, Message } from "~/types";
import InputAttachement from "./chat-input/InputAttachement.vue";
import {
  useAppPermissions,
  type PopupState,
} from "~/composables/useAppPermissions";
import { useChatRecording } from "~/composables/chat/useChatRecording";
import VideoRecordDisplay from "./chat-input/VideoRecordDisplay.vue";
import { useRichTextEditor } from "~/composables/useRichTextEditor";
import { useMessagesStore } from "~/stores/messageStores.js";
import { useProfileStore } from "~/stores/profileStore.js";
import SafeEmojiText from "../general/SafeEmojiText.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { useChatStore } from "~/stores/chatStore.js";
import { useCallStore } from "~/stores/callStore.js";
import { type EmojiExt } from "vue3-emoji-picker";
import { chat, chatInput } from "@i18n/locales";

const props = withDefaults(
  defineProps<{
    isActive?: boolean;
  }>(),
  { isActive: false },
);

const emit = defineEmits<{
  send: [];
  edit: [];
}>();

const { t } = useLocalI18n(chatInput, chat);
const { requestWithPopup, checkMediaStatus } = useAppPermissions();
const messagesStore = useMessagesStore();
const chatStore = useChatStore();
const callStore = useCallStore();

const profileStore = useProfileStore();
const currentUserId = computed(() => profileStore.userId);

// Template Refs (Properly typed, no 'any')
const rootElements = useTemplateRef<HTMLElement>("rootElements");
const inputRef = useTemplateRef<HTMLDivElement>("inputRef");
const menuRef = useTemplateRef<Menu>("menuRef");
const videoDisplayRef =
  useTemplateRef<InstanceType<typeof VideoRecordDisplay>>("videoDisplayRef");

// Local State
const showMobileEmojiPicker = ref(false);
const textMode = ref<"normal" | "edit" | "reply">("normal");
const editingMessageData = ref<ExtendedMessage | null>(null);
const replyingToMessageData = ref<ExtendedMessage | null>(null);
const secondaryMessageType = ref<"video" | "voice">("voice");

// Composables
const editor = useRichTextEditor(inputRef);
const inputWidth = computed(() => rootElements.value?.clientWidth || 0);

// --- Computed UI States ---
const inputDisabled = computed(() => !props.isActive);
const inputPlaceholder = computed(() =>
  props.isActive ? t("placeholder") : t("chatLocked"),
);
const iconClass = computed(() =>
  !props.isActive
    ? "pointer-events-none fill-chat-on-background opacity-50"
    : "pointer-events-auto fill-chat-on-background opacity-100",
);

const secondaryMessageIcon = computed(() =>
  secondaryMessageType.value === "voice" ? "PhMicrophone" : "PhCamera",
);

// Replaces messy inline template logic
const showSecondaryAction = computed(
  () =>
    !isRecording.value &&
    !isLocked.value &&
    editor.messageText.value.trim().length === 0,
);
const showSendButton = computed(() => !showSecondaryAction.value);

const displayedActionText = computed(() => {
  const message =
    textMode.value === "edit"
      ? editingMessageData.value
      : replyingToMessageData.value;
  if (!message) return "";
  // Fixed typos: attachementTypes -> attachmentTypes
  if (message.voiceUrl?.trim()) return t("attachmentTypes.voice");
  if (message.videoUrl?.trim()) return t("attachmentTypes.video");
  if (message.imageUrl?.length) return t("attachmentTypes.image");
  if (message.fileUrl?.trim()) return t("attachmentTypes.file");
  return message.text;
});

const displayActionName = computed(() => {
  if (textMode.value === "edit") return t("you");
  if (replyingToMessageData.value?.senderId === currentUserId.value)
    return t("you");
  return replyingToMessageData.value?.contact?.name || "";
});

// --- Recording Composable ---
const recording = useChatRecording(inputWidth, {
  onStart: () => {
    if (secondaryMessageType.value === "video") videoDisplayRef.value?.open();
  },
  onCancel: () => {
    if (secondaryMessageType.value === "video") videoDisplayRef.value?.close();
  },
  onSend: (mediaUrl?: string) => {
    const finalUrl = mediaUrl || "placeholder";
    const msg = createBaseMessage();
    console.log(msg);
    msg.type = secondaryMessageType.value as Message["type"];
    if (msg.type === "voice") msg.voiceUrl = finalUrl;
    if (msg.type === "video") msg.videoUrl = finalUrl;

    messagesStore.sendMessage([msg]);
    messagesStore.clearActions();
    if (secondaryMessageType.value === "video") videoDisplayRef.value?.close();
  },
  requestPermission: async () => await ensurePermissions(),
  getMode: () => secondaryMessageType.value,
});

const {
  isRecording,
  isLocked,
  isPaused,
  dragOffset,
  isDragging,
  formattedTime,
  isLongPress,
  onPointerDown: onRecordPointerDown,
  stopRecording,
  mediaStream,
  lockOpacity,
  cancelOpacity,
  togglePause,
} = recording;

const currentRecordingSeconds = computed(() => {
  if (!formattedTime.value) return 0;
  const [minutes, seconds] = formattedTime.value.split(":").map(Number);
  return (minutes || 0) * 60 + (seconds || 0);
});

watch(currentRecordingSeconds, (sec) => {
  if (sec >= 60 && isRecording.value) stopRecording(true);
});

// --- Permissions ---
const ensurePermissions = async () => {
  const isVideo = secondaryMessageType.value === "video";
  const currentStatus = await checkMediaStatus();
  const status = isVideo ? currentStatus.cam : currentStatus.mic;

  if (status === "granted") return true;

  const state: PopupState = isVideo
    ? status === "denied"
      ? "cam-error"
      : "cam-permission"
    : status === "denied"
      ? "mic-error"
      : "mic-permission";

  return await requestWithPopup(state);
};

// --- Message Handling ---
const createBaseMessage = (): Message =>
  ({
    id: String(Date.now() + Math.floor(Math.random() * 1000)),
    conversationId: chatStore.activeConversationId ?? "",
    date: new Date(),
    type: "text",
    isEdited: false,
    senderId: currentUserId.value,
    isSent: false,
    isRead: false,
    repliedTo: messagesStore.replyingTo || undefined,
  }) as Message;

const handleAttachments = (payloads: Message[]) => {
  const newMessages = payloads.map((payload) => {
    const msg = createBaseMessage();
    msg.type = payload.type;
    if (payload.type === "text") msg.text = payload.text;
    if (payload.type === "image") msg.imageUrl = payload.imageUrl;
    if (payload.type === "file") {
      msg.fileUrl = payload.fileUrl;
      msg.fileName = payload.fileName;
    }
    if (payload.type === "voice") msg.voiceUrl = payload.voiceUrl;
    if (payload.type === "video") msg.videoUrl = payload.videoUrl;
    return msg;
  });

  messagesStore.sendMessage(newMessages);
  editor.clearInput();
  messagesStore.clearActions();
};

const sendMessage = () => {
  if (editor.messageText.value.trim().length === 0) return;

  if (textMode.value === "edit" && editingMessageData.value) {
    messagesStore.saveEditMessage(
      editingMessageData.value.id,
      editor.messageText.value,
    );
  } else {
    const msg = createBaseMessage();
    msg.type = "text";
    msg.text = editor.messageText.value;
    messagesStore.sendMessage([msg]);
  }

  editor.clearInput();
  textMode.value = "normal";
  messagesStore.clearActions();
};

const cancelAction = () => messagesStore.clearActions();

const handleEditMessage = (msg: ExtendedMessage) => {
  textMode.value = "edit";
  editingMessageData.value = msg;
  editor.messageText.value = msg.text || "";
  nextTick(() => {
    inputRef.value?.focus();
    editor.adjustHeight();
  });
};

// --- Watchers ---
watch(
  () => messagesStore.replyingTo,
  (msg) => {
    if (msg) {
      textMode.value = "reply";
      replyingToMessageData.value = msg;
      nextTick(() => inputRef.value?.focus());
    } else if (textMode.value === "reply") {
      textMode.value = "normal";
      replyingToMessageData.value = null;
    }
  },
);

// --- Input Interactions ---
const onInputFocus = () => {
  if (editor.isSelectingEmoji.value) return;
  showMobileEmojiPicker.value = false;
};

const handlePointerDown = (event: PointerEvent) => {
  if (editor.messageText.value.trim().length > 0) {
    sendMessage();
    return;
  }
  menuRef.value?.close();
  recording.onPointerDown(event);

  // NOTE: The 300ms setTimeout has been completely removed from here.
  // The @click event now handles the toggle safely!
};

const handleEnterKey = (e: KeyboardEvent) => {
  if (e.shiftKey) return;
  e.preventDefault();
  sendMessage();
};

const toggleMobileEmoji = () => {
  showMobileEmojiPicker.value = !showMobileEmojiPicker.value;
  if (showMobileEmojiPicker.value) {
    editor.saveCursorPosition();
    inputRef.value?.blur();
  }
};

const handleEmojiSelect = (emoji: EmojiExt) => {
  editor.handleEmojiSelect(emoji.i, showMobileEmojiPicker.value);
};

// Cleaned up pointer/click handlers
const handleActionPointerDown = (e: PointerEvent) => {
  if (showSecondaryAction.value) onRecordPointerDown(e);
};

const handleActionClick = () => {
  if (showSecondaryAction.value) toggleSecondaryMessageType();
};

const toggleSecondaryMessageType = () => {
  if (!isLongPress.value && !isRecording.value) {
    secondaryMessageType.value =
      secondaryMessageType.value === "voice" ? "video" : "voice";
  }
};

const handleFlipCamera = () => {
  if (typeof recording.toggleCamera === "function") recording.toggleCamera();
};

const sendRecording = () => stopRecording(true);
const cancelRecording = () => stopRecording(false);

// --- Global Keys ---
const handleGlobalKeyDown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    if (textMode.value !== "normal" || messagesStore.selectedArray.length > 0) {
      cancelAction();
    } else {
      const isCallMode = callStore.isActive;
      const isProfileView = chatStore.profileViewOpen;

      if (isCallMode) callStore.minimize();
      else if (isProfileView) chatStore.closeProfile();
      else chatStore.setSelectedChat(null);
    }
  }
};

onMounted(() => window.addEventListener("keydown", handleGlobalKeyDown));
onUnmounted(() => window.removeEventListener("keydown", handleGlobalKeyDown));

defineExpose({ focus: () => inputRef.value?.focus() });
</script>
