<script setup lang="ts">
/**
 * Full-screen viewer for a message's photos and videos, on PrimeVue's Galleria. A top bar carries
 * who sent it and when, the position in the album, download and close; round arrows (on wider
 * screens), swipes and the arrow keys move through the album; thumbnails run along the bottom.
 * Photos zoom and pan (ViewerImage); videos play with their own controls (ViewerVideo).
 */
import { computed, onUnmounted, ref, useTemplateRef, watch } from "vue";
import Galleria from "primevue/galleria";
import { useEventListener } from "@vueuse/core";
import type { MediaItem } from "~/types";
import IconButton from "~/components/general/IconButton.vue";
import MediaThumb from "~/components/general/MediaThumb.vue";
import ViewerImage from "./viewer/ViewerImage.vue";
import ViewerVideo from "./viewer/ViewerVideo.vue";
import useLocalI18n, { useDirection } from "~/composables/useLocalI18n";
import { useDate } from "~/composables/useDate.js";
import { useHostLocale } from "~/composables/useHostI18n";
import { useMediaStore } from "~/stores/mediaStore";
import { mediaViewer } from "@i18n/locales";

const props = defineProps<{
  items: MediaItem[];
  sender: string;
  date: Date;
}>();

const mediaStore = useMediaStore();
const { t } = useLocalI18n(mediaViewer);
const { dir } = useDirection();
const { formatDateShort, formatTime } = useDate();

const isOpen = ref(false);
const activeIndex = ref(0);
const hasMany = computed(() => props.items.length > 1);
const active = computed(() => props.items[activeIndex.value]);
const sentOn = computed(() =>
  t("sentOn", { day: formatDateShort(props.date), time: formatTime(props.date) }),
);
const locale = useHostLocale();
const num = (n: number) => n.toLocaleString(locale.value);

const imageStage = useTemplateRef<InstanceType<typeof ViewerImage>>("imageStage");
const zoomed = ref(false);

watch(
  () => props.items,
  (items) => {
    if (activeIndex.value >= items.length) activeIndex.value = 0;
  },
);
watch(activeIndex, () => (zoomed.value = false));

const go = (step: number) => {
  const next = activeIndex.value + step;
  if (next >= 0 && next < props.items.length) activeIndex.value = next;
};

/** A swipe or arrow key toward the reading direction's end moves forward. */
const goToward = (direction: "left" | "right") =>
  go((direction === "left") === (dir.value !== "rtl") ? 1 : -1);

useEventListener(window, "keydown", (event: KeyboardEvent) => {
  if (!isOpen.value || event.defaultPrevented) return;
  if ((event.target as HTMLElement | null)?.closest("[role='slider']")) return;
  if (event.key === "ArrowLeft") goToward("right");
  else if (event.key === "ArrowRight") goToward("left");
  else return;
  event.preventDefault();
});

const download = async () => {
  const item = active.value;
  if (!item) return;
  try {
    const blob = await mediaStore.download(item.url);
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download =
      item.url.split("/").pop()?.split("?")[0] || (item.kind === "video" ? "video.mp4" : "image.jpg");
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  } catch (error) {
    console.error("Failed to download media:", error);
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
  download,
});

const NAV =
  "absolute! top-1/2! z-10 hidden! size-12! -translate-y-1/2 items-center justify-center rounded-full! bg-white/10! text-white! backdrop-blur-md transition-colors hover:bg-white/20! md:flex! disabled:invisible!";

