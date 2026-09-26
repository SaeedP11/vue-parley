<template>
  <div dir="rtl" class="vue-chat w-full relative">
    <VideoRecordDisplay
      ref="videoDisplay"
      :stream="mediaStream"
      :is-paused="isPaused"
      :recording-time="currentRecordingSeconds"
      @flip-camera="handleFlipCamera"
    />
    <InputActionBar
      :mode="textMode"
      :name="displayActionName"
      :text="displayedActionText ?? ''"
      @cancel="cancelAction"
    />
    <div
      @contextmenu.prevent
      ref="rootElements"
      class="px-4 transition-all duration-200 ease-in-out min-h-19 py-4 w-full bg-surface flex items-end border-t border-t-outline-variant gap-x-5 relative z-40 overflow-visible select-none"
    >
      <RecordButton
        :is-recording="isRecording"
        :is-locked="isLocked"
        :is-paused="isPaused"
        :has-text="editor.messageText.value.trim().length > 0"
        :icon="secondaryMessageIcon"
        :disabled="inputDisabled"
        :lock-opacity="lockOpacity"
        :drag-offset="dragOffset"
        :is-dragging="isDragging"
        @pointerdown="handlePointerDown"
        @toggle-type="toggleSecondaryMessageType"
        @toggle-pause="togglePause"
        @send="handleSend"
      />

      <div v-show="!isRecording" class="flex-1 flex items-end gap-x-5">
        <div class="min-h-11 flex items-center w-full">
          <div
            ref="input"
            data-testid="chat-input"
            contenteditable="true"
            @keydown.enter.exact.prevent="handleEnterKey"
            @input="editor.handleContentInput"
            @focus="onInputFocus"
            @blur="editor.saveCursorPosition"
            @keyup="editor.saveCursorPosition"
            @mouseup="editor.saveCursorPosition"
            :data-placeholder="inputPlaceholder"
            class="text-body-md text-on-surface outline-none flex-1 bg-transparent z-10 max-h-[144px] overflow-y-auto hide-scrollbar leading-6 py-1 cursor-text whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-chat-muted pointer-events-auto"
          ></div>
        </div>
        <div class="z-10 flex h-11 shrink-0 items-center gap-x-2">
          <!-- A popover on wide screens; on phones the picker opens under the input instead. -->
          <IconButton
            icon="PhSmiley"
            icon-class="size-6"
            :label="t('actions.emoji')"
            :disabled="inputDisabled"
            data-testid="chat-emoji"
            class="hidden! md:inline-flex!"
            @mousedown.prevent
            @click="openEmojiPopover"
          />
          <Popover ref="emojiPopover" class="vue-chat">
            <BEmojiPicker v-if="emojiUsed" @select="handleEmojiSelect" />
          </Popover>
          <IconButton
            icon="PhSmiley"
            icon-class="size-6"
            :label="t('actions.emoji')"
            :disabled="inputDisabled"
            class="md:hidden!"
            @mousedown.prevent
            @click="toggleMobileEmoji"
          />
          <InputAttachement
            :initial-caption="editor.messageText.value"
            @send-attachments="handleAttachments"
          />
        </div>
      </div>

      <RecordingStatus
        v-show="isRecording"
        :locked="isLocked"
        :cancel-opacity="cancelOpacity"
        :time="formattedTime"
        @cancel="cancelRecording"
      />
    </div>
    <div
      class="md:hidden w-full transition-all relative z-30 duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] overflow-hidden"
      :class="
        showMobileEmojiPicker ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0'
      "
    >
      <BEmojiPicker v-if="emojiUsed" @select="handleEmojiSelect" />
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
import Popover from "primevue/popover";
import IconButton from "~/components/general/IconButton.vue";
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
import InputActionBar from "./chat-input/InputActionBar.vue";
import RecordingStatus from "./chat-input/RecordingStatus.vue";
import RecordButton from "./chat-input/RecordButton.vue";
import { useInputDraft } from "~/composables/chat/useInputDraft";
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
const rootElementsRef = useTemplateRef<HTMLElement>("rootElements");
const inputRef = useTemplateRef<HTMLDivElement>("input");
const emojiPopoverRef = useTemplateRef<InstanceType<typeof Popover>>("emojiPopover");
const videoDisplayRef =
  useTemplateRef<InstanceType<typeof VideoRecordDisplay>>("videoDisplay");

// Local State
const showMobileEmojiPicker = ref(false);
/** The pickers mount on first use: they are heavy, and most messages have no emoji. */
const emojiUsed = ref(false);
const textMode = ref<"normal" | "edit" | "reply">("normal");
const editingMessageData = ref<ExtendedMessage | null>(null);
const replyingToMessageData = ref<ExtendedMessage | null>(null);
const secondaryMessageType = ref<"video" | "voice">("voice");

// Composables
const editor = useRichTextEditor(inputRef);
const { restoreDraft } = useInputDraft(editor, () => textMode.value === "edit");
const inputWidth = computed(() => rootElementsRef.value?.clientWidth || 0);

// --- Computed UI States ---
const inputDisabled = computed(() => !props.isActive);
const inputPlaceholder = computed(() =>
  props.isActive ? t("placeholder") : t("chatLocked"),
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
    // Clears `editingMessage`; its watcher leaves edit mode and restores the draft.
    messagesStore.saveEditMessage(
      editingMessageData.value.id,
      editor.messageText.value,
    );
    return;
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
  editor.setText(msg.text || "");
  nextTick(() => inputRef.value?.focus());
};

// --- Watchers ---
// The store sets `editingMessage` from the bubble menu; enter edit mode from it, and leave it
// (restoring the draft the edit displaced) when the edit is saved or cancelled.
watch(
  () => messagesStore.editingMessage,
  (msg) => {
    if (msg) {
      handleEditMessage(msg);
    } else if (textMode.value === "edit") {
      textMode.value = "normal";
      editingMessageData.value = null;
      restoreDraft();
    }
  },
);

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
  emojiPopoverRef.value?.hide();
  recording.onPointerDown(event);

  // NOTE: The 300ms setTimeout has been completely removed from here.
  // The @click event now handles the toggle safely!
};

const handleEnterKey = (e: KeyboardEvent) => {
  if (e.shiftKey) return;
  e.preventDefault();
  sendMessage();
};

const openEmojiPopover = (event: MouseEvent) => {
  emojiUsed.value = true;
  emojiPopoverRef.value?.toggle(event);
};

const toggleMobileEmoji = () => {
  emojiUsed.value = true;
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

// The send button sends the typed text, or a recording once it has been locked.
const handleSend = () => (isLocked.value ? stopRecording(true) : sendMessage());
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
