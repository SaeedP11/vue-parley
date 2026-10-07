<script setup lang="ts">
/**
 * Dims media that is still on its way out and shows how far along it is: its videos being
 * compressed first, then the upload.
 */
import { computed } from "vue";
import LoadingStatus from "~/components/general/LoadingStatus.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { chatBubble } from "@i18n/locales";
import { replaceDigitsByLocale } from "~/utils/format";

const props = withDefaults(
  defineProps<{
    /** 0–100, as UploadProgressEvent reports it. */
    progress: number;
    phase?: "compress" | "upload";
    size?: "sm" | "lg";
  }>(),
  { phase: "upload", size: "lg" },
);

const { t, locale } = useLocalI18n(chatBubble);

const label = computed(() =>
  t(props.phase === "compress" ? "sending.compressing" : "sending.uploading", {
    progress: replaceDigitsByLocale(Math.round(props.progress), locale.value),
  }),
);
</script>

<template>
  <div
    data-testid="upload-progress"
    :data-phase="phase"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="Math.round(progress)"
    class="absolute inset-0 flex flex-col items-center justify-center gap-y-2 bg-black/40"
  >
    <div class="rounded-full bg-chat-background/85 p-0.5">
      <LoadingStatus
        :progress="progress / 100"
        :size="size === 'lg' ? 44 : 28"
        :icon="phase === 'compress' ? 'PhArrowsInSimple' : undefined"
        is-uploading
      />
    </div>
    <span
      v-if="size === 'lg'"
      aria-hidden="true"
      class="rounded-full bg-black/55 px-2 py-0.5 text-[11px] leading-4 text-white tabular-nums backdrop-blur-sm"
    >
      {{ label }}
    </span>
  </div>
</template>
