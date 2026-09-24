<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import BCarousel from "~/components/global/BCarousel.vue";
import { useMediaStore } from "~/stores/mediaStore";

const props = withDefaults(
  defineProps<{
    images?: string[];
  }>(),
  {
    images: () => [],
  },
);

const mediaStore = useMediaStore();

const isOpen = ref(false);
const selectedImage = ref(0);

const isDragging = ref(false);
const startY = ref(0);
const translateY = ref(0);

const { width } = useWindowSize();
const isMobile = computed(() => width.value < 768);

watch(
  () => props.images,
  (newImages) => {
    if (selectedImage.value >= newImages.length) {
      selectedImage.value = 0;
    }
  },
);

const downloadImage = async () => {
  if (selectedImage.value === -1 || !props.images[selectedImage.value]) return;
  const url = props.images[selectedImage.value] as string;

  try {
    const blob = await mediaStore.download(url);
    const blobUrl = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = url.split("/").pop() || "dope-image.jpg";
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.error("Failed to download image:", error);
  }
};

const startDrag = (event: MouseEvent | TouchEvent) => {
  if (!isMobile.value) return;
  isDragging.value = true;
  startY.value =
    event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;

  window.addEventListener("mousemove", onDrag);
  window.addEventListener("mouseup", endDrag);
  window.addEventListener("touchmove", onDrag);
  window.addEventListener("touchend", endDrag);
};

const onDrag = (event: MouseEvent | TouchEvent) => {
  if (!isDragging.value) return;
  const currentY =
    event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
  const deltaY = currentY - startY.value;
  translateY.value = deltaY > 0 ? deltaY : 0;
};

const endDrag = () => {
  if (!isDragging.value) return;
  isDragging.value = false;

  if (translateY.value > 100) {
    closeImage();
  } else {
    translateY.value = 0;
  }

  window.removeEventListener("mousemove", onDrag);
  window.removeEventListener("mouseup", endDrag);
  window.removeEventListener("touchmove", onDrag);
  window.removeEventListener("touchend", endDrag);
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Escape" && isOpen.value) closeImage();
  if (
    e.key === "ArrowRight" &&
    isOpen.value &&
    selectedImage.value < props.images.length - 1
  ) {
    selectedImage.value++;
  }
  if (e.key === "ArrowLeft" && isOpen.value && selectedImage.value > 0) {
    selectedImage.value--;
  }
};

const handlePopState = () => {
  if (isOpen.value) isOpen.value = false;
};

const openImage = (index: number) => {
  selectedImage.value = index;
  translateY.value = 0;
  isOpen.value = true;
  window.history.pushState({ viewerOpen: true }, "");
  window.addEventListener("popstate", handlePopState);
};

const closeImage = () => {
  if (!isOpen.value) return;
  isOpen.value = false;
  window.removeEventListener("popstate", handlePopState);
  if (window.history.state?.viewerOpen) {
    window.history.back();
  }
  setTimeout(() => {
    selectedImage.value = -1;
    translateY.value = 0;
  }, 300);
};

const selectImage = (index: number) => {
  selectedImage.value = index;
};

onMounted(() => window.addEventListener("keydown", handleKeyDown));

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
  window.removeEventListener("popstate", handlePopState);
  window.removeEventListener("mousemove", onDrag);
  window.removeEventListener("mouseup", endDrag);
  window.removeEventListener("touchmove", onDrag);
  window.removeEventListener("touchend", endDrag);
  if (isOpen.value && window.history.state?.viewerOpen) {
    window.history.back();
  }
});

