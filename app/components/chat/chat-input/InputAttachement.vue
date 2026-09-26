<template>
  <div>
    <IconButton
      icon="PhPaperclip"
      :label="t('actions.attach')"
      icon-class="size-6"
      data-testid="chat-attach"
      aria-haspopup="true"
      @click="menu?.toggle($event)"
    />
    <Menu ref="menu" :model="menuItems" popup class="vue-chat">
      <template #itemicon="{ item }">
        <BIcon :icon="item.phIcon" class="size-5 text-chat-on-background/50" />
      </template>
    </Menu>

    <ResponsiveDialog
      v-model:visible="dialogOpen"
      :header="dialogTitle"
      width="28.5rem"
      @after-hide="resetSelections"
    >
      <div class="flex w-full flex-col items-center gap-y-3">
        <MediaImage
          v-if="dialogMode === 'single-image'"
          :src="selectedMedia[0]?.path"
          fit="contain"
          class="max-h-109 w-full rounded-xl"
        />

        <div
          v-else-if="dialogMode === 'multi-image'"
          class="grid max-h-109 w-full grid-cols-4 gap-3 overflow-y-auto"
        >
          <MediaImage
            v-for="(image, index) in selectedMedia"
            :key="index"
            :src="image.path"
            class="h-25 w-full rounded-xl"
          />
        </div>

        <div
          v-else
          class="flex max-h-109 w-full flex-col gap-y-3 overflow-y-auto"
        >
          <AttachementFileDisplay
            v-for="(file, index) in selectedFiles"
            :key="index"
            :file="file"
          />
        </div>

        <Textarea
          v-model="caption"
          :placeholder="t('caption')"
          rows="3"
          auto-resize
          class="max-h-40 w-full"
        />
      </div>

      <template #footer>
        <div class="flex w-full items-center gap-x-3">
          <Button class="flex-1" :label="t('send')" @click="sendMessages" />
          <Button
            class="flex-1"
            severity="secondary"
            :label="t('file.cancel')"
            @click="dialogOpen = false"
          />
        </div>
      </template>
    </ResponsiveDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import Button from "primevue/button";
import Menu from "primevue/menu";
import Textarea from "primevue/textarea";
import type { MenuItem } from "primevue/menuitem";
import IconButton from "~/components/general/IconButton.vue";
import MediaImage from "~/components/general/MediaImage.vue";
import ResponsiveDialog from "~/components/general/ResponsiveDialog.vue";
import AttachementFileDisplay from "./AttachementFileDisplay.vue";
import {
  useAttachmentPicker,
  type PickedFile,
  type PickedImage,
} from "~/composables/useAttachmentPicker";
import { useAppToast } from "~/composables/useAppToast";
import useLocalI18n from "~/composables/useLocalI18n";
import { inputAttachement } from "@i18n/locales";

type DialogMode = "single-image" | "multi-image" | "file";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AttachmentData = any;

const MAX_IMAGES = 10;

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

const menu = ref<InstanceType<typeof Menu> | null>(null);
const dialogOpen = ref(false);
const dialogMode = ref<DialogMode>("file");
const caption = ref("");
const selectedMedia = ref<PickedImage[]>([]);
const selectedFiles = ref<PickedFile[]>([]);

watch(
  () => props.initialCaption,
  (newVal) => {
    caption.value = newVal;
  },
  { immediate: true },
);

const handleMediaSelected = (incoming: PickedImage[]) => {
  const remaining = MAX_IMAGES - selectedMedia.value.length;

  if (remaining <= 0) {
    openToast(t("errors.maxFilesReached"), "error");
    return;
  }

  selectedMedia.value = [
    ...selectedMedia.value,
    ...incoming.slice(0, remaining),
  ];
  dialogMode.value =
    selectedMedia.value.length === 1 ? "single-image" : "multi-image";
  dialogOpen.value = true;
};

const handleFilesSelected = (files: PickedFile[]) => {
  selectedFiles.value = [...selectedFiles.value, ...files];
  dialogMode.value = "file";
  dialogOpen.value = true;
};

const { pickImages, pickFiles } = useAttachmentPicker({
  onImages: handleMediaSelected,
  onFiles: handleFilesSelected,
});

const resetSelections = () => {
  selectedMedia.value = [];
  selectedFiles.value = [];
};

const menuItems = computed<MenuItem[]>(() => [
  {
    label: t("file.attachMedia"),
    phIcon: "PhImage",
    command: () => {
      resetSelections();
      pickImages();
    },
  },
  {
    label: t("file.attachFile"),
    phIcon: "PhFile",
    command: () => {
      resetSelections();
      pickFiles();
    },
  },
]);

const dialogTitle = computed(() => {
  switch (dialogMode.value) {
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

  selectedFiles.value.forEach((fileData) => {
    messagesToEmit.push({
      type: "file",
      fileUrl: fileData.path,
      file: fileData.file,
      fileName: fileData.name,
    });
  });

  emit("send-attachments", messagesToEmit);
  dialogOpen.value = false;
};
</script>
