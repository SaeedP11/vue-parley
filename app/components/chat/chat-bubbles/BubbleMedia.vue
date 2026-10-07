<script setup lang="ts">
/**
 * A message's photos and videos: one large tile, or a row of thumbnails with a "+N" tile when
 * there are more than fit. Videos show their first frame, a play badge and their length. Emits the
 * index to open in the viewer.
 */
import { computed } from "vue";
import Button from "primevue/button";
import type { MediaItem, UploadProgressEvent } from "~/types";
import UploadProgressOverlay from "./UploadProgressOverlay.vue";
import MediaThumb from "~/components/general/MediaThumb.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { chatBubble } from "@i18n/locales";

const MAX_VISIBLE = 3;

const props = defineProps<{
  items: MediaItem[];
  isSent: boolean;
  upload?: UploadProgressEvent;
  /** 0–100 while its videos are compressed, before the upload. */
  compress?: number;
}>();

const emit = defineEmits<{ preview: [index: number] }>();

const { t } = useLocalI18n(chatBubble);

const displayed = computed(() => props.items.slice(0, MAX_VISIBLE));
// Compressing comes first, then the upload.
const sending = computed(() => {
  if (props.isSent) return null;
  if (props.compress !== undefined) return { phase: "compress" as const, progress: props.compress };
  if (props.upload) return { phase: "upload" as const, progress: props.upload.progress };
  return null;
});
const label = (item: MediaItem) => t(`attachementTypes.${item.kind}`);

const TILE = "relative block overflow-hidden rounded-xl p-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chat-primary";
</script>

<template>
  <Button
    v-if="items.length === 1"
    unstyled
    data-testid="bubble-image"
    :aria-label="label(items[0]!)"
    :class="[TILE, 'h-40.5 w-85 max-w-full md:max-w-85']"
    @click.stop="emit('preview', 0)"
  >
    <MediaThumb :item="items[0]!" class="size-full" />
    <UploadProgressOverlay
        v-if="sending"
        :progress="sending.progress"
        :phase="sending.phase"
        size="lg"
      />
  </Button>

  <div v-else class="flex h-16 max-w-75 items-center gap-x-3">
    <Button
      v-if="items.length > MAX_VISIBLE"
      unstyled
      :aria-label="`+${items.length - MAX_VISIBLE}`"
      :class="[TILE, 'flex aspect-square h-full items-center justify-center bg-surface-variant-2']"
      @click.stop="emit('preview', MAX_VISIBLE)"
    >
      <span class="select-none text-label-md text-on-surface">
        +{{ items.length - MAX_VISIBLE }}
      </span>
    </Button>

    <Button
      v-for="(item, index) in displayed"
      :key="index"
      unstyled
      data-testid="bubble-media-item"
      :aria-label="label(item)"
      :class="[TILE, 'aspect-square h-full']"
      @click.stop="emit('preview', index)"
    >
      <MediaThumb :item="item" badge="sm" :show-duration="false" class="size-full" />
      <UploadProgressOverlay
        v-if="sending"
        :progress="sending.progress"
        :phase="sending.phase"
        size="sm"
      />
    </Button>
  </div>
</template>
