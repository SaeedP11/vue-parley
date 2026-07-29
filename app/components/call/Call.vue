<script setup lang="ts">
import { useCallStore } from "~/stores/callStore";
import {
  animate,
  motion,
  useDomRef,
  useMotionValue,
  type ValueAnimationTransition,
} from "motion-v";
import useLocalI18n, { useDirection } from "~/composables/useLocalI18n";
import { chat } from "@i18n/locales";
import useCall from "~/composables/useCall";

const callStore = useCallStore();

const x = useMotionValue(0);
const y = useMotionValue(0);
const minimizedWebcamRef = useDomRef();
const constraintsRef = ref();

const minimizedRef = useDomRef();
const bodyRef = ref<HTMLElement | null>(null);
const cameraPopup = ref<{ open: () => void; close: () => void } | null>(null);
const { t, locale } = useLocalI18n(chat);
const { dir } = useDirection();
const dragging = ref(false);

const {
  toggleVideoPause,
  toggleRemote,
  participantCount,
  endCall,
  toggleFullscreen,
  toggleFlashlight,
  toggleScreenShare,
  toggleAudio,
  toggleVideo,
  switchCamera,
  isFlashlightSupported,
  tileCount,
  isAudioOn,
  isVideoOn,
  isFlashlightOn,
  isFullscreen,
  isScreenSharing,
  showControls,
  resetControlsTimeout,
  cameras,
  videoPaused,
  localVideo,
  localScreen,
  remoteParents,
  remoteRefs,
  remoteScreens,
  remoteScreenRefs,
  remoteVideos,
} = useCall();

onMounted(() => {
  bodyRef.value = document.body;
});

async function handleDragEnd(parent: any, el: any, margin: number = 0) {
  if (!parent || !el) return;

  const p = parent.getBoundingClientRect();
  const r = el.getBoundingClientRect();

  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;

  const corners = [
    { name: "tl", x: p.left, y: p.top },
    { name: "tr", x: p.right, y: p.top },
    { name: "bl", x: p.left, y: p.bottom },
    { name: "br", x: p.right, y: p.bottom },
  ];

  const nearest = corners.reduce((a, b) =>
    Math.hypot(cx - b.x, cy - b.y) < Math.hypot(cx - a.x, cy - a.y) ? b : a,
  );

  const isRtl = dir.value === "rtl";

  let targetX =
    nearest.x -
    (isRtl ? p.right : p.left) -
    (nearest.name.includes(isRtl ? "l" : "r") ? r.width * (isRtl ? -1 : 1) : 0);

  let targetY = nearest.y - p.top - (nearest.name.includes("b") ? r.height : 0);

  if (margin !== 0) {
    if (nearest.name === "tl") {
      targetX += margin;
      targetY += margin;
    } else if (nearest.name === "tr") {
      targetX -= margin;
      targetY += margin;
    } else if (nearest.name === "bl") {
      targetX += margin;
      targetY -= margin;
    } else if (nearest.name === "br") {
      targetX -= margin;
      targetY -= margin;
    }
  }

  animate(x, targetX, { duration: 0.28 });
  animate(y, targetY, { duration: 0.28 });
}

watch(
  () => callStore.isMinimized,
  (isMinimized) => {
    if (!isMinimized) {
      animate(x, 0);
      animate(y, 0);
    } else
      nextTick(() => {
        handleDragEnd(bodyRef.value, minimizedRef.value, 16);
      });
  },
  { immediate: true },
);

const transition: ValueAnimationTransition = {
  type: "spring",
  bounce: 0,
  duration: 0.5,
};
</script>

