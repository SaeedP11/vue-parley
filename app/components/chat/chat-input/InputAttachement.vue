<template>
  <div>
    <IconButton
      icon="PhPaperclip"
      :label="t('actions.attach')"
      icon-class="size-6"
      data-testid="chat-attach"
      aria-haspopup="menu"
      :aria-expanded="pickerOpen"
      @click="togglePicker"
    />
    <Popover
      ref="picker"
      :dir="dir"
      class="vue-chat"
      :pt="{ content: { class: 'p-1.5!' } }"
      @show="onPickerShow"
      @hide="pickerOpen = false"
    >
      <div
        ref="pickerList"
        role="menu"
        :aria-label="t('actions.attach')"
        class="flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-y-0.5"
        data-testid="chat-attach-menu"
        @keydown="onPickerKeydown"
      >
        <Button
          v-for="option in pickerOptions"
          :key="option.key"
          role="menuitem"
          text
          severity="secondary"
          class="w-full justify-start! gap-x-3! rounded-xl! px-2! py-1.5! text-start"
          :data-testid="`chat-attach-${option.key}`"
          @click="choose(option)"
        >
          <span
            aria-hidden="true"
            class="flex size-10 shrink-0 items-center justify-center rounded-full"
            :class="option.tint"
          >
            <BIcon :icon="option.icon" weight="fill" class="size-5" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-y-0.5">
            <span class="text-label-md text-chat-on-background">{{ option.label }}</span>
            <span class="truncate text-body-sm text-chat-muted">{{ option.hint }}</span>
          </span>
        </Button>
      </div>
    </Popover>

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

        <!-- The chat bubble shows the compression, then the upload, once it is sent. -->
        <p
          v-if="dialogMode !== 'file' && videoCount > 0"
          class="flex items-center gap-x-2 text-body-sm text-chat-muted"
          data-testid="chat-attach-compress"
        >
          <BIcon icon="PhFilmStrip" class="size-4.5 shrink-0" aria-hidden="true" />
          {{ canCompress ? t("compress.note", videoCount) : t("compress.unsupported") }}
        </p>

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
            data-testid="chat-attach-send"
            @click="send"
          >
            <template #icon>
              <BIcon
                icon="PhPaperPlaneTilt"
                weight="fill"
                class="size-4.5 rtl:-scale-x-100"
              />
            </template>
          </Button>
        </div>
      </template>
    </ResponsiveDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import { useMediaQuery } from "@vueuse/core";
import Button from "primevue/button";
import Popover from "primevue/popover";
import Textarea from "primevue/textarea";
import IconButton from "~/components/general/IconButton.vue";
import MediaThumb from "~/components/general/MediaThumb.vue";
import ResponsiveDialog from "~/components/general/ResponsiveDialog.vue";
import AttachementFileDisplay from "./AttachementFileDisplay.vue";
import {
  useAttachmentPicker,
  type PickedFile,
  type PickedMedia,
} from "~/composables/useAttachmentPicker";
import { canCompressVideo } from "~/utils/compressVideo";
import { useAppToast } from "~/composables/useAppToast";
import useLocalI18n, { useDirection } from "~/composables/useLocalI18n";
import { inputAttachement } from "@i18n/locales";
import { formatBytes, replaceDigitsByLocale } from "~/utils/format";

type DialogMode = "single-media" | "multi-media" | "file";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AttachmentData = any;

interface PickerOption {
  key: "photo" | "video" | "file";
  icon: string;
  label: string;
  hint: string;
  tint: string;
  pick: () => void;
}

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
const size = (bytes: number) => localDigits(formatBytes(bytes));
// Focusing the caption on a phone would throw the keyboard over the preview.
const isTouch = useMediaQuery("(pointer: coarse)");

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

// Videos are compressed after Send, by the messages store, with the progress on the bubble.
const canCompress = canCompressVideo();
const videoCount = computed(() => selectedMedia.value.filter((m) => m.kind === "video").length);

/* --- Picking ----------------------------------------------------------------------------- */

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
  if (removed) {
    URL.revokeObjectURL(removed.path);
  }
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
// An album takes photos and videos alike, whichever it was started from.
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

/* --- The attach popover ------------------------------------------------------------------ */

const picker = ref<InstanceType<typeof Popover> | null>(null);
const pickerList = ref<HTMLElement | null>(null);
const pickerOpen = ref(false);
let pickerTrigger: HTMLElement | null = null;

const pickerOptions = computed<PickerOption[]>(() => [
  {
    key: "photo",
    icon: "PhImage",
    label: t("file.attachPhoto"),
    hint: t("file.photoHint"),
    tint: "bg-chat-primary/12 text-chat-primary",
    pick: () => pickMedia("image"),
  },
  {
    key: "video",
    icon: "PhVideoCamera",
    label: t("file.attachVideo"),
    hint: canCompress ? t("file.videoHint") : t("file.videoHintPlain"),
    tint: "bg-chat-secondary/14 text-chat-secondary",
    pick: () => pickMedia("video"),
  },
  {
    key: "file",
    icon: "PhFileText",
    label: t("file.attachFile"),
    hint: t("file.fileHint"),
    tint: "bg-chat-surface-3 text-chat-on-surface",
    pick: pickFiles,
  },
]);

const togglePicker = (event: MouseEvent) => {
  pickerTrigger = event.currentTarget as HTMLElement;
  picker.value?.toggle(event);
};

const pickerItems = () =>
  Array.from(pickerList.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

const onPickerShow = async () => {
  pickerOpen.value = true;
  await nextTick();
  pickerItems()[0]?.focus();
};

// Arrow keys, Home and End move between the options, as in a menu; Escape returns to the clip.
const onPickerKeydown = (event: KeyboardEvent) => {
  const items = pickerItems();
  const current = items.indexOf(document.activeElement as HTMLElement);
  const go = (index: number) => {
    event.preventDefault();
    items[(index + items.length) % items.length]?.focus();
  };
  if (event.key === "ArrowDown") go(current + 1);
  else if (event.key === "ArrowUp") go(current - 1);
  else if (event.key === "Home") go(0);
  else if (event.key === "End") go(items.length - 1);
  else if (event.key === "Escape") {
    event.preventDefault();
    picker.value?.hide();
    pickerTrigger?.focus();
  }
};

const choose = (option: PickerOption) => {
  discard();
  // The chooser only opens inside the click itself.
  option.pick();
  picker.value?.hide();
};

/* --- Sending ----------------------------------------------------------------------------- */

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

// "3 of 10 · 4.2 MB" for an album, "2 files · 1.3 MB" for files, as picked.
const summary = computed(() => {
  const items = dialogMode.value === "file" ? selectedFiles.value : selectedMedia.value;
  const bytes = items.reduce((total, item) => total + item.file.size, 0);
  const count =
    dialogMode.value === "file"
      ? t("file.fileCount", { count: localDigits(selectedFiles.value.length) }, selectedFiles.value.length)
      : t("file.mediaCount", {
          count: localDigits(selectedMedia.value.length),
          max: localDigits(MAX_MEDIA),
        });
  return { count, size: size(bytes) };
});

// Enter sends, as in the message box; Shift+Enter and an IME's own Enter keep typing.
const onCaptionEnter = (event: KeyboardEvent) => {
  if (event.isComposing) return;
  event.preventDefault();
  send();
};

const send = () => {
  if (itemCount.value === 0) return;
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
