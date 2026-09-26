<script setup lang="ts">
/** Full-screen viewer for a message's images: swipe or arrow between them, thumbnails below. */
import { computed, onUnmounted, ref, useTemplateRef, watch } from "vue";
import Galleria from "primevue/galleria";
import { useSwipe } from "@vueuse/core";
import IconButton from "~/components/general/IconButton.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { useDirection } from "~/composables/useLocalI18n";
import { useMediaStore } from "~/stores/mediaStore";
import { chatBubble } from "@i18n/locales";

const props = withDefaults(
  defineProps<{
    images?: string[];
  }>(),
  {
    images: () => [],
  },
);

const mediaStore = useMediaStore();
const { t } = useLocalI18n(chatBubble);
const { dir } = useDirection();

const isOpen = ref(false);
const activeIndex = ref(0);
const hasMany = computed(() => props.images.length > 1);

watch(
  () => props.images,
  (newImages) => {
    if (activeIndex.value >= newImages.length) activeIndex.value = 0;
  },
);

// Swiping the photo moves to the neighbouring one, in reading direction.
const stage = useTemplateRef<HTMLElement>("stage");
useSwipe(stage, {
  onSwipeEnd: (_, direction) => {
    if (direction !== "left" && direction !== "right") return;
    const forward = (direction === "left") === (dir.value !== "rtl");
    const next = activeIndex.value + (forward ? 1 : -1);
    if (next >= 0 && next < props.images.length) activeIndex.value = next;
  },
});

const downloadImage = async () => {
  const url = props.images[activeIndex.value];
  if (!url) return;

  try {
    const blob = await mediaStore.download(url);
    const blobUrl = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = url.split("/").pop() || "image.jpg";
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error("Failed to download image:", error);
  }
};

// The browser's Back button closes the viewer instead of leaving the page.
const handlePopState = () => {
  isOpen.value = false;
};

watch(isOpen, (open) => {
  if (open) {
    window.history.pushState({ viewerOpen: true }, "");
    window.addEventListener("popstate", handlePopState);
    return;
  }
  window.removeEventListener("popstate", handlePopState);
  if (window.history.state?.viewerOpen) window.history.back();
});

onUnmounted(() => {
  window.removeEventListener("popstate", handlePopState);
  if (isOpen.value && window.history.state?.viewerOpen) window.history.back();
});

defineExpose({
  open: (index: number) => {
    activeIndex.value = index;
    isOpen.value = true;
  },
  close: () => {
    isOpen.value = false;
  },
  download: downloadImage,
});
</script>

<template>
  <Galleria
    v-model:visible="isOpen"
    v-model:active-index="activeIndex"
    :value="images"
    full-screen
    :show-thumbnails="hasMany"
    :show-item-navigators="hasMany"
    :num-visible="5"
    :pt="{
      mask: {
        class: 'vue-chat',
        'data-testid': 'image-viewer',
        'data-open': String(isOpen),
      },
      root: { class: 'w-dvw max-w-dvw md:w-[70vw]' },
    }"
  >
    <template #item="{ item }">
      <div
        ref="stage"
        class="flex h-[60dvh] w-full items-center justify-center md:h-[75vh]"
      >
        <img
          :src="item"
          alt=""
          draggable="false"
          class="block max-h-full max-w-full object-contain select-none md:rounded-xl"
        />
      </div>
    </template>
    <template #thumbnail="{ item }">
      <img
        :src="item"
        alt=""
        draggable="false"
        class="block size-16 rounded-lg object-cover select-none"
      />
    </template>
    <template #footer>
      <div class="flex w-full justify-center py-2">
        <IconButton
          icon="PhDownloadSimple"
          :label="t('actions.download')"
          class="text-white!"
          @click="downloadImage"
        />
      </div>
    </template>
  </Galleria>
</template>