defineExpose({
  open: (index: number) => {
    openImage(index);
  },
  close: () => {
    closeImage();
  },
  download: () => {
    downloadImage();
  },
});
</script>
<template>
  <Teleport to="body">
    <div
      data-testid="image-viewer"
      :data-open="isOpen"
      @click.self="closeImage"
      :class="[
        isOpen
          ? ' md:bg-black/10 dark:md:bg-white/10 bg-black dark:bg-white md:backdrop-blur-lg pointer-events-auto visible opacity-100'
          : 'md:bg-black/0 dark:md:bg-white/0 bg-black/0 dark:bg-white/0 backdrop-blur-none pointer-events-none invisible opacity-0',
      ]"
      class="vue-chat transition-all flex flex-col duration-200 ease-in-out fixed top-0 left-0 z-100 w-dvw h-dvh"
    >
      <div
        :style="isMobile ? { transform: `translateY(${translateY}px)` } : {}"
        :class="[
          isDragging
            ? 'transition-none'
            : 'transition-transform duration-300 ease-in-out',
        ]"
        class="w-full h-full flex flex-col"
      >
        <div
          class="w-full p-3 flex justify-between items-center pointer-events-auto"
        >
          <BIcon
            icon="PhX"
            :class="[isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0']"
            class="transition-all duration-200 ease-in-out shrink-0 w-6 h-6 fill-chat-background cursor-pointer md:fill-chat-on-background"
            @click="closeImage"
          />
        </div>

        <div
          @click.self="closeImage"
          @touchstart.self="startDrag"
          @mousedown.self="startDrag"
          class="w-full gap-y-6 flex-1 flex flex-col items-center justify-center overflow-hidden pointer-events-auto"
        >
          <div
            @click.self="closeImage"
            @touchstart.self="startDrag"
            @mousedown.self="startDrag"
            class="w-full shrink-0 flex-1 md:flex-auto md:h-[75vh] flex justify-center items-center"
          >
            <div
              @click.self="closeImage"
              @touchstart.self="startDrag"
              @mousedown.self="startDrag"
              class="transition-all pointer-events-none duration-300 flex items-center justify-center ease-in-out overflow-hidden origin-center w-full"
              :class="[isOpen ? 'h-full opacity-100' : 'h-0 opacity-0']"
            >
              <BCarousel
                v-if="isMobile && images.length > 0 && selectedImage !== -1"
                :items="images"
                v-model="selectedImage"
                class="w-full h-full pointer-events-auto"
                @touchstart.stop
                @mousedown.stop
              >
                <template #slide="{ item }">
                  <BImage
                    no-loading
                    auto-aspect
                    class="w-full md:rounded-xl overflow-hidden min-h-[50vh] min-w-dvw md:min-w-auto md:w-[70vw] h-full md:max-h-[75vh] md:h-[75vh] max-w-dvw md:max-w-[70vw] max-h-[50vh] pointer-events-none"
                    :src="item"
                  />
                </template>
              </BCarousel>

              <BImage
                v-else-if="!isMobile && images.length > 0"
                auto-aspect
                class="w-full md:rounded-xl overflow-hidden min-h-[50vh] min-w-dvw md:min-w-auto md:w-[70vw] h-full md:max-h-[75vh] md:h-[75vh] max-w-dvw md:max-w-[70vw] max-h-[50vh] pointer-events-auto"
                :src="selectedImage !== -1 ? images[selectedImage] : ''"
              />
            </div>
          </div>

          <div
            v-if="images.length > 1"
            class="pb-3 px-4 shrink-0 flex items-center justify-start md:justify-center transition-all duration-200 ease-in-out gap-x-3 w-full max-w-full overflow-x-auto scrollbar-hide snap-x pointer-events-auto"
            :class="[
              isOpen ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0',
            ]"
            @touchstart.stop
            @mousedown.stop
          >
            <div
              @click="selectImage(index)"
              class="cursor-pointer h-20 shrink-0 transition-all duration-200 ease-in-out rounded-xl overflow-hidden aspect-square border-2 snap-center"
              :class="[
                selectedImage === index ? 'border-chat-primary' : 'border-chat-primary/0',
              ]"
              v-for="(image, index) in images"
              :key="index"
            >
              <BImage
                fit="cover"
                :src="image"
                class="w-full h-full pointer-events-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
