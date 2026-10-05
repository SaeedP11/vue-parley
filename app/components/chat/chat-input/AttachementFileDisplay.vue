const { locale } = useI18n();

const formattedSize = computed(() =>
  replaceDigitsByLocale(formatBytes(props.file?.size || 0), locale.value),
);<template>
  <div class="flex w-full items-center gap-x-3 select-none">
    <div
      aria-hidden="true"
      class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-chat-primary/10 text-chat-primary"
    >
      <span v-if="fileExt" dir="ltr" class="text-[11px] font-bold uppercase leading-none tracking-wide">
        {{ fileExt }}
      </span>
      <BIcon v-else icon="PhFile" class="size-5.5" />
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-y-0.5 text-start">
      <div :title="fileName" class="truncate text-label-md text-chat-on-background">
        <bdi>{{ fileName }}</bdi>
      </div>
      <div dir="ltr" class="text-body-sm text-chat-muted rtl:text-end">
        {{ formattedSize }}
      </div>
    </div>

    <IconButton
      icon="PhX"
      :label="removeLabel"
      icon-class="size-4.5"
      class="size-9! shrink-0"
      @click="emit('remove')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import IconButton from "~/components/general/IconButton.vue";
import { formatBytes, replaceDigitsByLocale } from "~/utils/format";

interface AttachmentFile {
  name: string;
  size: number;
  format: string;
  path: string;
}

const props = defineProps<{
  file: AttachmentFile;
  /** Accessible name of the remove button. */
  removeLabel: string;
}>();

const emit = defineEmits<{ remove: [] }>();

// Up to four letters fit the tile; without an extension it shows a file icon.
const fileExt = computed(() => {
  const name = props.file?.name ?? "";
  const lastDot = name.lastIndexOf(".");
  return lastDot > 0 ? name.slice(lastDot + 1, lastDot + 5) : "";
});

const fileName = computed(() => props.file?.name || "Unknown File");

const { locale } = useI18n();

const formattedSize = computed(() =>
  replaceDigitsByLocale(formatBytes(props.file?.size || 0), locale.value),
);
</script>
