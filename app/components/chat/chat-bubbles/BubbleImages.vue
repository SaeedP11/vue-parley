<script setup lang="ts">
/**
 * Image content of a message: one large tile, or a row of thumbnails with a "+N" tile when
 * there are more than fit. Emits the index to open in the viewer.
 */
import { computed } from "vue";
import type { UploadProgressEvent } from "~/types";
import UploadProgressOverlay from "./UploadProgressOverlay.vue";
import MediaImage from "~/components/general/MediaImage.vue";

const MAX_VISIBLE_IMAGES = 3;

const props = defineProps<{
  images: string[];
  isSent: boolean;
  upload?: UploadProgressEvent;
}>();

const emit = defineEmits<{ preview: [index: number] }>();

const displayedImages = computed(() => props.images.slice(0, MAX_VISIBLE_IMAGES));
const showUpload = computed(() => !props.isSent && !!props.upload);
</script>

<template>
  <div
    v-if="images.length === 1"
    data-testid="bubble-image"
    @click.stop="emit('preview', 0)"
    class="relative cursor-pointer overflow-hidden rounded-xl max-w-full md:max-w-85 w-85 h-40.5"
  >
    <MediaImage :src="images[0]" class="size-full rounded-xl" />
    <UploadProgressOverlay
      v-if="showUpload"
      :progress="upload!.progress"
      size="lg"
    />
  </div>

  <div v-else class="max-w-75 flex items-center gap-x-3 h-16">
    <div
      v-if="images.length > MAX_VISIBLE_IMAGES"
      @click="emit('preview', MAX_VISIBLE_IMAGES)"
      class="h-full rounded-xl cursor-pointer overflow-hidden aspect-square flex items-center justify-center bg-surface-variant-2"
    >
      <div class="text-on-surface select-none text-label-md">
        +{{ images.length - MAX_VISIBLE_IMAGES }}
      </div>
    </div>

    <div
      v-for="(image, index) in displayedImages"
      :key="index"
      @click.stop="emit('preview', index)"
      class="relative h-full rounded-xl cursor-pointer overflow-hidden aspect-square"
    >
      <MediaImage :src="image" class="size-full" />
      <UploadProgressOverlay
        v-if="showUpload"
        :progress="upload!.progress"
        size="sm"
      />
    </div>
  </div>
</template>
