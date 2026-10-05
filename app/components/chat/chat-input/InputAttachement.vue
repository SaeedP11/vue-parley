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
    <Menu ref="menu" :model="menuItems" popup :dir="dir" class="vue-chat">
      <template #itemicon="{ item }">
        <BIcon :icon="item.phIcon" class="size-5 text-chat-muted" />
      </template>
    </Menu>

    <ResponsiveDialog
      v-model:visible="dialogOpen"
      :header="dialogTitle"
      width="30rem"
      data-testid="chat-attach-dialog"
      @after-hide="discard"
    >
      <div class="flex w-full flex-col gap-y-3">
        <!-- What is about to go out, and room to add to it. -->
        <div class="flex min-h-9 items-center justify-between gap-x-3">
          <span class="text-body-sm text-chat-muted" aria-live="polite">
            {{ summary.count }} ·
            <bdi dir="ltr">{{ summary.size }}</bdi>
          </span>
          <Button
            v-if="canAddMore"
            text
            size="small"
            :label="t('file.addMore')"
            class="shrink-0"
            @click="addMore"
          >
            <template #icon>
              <BIcon icon="PhPlus" class="size-4" />
            </template>
          </Button>
        </div>

        <div
          v-if="dialogMode === 'single-media' && selectedMedia[0]"
          class="relative overflow-hidden rounded-xl bg-chat-surface"
        >
          <MediaThumb
            :item="{ url: selectedMedia[0].path, kind: selectedMedia[0].kind }"
            fit="contain"
            class="h-72 max-h-[50dvh] w-full"
          />
          <button
            type="button"
            :class="[removeChip, 'end-2 top-2 size-9']"
            :aria-label="t('file.remove', { name: selectedMedia[0].file.name })"
            @click="removeMedia(0)"
          >
            <BIcon icon="PhX" weight="bold" class="size-4" />
          </button>
        </div>

        <ul
          v-else-if="dialogMode === 'multi-media'"
          class="-m-1 grid max-h-[min(20rem,45dvh)] grid-cols-3 gap-2 overflow-y-auto p-1"
        >
          <li
            v-for="(media, index) in selectedMedia"
            :key="media.path"
            class="relative aspect-square overflow-hidden rounded-lg bg-chat-surface"
          >
            <MediaThumb
              :item="{ url: media.path, kind: media.kind }"
              badge="sm"
              class="size-full"
            />
            <button
              type="button"
              :class="[removeChip, 'end-1 top-1 size-8']"
              :aria-label="t('file.remove', { name: media.file.name })"
              @click="removeMedia(index)"
            >
              <BIcon icon="PhX" weight="bold" class="size-3.5" />
            </button>
          </li>
        </ul>

        <ul
          v-else
          class="max-h-[min(20rem,45dvh)] divide-y divide-chat-outline-variant overflow-y-auto rounded-xl border border-chat-outline-variant"
        >
          <li v-for="(file, index) in selectedFiles" :key="file.path" class="py-2 ps-3 pe-1.5">
            <AttachementFileDisplay
              :file="file"
              :remove-label="t('file.remove', { name: file.name })"
              @remove="removeFile(index)"
            />
          </li>
        </ul>

        <Textarea
          v-model="caption"
          :placeholder="t('caption')"
          :aria-label="t('caption')"
          rows="1"
          auto-resize
          :autofocus="!isTouch"
          class="max-h-32 w-full"
          @keydown.enter.exact="onCaptionEnter"
        />
      </div>

      <template #footer>
        <div class="flex w-full items-center justify-end gap-x-2">
          <Button
            class="flex-1 md:flex-none"
            severity="secondary"
            text
            :label="t('file.cancel')"
            @click="dialogOpen = false"
          />
          <Button
            class="flex-1 md:min-w-28 md:flex-none"
            :label="t('send')"
            :disabled="itemCount === 0"
            @click="sendMessages"
          >
            <template #icon>
              <BIcon icon="PhPaperPlaneTilt" weight="fill" class="size-4.5 rtl:-scale-x-100" />
            </template>
          </Button>
        </div>
      </template>
    </ResponsiveDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
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
import useLocalI18n, { useDirection } from "~/composables/useLocalI18n";
import { inputAttachement } from "@i18n/locales";
import { formatBytes, replaceDigitsByLocale } from "~/utils/format";

type DialogMode = "single-media" | "multi-media" | "file";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AttachmentData = any;

const MAX_MEDIA = 10;

// Sits over any photo, so it carries its own dark backing rather than a theme colour.
const removeChip =
  "absolute flex cursor-pointer items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chat-primary motion-reduce:transition-none";

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

const { t, locale } = useLocalI18n(inputAttachement);
const { dir } = useDirection();
const { openToast } = useAppToast();
const localDigits = (value: string | number) => replaceDigitsByLocale(value, locale.value);
// Focusing the caption on a phone would throw the keyboard over the preview.
const isTouch = useMediaQuery("(pointer: coarse)");

