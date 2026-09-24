<template>
  <div>
    <BMenu ref="attachementMenu">
      <template #trigger>
        <BIcon
          icon="PhPaperclip"
          data-testid="chat-attach"
          class="h-6 w-6 shrink-0 cursor-pointer fill-chat-on-background"
        />
      </template>
      <div class="flex w-41 flex-col gap-y-1 rounded-2xl bg-chat-background p-3">
        <div
          v-image-pick="{ multiple: true, onSelect: handleMediaSelected }"
          class="flex h-11 w-full cursor-pointer select-none items-center gap-x-2 rounded-xl bg-transparent px-3 transition-all duration-200 ease-in-out hover:bg-chat-surface-2"
          @click="resetSelections"
        >
          <BIcon icon="PhImage" class="h-5 w-5 fill-chat-on-background/50" />
          <div class="text-body-sm text-chat-on-background/70">
            {{ t("file.attachMedia") }}
          </div>
        </div>

        <div
          v-file-pick="{ multiple: true, onSelect: handleFilesSelected }"
          class="flex h-11 w-full cursor-pointer select-none items-center gap-x-2 rounded-xl bg-transparent px-3 transition-all duration-200 ease-in-out hover:bg-chat-surface-2"
          @click="resetSelections"
        >
          <BIcon icon="PhFile" class="h-5 w-5 fill-chat-on-background/50" />
          <div class="text-body-sm text-chat-on-background/70">
            {{ t("file.attachFile") }}
          </div>
        </div>
      </div>
    </BMenu>

    <BPopup ref="popup" no-padding @closed="resetSelections">
      <div class="w-dvw md:max-w-114">
        <div
          class="flex w-full items-center gap-x-3 border-b border-b-chat-outline-variant p-5"
        >
          <BIcon
            icon="PhX"
            class="h-5 w-5 cursor-pointer fill-chat-on-background/50"
            @click="closePopup"
          />
          <div class="select-none text-label-md text-chat-on-background">
            {{ popupTitle }}
          </div>
        </div>

        <div
          class="flex w-full flex-col items-center gap-y-3 px-5 pt-5 md:max-w-114"
        >
          <div v-if="popupMode === 'single-image'" class="w-full">
            <div class="h-full w-full">
              <BImage
                :src="selectedMedia[0]?.path"
                auto-size
                fit="cover"
                class="w-full overflow-hidden rounded-xl"
              />
            </div>
          </div>

          <div
            v-else-if="popupMode === 'multi-image'"
            class="max-h-109 w-full overflow-y-auto"
          >
            <div class="grid w-full grid-cols-4 gap-x-3">
              <div
                v-for="(image, index) in selectedMedia"
                :key="index"
                class="h-25"
              >
                <BImage
                  :src="image.path"
                  fit="cover"
                  class="h-full w-full min-h-full min-w-full max-h-full max-w-full overflow-hidden rounded-xl"
                />
              </div>
            </div>
          </div>

          <div
            v-else-if="popupMode === 'file'"
            class="flex w-full max-h-109 flex-col gap-y-3 overflow-y-auto"
          >
            <AttachementFileDisplay
              v-for="(file, index) in selectedFiles"
              :key="index"
              :file="file"
            />
          </div>

          <BInput
            v-model="caption"
            class="min-w-full"
            textarea
            :placeholder="t('caption')"
          />
        </div>

        <div
          class="flex w-full items-center gap-x-3 border-t border-t-chat-outline-variant p-5"
        >
          <div class="basis-1/2">
            <BButton
              class="min-w-full"
              :text="t('send')"
              @click="sendMessages"
            />
          </div>
          <div class="basis-1/2">
            <BButton
              class="min-w-full"
              color="secondary"
              :text="t('file.cancel')"
              @click="closePopup"
            />
          </div>
        </div>
      </div>
    </BPopup>
  </div>
</template>

<script setup lang="ts">
import vFilePick from "~/directives/filePicker";
import vImagePick from "~/directives/imagePicker";
import { ref, computed, watch } from "vue";
import type { Menu } from "~/types/components/menu";
import type { Popup } from "~/types/components/popup";
import AttachementFileDisplay from "./AttachementFileDisplay.vue";
import { useAppToast } from "~/composables/useAppToast.js";
import useLocalI18n from "~/composables/useLocalI18n";
import { inputAttachement } from "@i18n/locales";
type PopupMode = "single-image" | "multi-image" | "file";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AttachmentData = any;

const props = withDefaults(
  defineProps<{
    initialCaption?: string;
  }>(),
  {
    initialCaption: "",
  },
);

const emit = defineEmits<{
  "send-attachments": [messages: AttachmentData[]];
}>();

const { t } = useLocalI18n(inputAttachement);
const { openToast } = useAppToast();

const popup = ref<Popup | null>(null);
const attachementMenu = ref<Menu | null>(null);

const popupMode = ref<PopupMode>("file");
const caption = ref("");
const selectedMedia = ref<AttachmentData[]>([]);
const selectedFiles = ref<AttachmentData[]>([]);

watch(
  () => props.initialCaption,
  (newVal) => {
    caption.value = newVal;
  },
  { immediate: true },
);

const handleMediaSelected = (
  pathOrArray: string | AttachmentData[],
  file?: File,
) => {
  let incoming: AttachmentData[] = [];

  if (Array.isArray(pathOrArray)) {
    incoming = pathOrArray;
  } else if (typeof pathOrArray === "string" && file) {
    incoming = [{ path: pathOrArray, file }];
  }

  const maxAllowed = 10;
  const remaining = maxAllowed - selectedMedia.value.length;

  if (remaining <= 0) {
    openToast(t("errors.maxFilesReached"), "error");
    return;
  }

  selectedMedia.value = [
    ...selectedMedia.value,
    ...incoming.slice(0, remaining),
  ];
  popupMode.value =
    selectedMedia.value.length === 1 ? "single-image" : "multi-image";

  popup.value?.open();
};

const handleFilesSelected = (files: AttachmentData[]) => {
  selectedFiles.value = [...selectedFiles.value, ...files];
  popupMode.value = "file";

  popup.value?.open();
};

const closePopup = () => {
  popup.value?.close();
};

const resetSelections = () => {
  selectedMedia.value = [];
  selectedFiles.value = [];
  attachementMenu.value?.close();
};

const popupTitle = computed(() => {
  switch (popupMode.value) {
    case "file":
      return t("file.sendFile");
    case "multi-image":
      return t("file.sendImages");
    case "single-image":
      return t("file.sendImage");
  }
});

const sendMessages = () => {
  const messagesToEmit: AttachmentData[] = [];

  if (caption.value.trim()) {
    messagesToEmit.push({
      type: "text",
      text: caption.value,
    });
  }

  if (selectedMedia.value.length > 0) {
    messagesToEmit.push({
      type: "image",
      imageUrl: selectedMedia.value.map((m) => m.path),
      files: selectedMedia.value.map((m) => m.file),
    });
  }

  if (selectedFiles.value.length > 0) {
    selectedFiles.value.forEach((fileData) => {
      messagesToEmit.push({
        type: "file",
        fileUrl: fileData.path,
        file: fileData.file,
        fileName: fileData.name,
      });
    });
  }

  emit("send-attachments", messagesToEmit);
  closePopup();
  resetSelections();
};
</script>
