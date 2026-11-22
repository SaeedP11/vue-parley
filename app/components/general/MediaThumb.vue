<script setup lang="ts">
/**
 * A still of a photo or video, sized by its class: the photo itself, or a video's first frame with
 * a play badge and, once known, its length. Shows a PrimeVue Skeleton until the frame is ready.
 */
import { computed, onMounted, ref, watch } from "vue";
import Skeleton from "primevue/skeleton";
import type { MediaItem } from "~/types";
import MediaImage from "./MediaImage.vue";
import { formatDuration } from "~/utils/media";
import { formatBytes } from "~/utils/format";
import { useMediaStore } from "~/stores/mediaStore";

const props = withDefaults(
  defineProps<{
    item: MediaItem;
    fit?: "cover" | "contain";
    /** Size of the play badge; "none" hides it. */
    badge?: "sm" | "lg" | "none";
    showDuration?: boolean;
  }>(),
  { fit: "cover", badge: "lg", showDuration: true },
);

const loaded = ref(false);
const duration = ref<number | null>(null);

const onMetadata = (event: Event) => {
  const d = (event.target as HTMLVideoElement).duration;
  // Recordings without a duration in their header report Infinity until played through.
  duration.value = Number.isFinite(d) ? d : null;
};

const mediaStore = useMediaStore();
const fetchedSize = ref<number | null>(null);
const resolvedSize = computed(() => props.item.size ?? fetchedSize.value);

const getFileSize = async () => {
  if (props.item.size !== undefined && props.item.size !== null) {
    fetchedSize.value = props.item.size;
    return;
  }
  if (props.item.kind !== "video" || !props.item.url) return;
  if (props.item.url.startsWith("blob:")) {
    try {
      const res = await fetch(props.item.url);
      const blob = await res.blob();
      fetchedSize.value = blob.size;
    } catch {
      fetchedSize.value = null;
    }
    return;
  }
  try {
    const size = await mediaStore.fetchFileSize(props.item.url);
    fetchedSize.value = size ?? null;
  } catch {
    fetchedSize.value = null;
  }
};

onMounted(() => {
  if (props.item.kind === "video") {
    getFileSize();
  }
});

watch(
  () => props.item.size,
  (newSize) => {
    if (typeof newSize === "number") {
      fetchedSize.value = newSize;
    }
  },
);

watch(
  () => props.item.url,
  () => {
    loaded.value = false;
    duration.value = null;
    if (props.item.kind === "video") {
      getFileSize();
    }
  },
);

const badgeText = computed(() => {
  const parts: string[] = [];
  if (props.showDuration && duration.value !== null) {
    parts.push(formatDuration(duration.value));
  }
  if (resolvedSize.value && resolvedSize.value > 0) {
    parts.push(formatBytes(resolvedSize.value));
  }
  return parts.join(" • ");
});
</script>

<template>
  <MediaImage v-if="item.kind === 'image'" :src="item.url" :fit="fit" />

  <div v-else class="relative overflow-hidden bg-black">
    <div v-if="!loaded" class="absolute inset-0">
      <Skeleton width="100%" height="100%" border-radius="0" />
    </div>
    <!-- #t skips to a frame past the first, which is often black. -->
    <video
      :key="item.url"
      :src="`${item.url}#t=0.1`"
      preload="metadata"
      muted
      playsinline
      disablepictureinpicture
      tabindex="-1"
      aria-hidden="true"
      class="pointer-events-none block size-full transition-opacity duration-300"
      :class="[
        fit === 'cover' ? 'object-cover' : 'object-contain',
        loaded ? 'opacity-100' : 'opacity-0',
      ]"
      @loadedmetadata="onMetadata"
      @loadeddata="loaded = true"
      @error="loaded = true"
    />

    <div
      v-if="badge !== 'none'"
      class="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <span
        class="flex items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm"
        :class="badge === 'lg' ? 'size-12' : 'size-6'"
      >
        <BIcon
          icon="PhPlay"
          weight="fill"
          :class="badge === 'lg' ? 'size-5 ms-0.5' : 'size-3 ms-px'"
        />
      </span>
    </div>

    <span
      v-if="showDuration && badgeText"
      class="pointer-events-none absolute start-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[11px] leading-none text-white tabular-nums"
    >
      {{ badgeText }}
    </span>
  </div>
</template>
