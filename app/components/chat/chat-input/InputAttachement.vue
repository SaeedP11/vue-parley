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
        <BIcon :icon="item.phIcon" class="size-5 text-chat-muted" />
      </template>
    </Menu>

    <ResponsiveDialog
      v-model:visible="dialogOpen"
      :header="dialogTitle"
      width="28.5rem"
      @after-hide="resetSelections"
    >
      <div class="flex w-full flex-col items-center gap-y-3">
        <MediaThumb
          v-if="dialogMode === 'single-media' && selectedMedia[0]"
          :item="{ url: selectedMedia[0].path, kind: selectedMedia[0].kind }"
          fit="contain"
          class="h-72 max-h-109 w-full rounded-xl"
        />

        <div
          v-else-if="dialogMode === 'multi-media'"
          class="grid max-h-109 w-full grid-cols-4 gap-3 overflow-y-auto"
        >
          <MediaThumb
            v-for="(media, index) in selectedMedia"
            :key="index"
            :item="{ url: media.path, kind: media.kind }"
            badge="sm"
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
import MediaThumb from "~/components/general/MediaThumb.vue";
import ResponsiveDialog from "~/components/general/ResponsiveDialog.vue";
import AttachementFileDisplay from "./AttachementFileDisplay.vue";
import {
  useAttachmentPicker,
  type PickedFile,
  type PickedMedia,
} from "~/composables/useAttachmentPicker";
import { useAppToast } from "~/composables/useAppToast";
import useLocalI18n from "~/composables/useLocalI18n";
import { inputAttachement } from "@i18n/locales";

type DialogMode = "single-media" | "multi-media" | "file";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AttachmentData = any;

const MAX_MEDIA = 10;

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
const selectedMedia = ref<PickedMedia[]>([]);
const selectedFiles = ref<PickedFile[]>([]);

watch(
  () => props.initialCaption,
  (newVal) => {
    caption.value = newVal;
  },
  { immediate: true },
);

const handleMediaSelected = (incoming: PickedMedia[]) => {
  const remaining = MAX_MEDIA - selectedMedia.value.length;

  if (remaining <= 0) {
    openToast(t("errors.maxFilesReached"), "error");
    return;
  }

  selectedMedia.value = [
    ...selectedMedia.value,
    ...incoming.slice(0, remaining),
  ];
  dialogMode.value =
    selectedMedia.value.length === 1 ? "single-media" : "multi-media";
  dialogOpen.value = true;
};

const handleFilesSelected = (files: PickedFile[]) => {
  selectedFiles.value = [...selectedFiles.value, ...files];
  dialogMode.value = "file";
  dialogOpen.value = true;
};

const { pickMedia, pickFiles } = useAttachmentPicker({
  onMedia: handleMediaSelected,
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
      pickMedia();
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
  if (dialogMode.value === "file") return t("file.sendFile");

  const kinds = new Set(selectedMedia.value.map((m) => m.kind));
  const single = dialogMode.value === "single-media";
  if (kinds.size > 1) return t("file.sendMedia");
  if (kinds.has("video")) return single ? t("file.sendVideo") : t("file.sendVideos");
  return single ? t("file.sendImage") : t("file.sendImages");
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
      // Hosts that only know photos read `imageUrl`; the rest read the whole album from `media`.
      imageUrl: selectedMedia.value.filter((m) => m.kind === "image").map((m) => m.path),
      media: selectedMedia.value.map((m) => ({ url: m.path, kind: m.kind })),
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
