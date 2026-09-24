<script setup lang="ts">
import vLoading from "~/directives/loading";
import { ref, computed, onMounted } from "vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { profileFileDisplay } from "@i18n/locales";
import { formatBytes } from "~/utils/format";
import { useMediaStore } from "~/stores/mediaStore";

const props = withDefaults(
  defineProps<{
    url: string;
    loading?: boolean;
  }>(),
  {
    loading: true,
  },
);

const { t } = useLocalI18n(profileFileDisplay);
const mediaStore = useMediaStore();
const fetchedSize = ref<number | null>(null);
const isLoading = computed(() => props.loading);

const fileName = computed(() => {
  try {
    const urlObj = new URL(props.url);
    const path = urlObj.pathname;
    return decodeURIComponent(path.split("/").pop() || "Unknown_File");
  } catch {
    return "File";
  }
});

const fileExt = computed(() => {
  const name = fileName.value;
  const lastDot = name.lastIndexOf(".");
  if (lastDot !== -1) {
    return name
      .substring(lastDot + 1)
      .toUpperCase()
      .substring(0, 4);
  }
  return "FILE";
});

const formattedSize = computed(() => {
  // FIX: Check `!== null` instead of truthy. If the file size is exactly 0 bytes,
  // a truthy check would incorrectly show "Calculating..." forever.
  return fetchedSize.value !== null
    ? formatBytes(fetchedSize.value)
    : t("file.calculating");
});

const getFileSize = async () => {
  try {
    const size = await mediaStore.fetchFileSize(props.url);
    fetchedSize.value = size ?? 0;
  } catch (e) {
    console.warn("Could not fetch file size upfront:", e);
    fetchedSize.value = 0; // Fallback
  }
};

onMounted(() => {
  getFileSize();
});
</script>

<template>
  <div class="flex w-full select-none items-center gap-x-2">
    <div class="flex min-w-0 flex-1 flex-col gap-y-0.5 text-left">
      <div v-loading="isLoading" class="truncate text-label-md text-chat-on-background">
        {{ fileName }}
      </div>
      <div
        v-loading="isLoading"
        dir="ltr"
        class="text-body-sm text-chat-on-background/70"
      >
        {{ formattedSize }}
      </div>
    </div>

    <div
      v-loading="isLoading"
      class="relative shrink-0 cursor-pointer transition-transform active:scale-95"
    >
      <BIcon
        icon="PhFile"
        weight="fill"
        class="h-10 w-10 fill-chat-surface-3"
      />
      <div
        class="absolute bottom-2 right-0 flex items-center justify-center rounded-sm bg-chat-error px-1 py-0.5"
      >
        <div
          class="text-center text-[7px] font-bold uppercase leading-none tracking-wide text-white"
        >
          {{ fileExt }}
        </div>
      </div>
    </div>
  </div>
</template>