<template>
  <motion.div
    v-if="callStore.isActive && callStore.isMinimized"
    ref="minimizedRef"
    :style="{ x, y }"
    layout
    layout-id="webcam"
    :transition="transition"
    drag
    :drag-constraints="bodyRef!"
    :drag-elastic="0.2"
    class="absolute z-[60] flex h-40 w-70 cursor-move flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black-600 shadow-floating touch-none"
    @drag-end="
      () => {
        dragging = false;
        handleDragEnd(bodyRef, minimizedRef, 16);
      }
    "
    @drag-start="() => (dragging = true)"
    @click="() => !dragging && callStore.maximize()"
  >
    <div
      class="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
    />

    <div class="relative h-full w-full">
      <div
        class="absolute top-3 right-3 left-3 z-10 flex items-center justify-between"
      >
        <div
          class="flex items-center gap-x-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm"
        >
          <div class="relative">
            <div
              class="h-2.5 w-2.5 animate-pulse rounded-full bg-diamond-error"
            />
            <div
              class="absolute inset-0 h-2.5 w-2.5 animate-ping rounded-full bg-diamond-error/30"
            />
          </div>
          <span class="text-label-sm text-white/90 select-none">{{
            t("Call active")
          }}</span>
          <div class="flex -space-x-1">
            <div
              class="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400"
              style="animation-delay: 0s"
            />
            <div
              class="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400"
              style="animation-delay: 0.2s"
            />
            <div
              class="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400"
              style="animation-delay: 0.4s"
            />
          </div>
        </div>

        <div
          class="flex aspect-square w-9 cursor-pointer items-center justify-center rounded-full bg-diamond-error transition-all duration-200 ease-in-out hover:scale-110"
          @click.stop="callStore.endCall"
        >
          <BIcon icon="PhPhoneX" class="h-4 w-4 fill-white" />
        </div>
      </div>

      <div
        class="absolute right-3 bottom-3 left-3 z-10 flex items-center justify-between"
      >
        <div class="flex items-center gap-2">
          <div
            class="flex items-center gap-x-1.5 rounded-full bg-black/50 px-2.5 py-1 backdrop-blur-sm"
          >
            <BIcon icon="PhUsers" class="h-3 w-3 fill-white/70" />
            <span class="text-label-sm text-white/90 select-none">{{
              participantCount
            }}</span>
          </div>

          <div v-if="!isAudioOn || !isVideoOn" class="flex gap-1">
            <div
              v-if="!isAudioOn"
              class="flex h-7 w-7 items-center justify-center rounded-full bg-diamond-error"
            >
              <BIcon icon="PhMicrophoneSlash" class="h-3 w-3 fill-white" />
            </div>
            <div
              v-if="!isVideoOn"
              class="flex h-7 w-7 items-center justify-center rounded-full bg-diamond-error"
            >
              <BIcon icon="PhVideoCameraSlash" class="h-3 w-3 fill-white" />
            </div>
          </div>
        </div>

        <div
          class="flex aspect-square w-9 cursor-pointer items-center justify-center rounded-full bg-black/50 backdrop-blur-md transition-all duration-200 ease-in-out hover:scale-105 hover:bg-black/80"
          @click.stop="callStore.maximize()"
        >
          <BIcon icon="PhResize" class="h-4 w-4 fill-white" />
        </div>
      </div>
    </div>
  </motion.div>

  <div
    v-show="callStore.isActive && !callStore.isMinimized"
    class="fixed inset-0 z-[60] flex h-full w-full flex-col bg-diamond-black"
  >
    <!-- Header -->
    <div
      v-if="!callStore.isMinimized"
      class="flex h-16 items-center justify-between px-4 transition-all duration-300 sm:h-20"
      :class="showControls ? 'opacity-100' : 'opacity-0'"
      @mouseenter="resetControlsTimeout"
      @mousemove="resetControlsTimeout"
    >
      <div class="flex items-center gap-x-4">
        <div class="hidden select-none text-label-lg text-white md:block">
          {{ t("Behayand Meeting") }}
        </div>
        <div class="flex items-center gap-x-2 text-white text-body-sm">
          <BIcon icon="PhUsers" class="h-4 w-4 fill-white" />
          <span
            >{{ participantCount }}
            {{
              participantCount > 1 ? t("participants") : t("participant")
            }}</span
          >
        </div>
      </div>
      <div class="flex items-center gap-x-4.5">
        <div
          class="flex h-6 items-center justify-center rounded-full bg-diamond-error px-2 text-white select-none"
        >
          <div class="text-body-sm">
            {{
              new Date().toLocaleTimeString(locale, {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })
            }}
          </div>
        </div>
        <div
          class="flex aspect-square w-9 cursor-pointer items-center justify-center rounded-full bg-black-500 transition-all duration-200 ease-in-out sm:w-12"
          @click="callStore.minimize"
        >
          <BIcon icon="PhCaretDown" class="h-4 w-4 fill-white sm:h-6 sm:w-6" />
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div
      class="relative grid w-full overflow-hidden"
      :class="callStore.isMinimized ? 'h-full p-0' : 'h-full p-4'"
      @mousemove="resetControlsTimeout"
    >
      <div
        v-show="tileCount"
        class="grid h-full min-h-0 w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]"
      >
        <div
          v-show="isScreenSharing"
          :ref="(el) => (remoteParents[`self_screen`] = el as any)"
          class="group relative flex aspect-video h-full w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-chat-primary/0 bg-black-600 p-2"
        >
          <video
            ref="localScreen"
            autoplay
            muted
            playsinline
            class="absolute inset-0 z-0 h-full w-full object-cover"
          />

          <div class="absolute bottom-3 left-3 z-20 flex items-center gap-x-2">
            <div
              class="rounded bg-black-500 px-2 py-1 text-label-sm text-white select-none"
            >
              {{ t("Your Presentation") }}
            </div>
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full bg-black-500"
            >
              <BIcon icon="PhMonitor" class="h-4 w-4 fill-white" />
            </div>
            <div
              class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black-500 transition-all duration-200 ease-in-out"
              @click="toggleVideoPause('self_screen', localScreen as any)"
            >
              <BIcon
                :icon="videoPaused['self_screen'] ? 'PhPlay' : 'PhPause'"
                class="h-4 w-4 fill-white"
              />
            </div>
            <div
              class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black-500 transition-all duration-200 ease-in-out"
              @click="toggleRemote(`self_screen`)"
            >
              <BIcon
                :icon="isFullscreen ? 'PhCornersIn' : 'PhFrameCorners'"
                class="h-4 w-4 fill-white"
              />
            </div>
          </div>
        </div>
        <div
          v-for="(stream, remoteUserId) in remoteVideos"
          :key="`remote-${remoteUserId}`"
          :ref="
            (el) => (remoteParents[`remote_video_${remoteUserId}`] = el as any)
          "
          class="group relative flex aspect-video h-full w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-chat-primary/0 bg-black-600 p-2"
        >
          <video
            :ref="
              (el) => {
                if (el) remoteRefs[remoteUserId] = el as any;
              }
            "
            autoplay
            playsinline
            class="absolute inset-0 z-0 h-full w-full object-cover"
          />

          <div class="absolute bottom-2 left-2 z-20 flex items-center gap-x-1">
            <div
              class="rounded bg-black-500 px-1.5 py-0.5 text-label-sm text-white select-none"
            >
              {{ stream.name.slice(0, 15) }}
            </div>
            <div
              class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black-500 transition-all duration-200 ease-in-out"
              @click="
                toggleVideoPause(
                  `remote_video_${remoteUserId}`,
                  remoteRefs[remoteUserId] as any,
                )
              "
            >
              <BIcon
                :icon="
                  videoPaused[`remote_video_${remoteUserId}`]
                    ? 'PhPlay'
                    : 'PhPause'
                "
                class="h-4 w-4 fill-white"
              />
            </div>
            <div
              class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black-500 transition-all duration-200 ease-in-out"
              @click="toggleRemote(`remote_video_${remoteUserId}`)"
            >
              <BIcon
                :icon="isFullscreen ? 'PhCornersIn' : 'PhFrameCorners'"
                class="h-4 w-4 fill-white"
              />
            </div>
          </div>
        </div>

        <div
          v-for="(stream, remoteUserId) in remoteScreens"
          :key="`remote-screen-${remoteUserId}`"
          :ref="
            (el) => (remoteParents[`remote_screen_${remoteUserId}`] = el as any)
          "
          class="group relative flex aspect-video h-full w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-chat-primary/0 bg-black-600 p-2"
        >
          <video
            :ref="
              (el) => {
                if (el) remoteScreenRefs[remoteUserId] = el as any;
              }
            "
            autoplay
            muted
            playsinline
            class="absolute inset-0 z-0 h-full w-full object-cover"
          />

          <div class="absolute bottom-3 left-3 z-20 flex items-center gap-x-2">
            <div
              class="rounded bg-black-500 px-2 py-1 text-label-sm text-white select-none"
            >
              {{ t("Presentation of") }} {{ stream.name.slice(0, 15) }}
            </div>
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full bg-black-500"
            >
              <BIcon icon="PhMonitor" class="h-4 w-4 fill-white" />
            </div>
            <div
              class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black-500 transition-all duration-200 ease-in-out"
              @click="
                toggleVideoPause(
                  `remote_screen_${remoteUserId}`,
                  remoteScreenRefs[remoteUserId] || null,
                )
              "
            >
              <BIcon
                :icon="
                  videoPaused[`remote_screen_${remoteUserId}`]
                    ? 'PhPlay'
                    : 'PhPause'
                "
                class="h-4 w-4 fill-white"
              />
            </div>
            <div
              class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black-500 transition-all duration-200 ease-in-out"
              @click="toggleRemote(`remote_screen_${remoteUserId}`)"
            >
              <BIcon
                :icon="isFullscreen ? 'PhCornersIn' : 'PhFrameCorners'"
                class="h-4 w-4 fill-white"
              />
            </div>
          </div>
        </div>
      </div>

      <div
        ref="constraintsRef"
        class="flex min-h-0"
        :class="[tileCount && 'absolute inset-0 m-4']"
      >
        <motion.div
          ref="minimizedWebcamRef"
          :style="{ x, y }"
          layout
          layout-id="webcam"
          :transition="transition"
          :drag="!!tileCount"
          :drag-constraints="tileCount && constraintsRef!"
          :drag-elastic="0.2"
          class="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-chat-primary/0 bg-black-600 p-2"
          :class="[
            tileCount
              ? 'absolute z-10 h-[132px] w-[236px] cursor-move'
              : 'h-full w-full',
          ]"
          @drag-end="handleDragEnd(constraintsRef, minimizedWebcamRef)"
        >
          <video
            ref="localVideo"
            autoplay
            muted
            playsinline
            class="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
          />

          <div
            class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"
          />

          <div class="absolute bottom-3 left-3 z-20 flex items-center gap-x-2">
            <div
              class="rounded bg-black-500 px-2 py-1 text-label-sm text-white select-none"
            >
              {{ t("You") }}
            </div>
            <div
              v-if="!isAudioOn"
              class="flex h-7 w-7 items-center justify-center rounded-full bg-diamond-error"
            >
              <BIcon icon="PhMicrophoneSlash" class="h-3 w-3 fill-white" />
            </div>
            <div
              class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black-500 transition-all duration-200 ease-in-out"
              @click="toggleVideoPause('self_cam', localVideo as any)"
            >
              <BIcon
                :icon="videoPaused['self_cam'] ? 'PhPlay' : 'PhPause'"
                class="h-4 w-4 fill-white"
              />
            </div>
            <div
              class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black-500 transition-all duration-200 ease-in-out"
              @click="toggleRemote('self_cam', minimizedWebcamRef)"
            >
              <BIcon
                :icon="isFullscreen ? 'PhCornersIn' : 'PhFrameCorners'"
                class="h-4 w-4 fill-white"
              />
            </div>
          </div>

          <div
            v-if="!isVideoOn"
            class="absolute inset-0 flex items-center justify-center bg-black-600"
          >
            <div class="text-center text-white">
              <div
                class="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-chat-primary"
              >
                <span class="text-title-lg font-semibold">{{ t("You") }}</span>
              </div>
              <p class="text-label-md">{{ t("Camera is off") }}</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>

    <!-- Footer Controls -->
    <div
      v-if="!callStore.isMinimized"
      class="flex h-21 w-full items-center justify-center gap-x-1.5 border-t border-t-[#2C2C2E] bg-black-600 transition-all duration-300 sm:gap-x-3"
      :class="showControls ? 'opacity-100' : 'opacity-0'"
      @mouseenter="resetControlsTimeout"
      @mousemove="resetControlsTimeout"
    >
      <div
        class="flex aspect-square w-9 cursor-pointer items-center justify-center rounded-full transition-all duration-200 ease-in-out sm:w-12"
        :class="[isAudioOn ? 'bg-black-500' : 'bg-white']"
        @click="toggleAudio"
      >
        <BIcon
          :icon="isAudioOn ? 'PhMicrophone' : 'PhMicrophoneSlash'"
          class="h-4 w-4 sm:h-6 sm:w-6"
          :class="[isAudioOn ? 'fill-white' : 'fill-black-500']"
        />
      </div>

      <div
        class="flex aspect-square w-9 cursor-pointer items-center justify-center rounded-full transition-all duration-200 ease-in-out sm:w-12"
        :class="[isVideoOn ? 'bg-black-500' : 'bg-white']"
        @click="toggleVideo"
      >
        <BIcon
          :icon="isVideoOn ? 'PhVideo' : 'PhVideoCameraSlash'"
          class="h-4 w-4 sm:h-6 sm:w-6"
          :class="[isVideoOn ? 'fill-white' : 'fill-black-500']"
        />
      </div>

      <template v-if="cameras.length > 1">
        <div
          class="flex aspect-square w-9 cursor-pointer items-center justify-center rounded-full bg-black-500 transition-all duration-200 ease-in-out sm:w-12"
          @click="cameraPopup?.open()"
        >
          <BIcon icon="PhCaretUp" class="h-4 w-4 fill-white sm:h-6 sm:w-6" />
        </div>
        <BPopup ref="cameraPopup" title="Available Cameras" has-close>
          <ul class="relative z-20">
            <li v-for="camera in cameras" :key="camera.deviceId">
              <button
                type="button"
                class="w-full cursor-pointer p-2"
                @click="switchCamera(camera.deviceId)"
              >
                {{ camera.label || "Camera " + camera.deviceId }}
              </button>
            </li>
          </ul>
        </BPopup>
      </template>

      <div
        class="flex aspect-square w-9 cursor-pointer items-center justify-center rounded-full transition-all duration-200 ease-in-out sm:w-12"
        :class="[isScreenSharing ? 'bg-white' : 'bg-black-500']"
        @click="toggleScreenShare"
      >
        <BIcon
          icon="PhMonitorArrowUp"
          class="h-4 w-4 sm:h-6 sm:w-6"
          :class="[isScreenSharing ? 'fill-black-500' : 'fill-white']"
        />
      </div>

      <div
        class="flex aspect-square w-9 cursor-pointer items-center justify-center rounded-full bg-black-500 transition-all duration-200 ease-in-out sm:w-12"
        @click="toggleFullscreen"
      >
        <BIcon
          :icon="isFullscreen ? 'PhCornersIn' : 'PhFrameCorners'"
          class="h-4 w-4 fill-white sm:h-6 sm:w-6"
        />
      </div>

      <div
        v-if="isFlashlightSupported"
        class="flex aspect-square w-9 cursor-pointer items-center justify-center rounded-full transition-all duration-200 ease-in-out sm:w-12"
        :class="[isFlashlightOn ? 'bg-white' : 'bg-black-500']"
        @click="toggleFlashlight"
      >
        <BIcon
          :icon="isFlashlightOn ? 'PhLightning' : 'PhLightningSlash'"
          class="h-4 w-4 sm:h-6 sm:w-6"
          :class="[isFlashlightOn ? 'fill-black-500' : 'fill-white']"
        />
      </div>

      <div
        class="flex aspect-square w-12 cursor-pointer items-center justify-center rounded-full bg-diamond-error sm:w-15"
        @click="endCall"
      >
        <BIcon icon="PhPhoneX" class="h-5 w-5 fill-white sm:h-7 sm:w-7" />
      </div>
    </div>
  </div>
</template>
