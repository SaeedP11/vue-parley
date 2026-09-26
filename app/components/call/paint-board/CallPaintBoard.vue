<template>
  <div
    class="relative w-dvw overflow-hidden whitespace-nowrap text-wrap select-none md:max-w-135"
  >
    <div class="flex h-full w-full flex-col p-4">
      <div class="flex shrink-0 items-center gap-x-2">
        <IconButton
          icon="PhX"
          :label="t('actions.close')"
          @click="$emit('close')"
        />
        <div class="text-label-sm text-chat-on-background">
          {{ t("board.title") }}
        </div>
      </div>

      <!-- CANVAS WRAPPER -->
      <div
        class="relative mt-4 min-h-117 w-full shrink-0 overflow-hidden rounded-2xl border-2 border-chat-primary bg-white"
      >
        <canvas
          ref="canvas"
          class="absolute top-0 left-0 h-full w-full touch-none"
        />
      </div>

      <div class="mt-2 flex shrink-0 items-center justify-between">
        <Button rounded :aria-label="t('board.save')" @click="saveToFiles">
          <template #icon>
            <BIcon icon="PhTrayArrowDown" class="size-5" />
          </template>
        </Button>

        <div dir="rtl" class="flex items-center gap-x-2">
          <IconButton
            v-if="pages.length === 1"
            icon="PhPlus"
            :label="t('board.addPage')"
            v-bind="toolButton"
            @click="handleAction('add-page')"
          />
          <template v-else>
            <Button
              :label="`+${pages.length - 1}`"
              :aria-label="t('board.pages')"
              severity="secondary"
              rounded
              aria-haspopup="true"
              @click="pagesMenuRef?.toggle($event)"
            >
              <template #icon>
                <BIcon icon="PhFiles" class="size-6" />
              </template>
            </Button>
            <Menu ref="pagesMenu" :model="pageItems" popup class="vue-chat">
              <template #itemicon="{ item }">
                <BIcon :icon="item.phIcon" class="size-5 text-chat-primary" />
              </template>
            </Menu>
          </template>

          <Button
            severity="secondary"
            rounded
            :aria-label="t('board.selectColor')"
            @click="colorPickerRef?.open()"
          >
            <template #icon>
              <span
                class="block size-6 rounded-full"
                :style="{ backgroundColor: selectedColor }"
              />
            </template>
          </Button>

          <IconButton
            icon="PhEraser"
            :label="t('board.erase')"
            v-bind="toolButton"
            @click="handleAction('erase')"
          />

          <IconButton
            icon="PhPencilLine"
            :label="t('board.brushSize')"
            v-bind="toolButton"
            aria-haspopup="true"
            @click="brushPopoverRef?.toggle($event)"
          />
          <Popover ref="brushPopover" class="vue-chat">
            <BrushSizeSlider v-model="brushSize" :color="selectedColor" />
          </Popover>

          <IconButton
            icon="PhArrowUUpRight"
            :label="t('board.redo')"
            v-bind="toolButton"
            @click="handleAction('redo')"
          />

          <IconButton
            icon="PhArrowUUpLeft"
            :label="t('board.undo')"
            v-bind="toolButton"
            @click="handleAction('undo')"
          />
        </div>
      </div>
    </div>

    <BoardColorPicker
      ref="colorPicker"
      v-model="selectedColor"
      :colors="colors"
      :title="t('board.selectColor')"
    />
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  useTemplateRef,
} from "vue";

import BrushSizeSlider from "./BrushSizeSlider.vue";
import BoardColorPicker from "./BoardColorPicker.vue";
import type { BoardColorPickerExposed } from "./BoardColorPicker.vue";
import { useAppToast } from "~/composables/useAppToast.js";
import { useCallStore } from "~/stores/callStore.js";
import Button from "primevue/button";
import Menu from "primevue/menu";
import Popover from "primevue/popover";
import type { MenuItem } from "primevue/menuitem";
import IconButton from "~/components/general/IconButton.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { callPaintBoard } from "@i18n/locales";
import { storeToRefs } from "pinia";

// Isolate the untyped signature_pad instance to avoid polluting the rest of the file
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SignaturePadInstance = any;


const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
  }>(),
  {
    isOpen: false,
  },
);

const emit = defineEmits<{
  close: [];
}>();

const { t } = useLocalI18n(callPaintBoard);
const callStore = useCallStore();
const { openToast } = useAppToast();
const colorPickerRef = useTemplateRef<BoardColorPickerExposed>("colorPicker");
const pagesMenuRef = useTemplateRef<InstanceType<typeof Menu>>("pagesMenu");
const brushPopoverRef = useTemplateRef<InstanceType<typeof Popover>>("brushPopover");

const toolButton = { text: false, iconClass: "size-6" } as const;
const canvasRef = useTemplateRef<HTMLCanvasElement>("canvas");

const colors = ref([
  "#2C2727",
  "#F49AA6",
  "#F897F6",
  "#CF40F3",
  "#555CEE",
  "#40F3E4",
  "#8CE25E",
  "#E9EF37",
  "#F37040",
  "#F34040",
]);

const {
  boardPages: pages,
  boardSelectedPage: selectedPage,
  boardSelectedColor: selectedColor,
  boardBrushSize: brushSize,
  boardHistory: history,
  boardRedoHistory: redoHistory,
} = storeToRefs(callStore);

let signaturePadInstance: SignaturePadInstance = null;
let openStreamTimer: ReturnType<typeof setTimeout> | null = null;
let addPageTimer: ReturnType<typeof setTimeout> | null = null;

