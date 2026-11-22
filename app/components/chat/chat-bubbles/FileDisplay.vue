<script setup lang="ts">
import Button from "primevue/button";
import FileFormatDisplay from "~/components/general/FileFormatDisplay.vue";
import LoadingStatus from "~/components/general/LoadingStatus.vue";
import { useMessagesStore } from "~/stores/messageStores";
import { chatBubblesFileDisplay } from "@i18n/locales";
import useLocalI18n from "~/composables/useLocalI18n";
import { useMediaStore } from "~/stores/mediaStore";
import { computed, onMounted, ref, watch } from "vue";
import { formatBytes } from "~/utils/format";

const props = withDefaults(
  defineProps<{
    messageId?: string;
    isMine?: boolean;
    isSent?: boolean;
    url: string;
    fileName?: string;
    fileSize?: number;
  }>(),
  {
    isMine: true,
    isSent: true,
  },
);

const { t } = useLocalI18n(chatBubblesFileDisplay);
const messagesStore = useMessagesStore();
const mediaStore = useMediaStore();

const status = ref<"idle" | "downloading" | "downloaded">("idle");
const progress = ref(0);
const fetchedSize = ref<number | null>(null);
let abortController: AbortController | null = null;

const uploadData = computed(() =>
  props.messageId ? messagesStore.uploadProgress.get(props.messageId) : null,
);
const isUploading = computed(() => !props.isSent && !!uploadData.value);

const displayProgress = computed(() => {
  if (isUploading.value && uploadData.value) {
    return uploadData.value.progress / 100;
  }
  if (status.value === "downloading") {
    return progress.value / 100;
  }
  return 0;
});

const checkLocalExistence = async () => {
  const cached = await mediaStore.getCachedBlob(props.url);
  if (cached) status.value = "downloaded";
};

const fileName = computed(() => {
  if (props.fileName) return props.fileName;
  try {
    const urlObj = new URL(props.url);
    return decodeURIComponent(
      urlObj.pathname.split("/").pop() || "Unknown_File",
    );
  } catch {
    return "File";
  }
});

const actionLabel = computed(() => {
  if (isUploading.value) return t("actions.cancelUpload");
  if (status.value === "downloading") return t("actions.cancelDownload");
  return t("actions.download");
});

const fileExt = computed(() => {
  const name = fileName.value;
  const lastDot = name.lastIndexOf(".");
  return lastDot !== -1
    ? name
        .substring(lastDot + 1)
        .toUpperCase()
        .substring(0, 4)
    : "FILE";
});

const resolvedSize = computed(() => props.fileSize ?? fetchedSize.value);

const formattedSize = computed(() => {
  const size = resolvedSize.value;
  if (isUploading.value && uploadData.value) {
    const realTotal = size || uploadData.value.total;
    const currentUploaded = (uploadData.value.progress / 100) * realTotal;
    return `${formatBytes(currentUploaded)} / ${formatBytes(realTotal)}`;
  }
  if (status.value === "downloading" && size) {
    const downloaded = (progress.value / 100) * size;
    return `${formatBytes(downloaded)} / ${formatBytes(size)}`;
  }
  return size !== null && size !== undefined
    ? formatBytes(size)
    : t("file.calculating");
});

const getFileSize = async () => {
  if (props.fileSize !== undefined && props.fileSize !== null) {
    fetchedSize.value = props.fileSize;
    return;
  }
  if (!props.url) return;
  if (props.url.startsWith("blob:")) {
    try {
      const res = await fetch(props.url);
      const blob = await res.blob();
      fetchedSize.value = blob.size;
    } catch {
      fetchedSize.value = 0;
    }
    return;
  }
  try {
    const size = await mediaStore.fetchFileSize(props.url);
    fetchedSize.value = size ?? 0;
  } catch {
    fetchedSize.value = 0;
  }
};

const handleAction = async () => {
  if (isUploading.value) {
    if (props.messageId) {
      messagesStore.cancelSending(props.messageId);
    }
    return;
  }

  if (status.value === "downloaded") {
    const fileBlob = await mediaStore.getCachedBlob(props.url);

    if (fileBlob) {
      const blobUrl = URL.createObjectURL(fileBlob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName.value;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } else {
      status.value = "idle";
      handleAction();
    }
    return;
  }

  if (status.value === "downloading") {
    abortController?.abort();
    status.value = "idle";
    progress.value = 0;
    return;
  }

  status.value = "downloading";
  progress.value = 0;
  abortController = new AbortController();

  try {
    await mediaStore.download(props.url, {
      signal: abortController.signal,
      onProgress: (p) => {
        progress.value = p;
      },
    });
    status.value = "downloaded";
  } catch {
    status.value = "idle";
    progress.value = 0;
  }
};

onMounted(() => {
  getFileSize();
  checkLocalExistence();
});

watch(
  () => props.fileSize,
  (newSize) => {
    if (typeof newSize === "number") {
      fetchedSize.value = newSize;
    }
  },
);

watch(
  () => props.url,
  () => {
    getFileSize();
  },
);
</script>
<template>
  <div class="px-3 flex gap-x-2 select-none items-center">
    <div dir="ltr" class="flex text-left flex-col gap-y-0.5 flex-1 min-w-0">
      <div class="text-chat-on-background text-label-md truncate">{{ fileName }}</div>
      <div
        class="text-body-sm text-left text-chat-on-background/70 truncate"
      >
        {{ formattedSize }}
      </div>
    </div>
    <Button
      text
      rounded
      class="size-11! shrink-0 p-0!"
      :aria-label="actionLabel"
      @click="handleAction"
    >
      <FileFormatDisplay
        v-if="status === 'downloaded' && !isUploading"
        :width="30"
        :height="33"
        :label="fileExt"
      />
      <LoadingStatus
        v-else
        :progress="displayProgress"
        :is-uploading="isUploading"
        :is-downloading="status === 'downloading'"
        :icon="isUploading ? 'PhX' : undefined"
      />
    </Button>
  </div>
</template>