const pt = computed(() => ({
  mask: {
    class: "vue-chat bg-black/95! backdrop-blur-sm",
    "data-testid": "image-viewer",
    "data-open": String(isOpen.value),
  },
  root: { class: "relative flex! h-dvh w-dvw flex-col border-0! rounded-none! bg-transparent!" },
  closeButton: { class: "hidden!" },
  header: { class: "absolute inset-x-0 top-0 z-20" },
  content: { class: "min-h-0 flex-1 bg-transparent!" },
  itemsContainer: { class: "h-full" },
  items: { class: "h-full" },
  item: { class: "h-full" },
  prevButton: { class: `${NAV} start-6! end-auto! rtl:left-auto! rtl:right-6!`, "aria-label": t("actions.previous") },
  nextButton: { class: `${NAV} end-6! start-auto! rtl:right-auto! rtl:left-6!`, "aria-label": t("actions.next") },
  // Every thumbnail fits (albums hold at most 10), so they sit together instead of scrolling.
  // Phones go without: the counter and swiping cover it, and ten would not fit.
  thumbnails: { class: "hidden! shrink-0 pb-3 md:block!" },
  thumbnailContent: { class: "justify-center bg-transparent! p-2!" },
  thumbnailPrevButton: { class: "hidden!" },
  thumbnailNextButton: { class: "hidden!" },
  thumbnailsViewport: { class: "w-auto! max-w-full grow-0!" },
  // Galleria reverses the strip in RTL for its scrolling; ours never scrolls, so it reads naturally.
  thumbnailItems: { class: "rtl:flex-row!" },
  thumbnailItem: { class: "flex-[0_0_auto]! opacity-100! p-1!" },
}));
</script>

<template>
  <Galleria
    v-model:visible="isOpen"
    v-model:active-index="activeIndex"
    :value="items"
    full-screen
    :dir="dir"
    :show-thumbnails="hasMany"
    :show-item-navigators="hasMany"
    :num-visible="items.length"
    :pt="pt"
  >
    <template #header>
      <div
        class="flex items-start justify-between gap-x-4 bg-linear-to-b from-black/70 to-transparent px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-10 text-white md:px-5"
      >
        <div class="min-w-0 ps-1">
          <div class="truncate text-label-md">{{ sender }}</div>
          <div class="truncate text-body-sm text-white/70">{{ sentOn }}</div>
        </div>
        <div class="flex shrink-0 items-center gap-x-1">
          <span
            v-if="hasMany"
            data-testid="viewer-counter"
            class="me-2 rounded-full bg-white/10 px-2.5 py-1 text-label-sm tabular-nums"
          >
            {{ t("counter", { current: num(activeIndex + 1), total: num(items.length) }) }}
          </span>
          <IconButton
            v-if="zoomed"
            icon="PhCornersIn"
            :label="t('actions.resetZoom')"
            class="text-white! hover:bg-white/10!"
            @click="imageStage?.reset()"
          />
          <IconButton
            icon="PhDownloadSimple"
            :label="t('actions.download')"
            class="text-white! hover:bg-white/10!"
            @click="download"
          />
          <IconButton
            icon="PhX"
            :label="t('actions.close')"
            class="text-white! hover:bg-white/10!"
            data-testid="viewer-close"
            @click="isOpen = false"
          />
        </div>
      </div>
    </template>

    <template #item="{ item }">
      <div class="flex size-full items-center justify-center pt-16 pb-[env(safe-area-inset-bottom)] md:px-18 md:pb-0">
        <ViewerImage
          v-if="item.kind === 'image'"
          ref="imageStage"
          :key="item.url"
          :src="item.url"
          @swipe="goToward"
          @zoomed="zoomed = $event"
        />
        <ViewerVideo v-else :key="item.url" :src="item.url" @swipe="goToward" />
      </div>
    </template>

    <template #previousitemicon>
      <BIcon icon="PhCaretLeft" class="size-6 rtl:-scale-x-100" />
    </template>
    <template #nextitemicon>
      <BIcon icon="PhCaretLeft" class="size-6 -scale-x-100 rtl:scale-x-100" />
    </template>

    <template #thumbnail="{ item }">
      <MediaThumb
        :item="item"
        badge="sm"
        :show-duration="false"
        class="size-12 rounded-lg ring-offset-2 ring-offset-black transition md:size-14"
        :class="item === active ? 'opacity-100 ring-2 ring-white' : 'opacity-50 hover:opacity-80'"
      />
    </template>
  </Galleria>
</template>