// Handle Canvas Resizing correctly to prevent stretching
const resizeCanvas = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  // Prevent resizing to 0x0 if the menu is closed/hidden
  if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) return;

  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  canvas.width = canvas.offsetWidth * ratio;
  canvas.height = canvas.offsetHeight * ratio;
  canvas.getContext("2d")?.scale(ratio, ratio);

  if (signaturePadInstance) {
    if (history.value.length > 0) {
      signaturePadInstance.fromData(history.value);
    } else {
      // Crucial: Re-apply the white background color after resizing
      signaturePadInstance.clear();
    }
  }
};

onMounted(async () => {
  const SignaturePadModule = await import("signature_pad");
  const SignaturePad = SignaturePadModule.default;

  if (canvasRef.value) {
    signaturePadInstance = new SignaturePad(canvasRef.value, {
      minWidth: brushSize.value,
      maxWidth: brushSize.value + 2,
      penColor: selectedColor.value,
      backgroundColor: "rgb(255, 255, 255)",
    });

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    signaturePadInstance.addEventListener("endStroke", () => {
      history.value = signaturePadInstance.toData();
      redoHistory.value = [];
    });
  }
});

onBeforeUnmount(() => {
  stopStreaming();
  window.removeEventListener("resize", resizeCanvas);
  if (openStreamTimer) clearTimeout(openStreamTimer);
  if (addPageTimer) clearTimeout(addPageTimer);
  if (signaturePadInstance) {
    signaturePadInstance.off();
  }
});

watch(brushSize, (newSize) => {
  if (signaturePadInstance) {
    signaturePadInstance.minWidth = newSize;
    signaturePadInstance.maxWidth = newSize + 2;
  }
});

watch(selectedColor, (newColor) => {
  if (signaturePadInstance) {
    signaturePadInstance.penColor = newColor;
  }
});

const saveToFiles = () => {
  if (!signaturePadInstance || signaturePadInstance.isEmpty()) return;

  // Save as JPEG (which relies on the backgroundColor we set to white)
  const dataUrl = signaturePadInstance.toDataURL("image/jpeg");

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `drawing-${Date.now()}.jpg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  openToast(t("board.savedSuccessfully"), "success");
};

const handleAction = (action: string) => {
  if (!signaturePadInstance) return;

  switch (action) {
    case "erase": {
      if (signaturePadInstance.isEmpty()) return;
      const snapshot = signaturePadInstance.toData();
      history.value.push({ isClearAction: true, snapshot });
      signaturePadInstance.clear();
      redoHistory.value = [];
      break;
    }
    case "add-page":
      pages.value[selectedPage.value] = {
        data: signaturePadInstance.toData(),
        history: [...history.value],
        redo: [...redoHistory.value],
      };
      pages.value.push({ data: [], history: [], redo: [] });
      selectedPage.value = pages.value.length - 1;

      signaturePadInstance.clear();

      history.value = [];
      redoHistory.value = [];
      break;
    case "undo":
      if (history.value.length > 0) {
        const lastAction = history.value.pop();
        redoHistory.value.push(lastAction);
        signaturePadInstance.fromData(history.value);
      }
      break;
    case "redo":
      if (redoHistory.value.length > 0) {
        const nextAction = redoHistory.value.pop();
        history.value.push(nextAction);
        signaturePadInstance.fromData(history.value);
      }
      break;
  }
};

const pageItems = computed<MenuItem[]>(() => [
  ...pages.value.map((_, index) => ({
    label: t("board.page", { page: index + 1 }),
    phIcon: "PhFiles",
    command: () => handlePageSelect(String(index + 1)),
  })),
  {
    label: t("board.addPage"),
    phIcon: "PhPlus",
    command: () => handlePageSelect("add-new-page"),
  },
]);

const switchPage = (index: number) => {
  if (!signaturePadInstance || index === selectedPage.value) return;

  // Save current page state before leaving
  pages.value[selectedPage.value] = {
    data: signaturePadInstance.toData(),
    history: [...history.value],
    redo: [...redoHistory.value],
  };

  // Load target page state
  selectedPage.value = index;
  const target = pages.value[index];

  signaturePadInstance.fromData(target.data || []);
  history.value = [...(target.history || [])];
  redoHistory.value = [...(target.redo || [])];
};

const handlePageSelect = (key: string) => {
  if (key === "add-new-page") {
    if (addPageTimer) clearTimeout(addPageTimer);
    addPageTimer = setTimeout(() => {
      addPageTimer = null;
      handleAction("add-page");
    }, 300);
  } else {
    const targetIndex = Number(key) - 1;
    switchPage(targetIndex);
  }
};

const startStreaming = () => {
  if (!canvasRef.value || !signaturePadInstance) return;

  // Type assertion because captureStream is not in standard TS DOM lib types
  const stream = (
    canvasRef.value as unknown as { captureStream(fps: number): MediaStream }
  ).captureStream(30);
  callStore.setScreenStream(stream);

  if (history.value && history.value.length > 0) {
    signaturePadInstance.fromData(history.value);
  } else {
    signaturePadInstance.clear();
  }
};

const stopStreaming = () => {
  callStore.stopScreenShare();
};

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      if (openStreamTimer) clearTimeout(openStreamTimer);
      openStreamTimer = setTimeout(() => {
        openStreamTimer = null;
        resizeCanvas();
        startStreaming();
      }, 50);
    } else {
      callStore.stopScreenShare();
    }
  },
  { immediate: true },
);
</script>