const menu = ref<InstanceType<typeof Menu> | null>(null);
const dialogOpen = ref(false);
const dialogMode = ref<DialogMode>("file");
const caption = ref("");
const selectedMedia = ref<PickedMedia[]>([]);
const selectedFiles = ref<PickedFile[]>([]);
// Sent object URLs back the optimistic bubbles; only the ones never sent are released.
let sent = false;

watch(
  () => props.initialCaption,
  (newVal) => {
    caption.value = newVal;
  },
  { immediate: true },
);

const itemCount = computed(() =>
  dialogMode.value === "file" ? selectedFiles.value.length : selectedMedia.value.length,
);

const syncMediaMode = () => {
  dialogMode.value = selectedMedia.value.length === 1 ? "single-media" : "multi-media";
};

const handleMediaSelected = (incoming: PickedMedia[]) => {
  const remaining = MAX_MEDIA - selectedMedia.value.length;
  const accepted = incoming.slice(0, Math.max(remaining, 0));
  incoming.slice(accepted.length).forEach((m) => URL.revokeObjectURL(m.path));

  if (accepted.length < incoming.length) openToast(t("errors.maxFilesReached"), "error");
  if (!accepted.length) return;

  selectedMedia.value = [...selectedMedia.value, ...accepted];
  syncMediaMode();
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
  onRejected: (count) => openToast(t("errors.unsupported", { count: localDigits(count) }, count), "error"),
});

const removeMedia = (index: number) => {
  const [removed] = selectedMedia.value.splice(index, 1);
  if (removed) URL.revokeObjectURL(removed.path);
  if (selectedMedia.value.length === 0) dialogOpen.value = false;
  else syncMediaMode();
};

const removeFile = (index: number) => {
  const [removed] = selectedFiles.value.splice(index, 1);
  if (removed) URL.revokeObjectURL(removed.path);
  if (selectedFiles.value.length === 0) dialogOpen.value = false;
};

const canAddMore = computed(
  () => dialogMode.value === "file" || selectedMedia.value.length < MAX_MEDIA,
);
const addMore = () => (dialogMode.value === "file" ? pickFiles() : pickMedia());

const discard = () => {
  if (!sent) {
    selectedMedia.value.forEach((m) => URL.revokeObjectURL(m.path));
    selectedFiles.value.forEach((f) => URL.revokeObjectURL(f.path));
  }
  sent = false;
  selectedMedia.value = [];
  selectedFiles.value = [];
};

const menuItems = computed<MenuItem[]>(() => [
  {
    label: t("file.attachMedia"),
    phIcon: "PhImage",
    command: () => {
      discard();
      pickMedia();
    },
  },
  {
    label: t("file.attachFile"),
    phIcon: "PhFile",
    command: () => {
      discard();
      pickFiles();
    },
  },
]);

const dialogTitle = computed(() => {
  if (dialogMode.value === "file") {
    return selectedFiles.value.length > 1 ? t("file.sendFiles") : t("file.sendFile");
  }

  const kinds = new Set(selectedMedia.value.map((m) => m.kind));
  const single = dialogMode.value === "single-media";
  if (kinds.size > 1) return t("file.sendMedia");
  if (kinds.has("video")) return single ? t("file.sendVideo") : t("file.sendVideos");
  return single ? t("file.sendImage") : t("file.sendImages");
});

// "3 of 10 · 4.2 MB" for an album, "2 files · 1.3 MB" for files.
const summary = computed(() => {
  const items = dialogMode.value === "file" ? selectedFiles.value : selectedMedia.value;
  const bytes = items.reduce((total, item) => total + item.file.size, 0);
  const size = localDigits(formatBytes(bytes));
  const count =
    dialogMode.value === "file"
      ? t("file.fileCount", { count: localDigits(items.length) }, items.length)
      : t("file.mediaCount", {
          count: localDigits(items.length),
          max: localDigits(MAX_MEDIA),
        });
  return { count, size };
});

// Enter sends, as in the message box; Shift+Enter and an IME's own Enter keep typing.
const onCaptionEnter = (event: KeyboardEvent) => {
  if (event.isComposing) return;
  event.preventDefault();
  if (itemCount.value > 0) sendMessages();
};

const sendMessages = () => {
  const messagesToEmit: AttachmentData[] = [];

  if (caption.value.trim()) {
    messagesToEmit.push({
      type: "text",
      text: caption.value,
    });
  }

  if (dialogMode.value !== "file" && selectedMedia.value.length > 0) {
    messagesToEmit.push({
      type: "image",
      // Hosts that only know photos read `imageUrl`; the rest read the whole album from `media`.
      imageUrl: selectedMedia.value.filter((m) => m.kind === "image").map((m) => m.path),
      media: selectedMedia.value.map((m) => ({ url: m.path, kind: m.kind })),
      files: selectedMedia.value.map((m) => m.file),
    });
  }

  if (dialogMode.value === "file") {
    selectedFiles.value.forEach((fileData) => {
      messagesToEmit.push({
        type: "file",
        fileUrl: fileData.path,
        file: fileData.file,
        fileName: fileData.name,
      });
    });
  }

  sent = true;
  emit("send-attachments", messagesToEmit);
  dialogOpen.value = false;
};
</script>
