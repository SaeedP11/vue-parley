<script setup lang="ts">
import { useCallStore } from "~/stores/callStore";
import useLocalI18n, { useDirection } from "~/composables/useLocalI18n";
import { chat } from "@i18n/locales";
import useCall from "~/composables/useCall";
import { useDraggable, useWindowSize } from "@vueuse/core";
import { ref, computed, watch, onMounted, nextTick } from "vue";
import Button from "primevue/button";
import Listbox from "primevue/listbox";
import IconButton from "~/components/general/IconButton.vue";
import ResponsiveDialog from "~/components/general/ResponsiveDialog.vue";

const callStore = useCallStore();

// ارجاع به المان مینیمایز شده برای VueUse
const minimizedRef = ref<HTMLElement | null>(null);
const bodyRef = ref<HTMLElement | null>(null);
const cameraPickerOpen = ref(false);
const { t, locale } = useLocalI18n(chat);
const { dir } = useDirection();

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
  localStream,
  localVideo,
  localScreen,
  remoteParents,
  remoteRefs,
  remoteScreens,
  remoteScreenRefs,
  remoteVideos,
} = useCall();

const pickCamera = (deviceId: string) => {
  cameraPickerOpen.value = false;
  switchCamera(deviceId);
};

// The call screen is dark whatever the host's colour scheme, so its round controls use fixed
// translucent tokens instead of the theme's secondary and contrast colours.
const translucent = {
  background: "rgb(255 255 255 / 0.12)",
  hoverBackground: "rgb(255 255 255 / 0.2)",
  activeBackground: "rgb(255 255 255 / 0.28)",
  borderColor: "transparent",
  hoverBorderColor: "transparent",
  activeBorderColor: "transparent",
  color: "#ffffff",
  hoverColor: "#ffffff",
  activeColor: "#ffffff",
};
const lit = {
  background: "#ffffff",
  hoverBackground: "rgb(255 255 255 / 0.9)",
  activeBackground: "rgb(255 255 255 / 0.8)",
  borderColor: "#ffffff",
  hoverBorderColor: "#ffffff",
  activeBorderColor: "#ffffff",
  color: "#151823",
  hoverColor: "#151823",
  activeColor: "#151823",
};
const callScheme = { root: { secondary: translucent, contrast: lit } };
const callButtonDt = { colorScheme: { light: callScheme, dark: callScheme } };

const footerButton = {
  dt: callButtonDt,
  text: false,
  size: "large",
  iconClass: "size-6",
} as const;

// --- PIP BACKGROUND VIDEO ---
// در حالت مینیمایز، پس‌زمینه PIP یک ویدیوی زنده است: اگر کاربر ریموت فعال باشد
// استریم آن کاربر نمایش داده می‌شود؛ در غیر این صورت استریم محلی کاربر.
const pipVideoRef = ref<HTMLVideoElement | null>(null);
const activeRemoteIndex = ref(0);

const remoteVideoEntries = computed(() => Object.entries(remoteVideos.value));
const hasRemoteVideos = computed(() => remoteVideoEntries.value.length > 0);
const activeRemoteUserId = computed<string | null>(() => {
  const entries = remoteVideoEntries.value;
  if (entries.length === 0) return null;
  return entries[activeRemoteIndex.value % entries.length][0];
});

const pipStream = computed<MediaStream | null>(() => {
  if (hasRemoteVideos.value) {
    const id = activeRemoteUserId.value;
    return id ? (remoteVideos.value[id]?.stream ?? null) : null;
  }
  return localStream.value ?? null;
});

function cycleRemote() {
  const count = remoteVideoEntries.value.length;
  if (count === 0) return;
  activeRemoteIndex.value = (activeRemoteIndex.value + 1) % count;
}

watch(
  [pipStream, () => callStore.isMinimized],
  async () => {
    await nextTick();
    const el = pipVideoRef.value;
    if (!el) return;
    const stream = pipStream.value;
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
      el.play().catch(() => {});
    } else if (!stream && el.srcObject) {
      el.srcObject = null;
    }
  },
  { immediate: true },
);

onMounted(() => {
  bodyRef.value = document.body;
});

// --- DRAG LOGIC WITH BOUNDARIES & CORNER SNAPPING ---
const { width: windowWidth, height: windowHeight } = useWindowSize();

const PIP_WIDTH = 280; // معادل w-70 در Tailwind
const PIP_HEIGHT = 160; // معادل h-40 در Tailwind
const PADDING = 16;

// ۱. راه‌اندازی Draggable روی عنصر minimizedRef
const { x, y, isDragging } = useDraggable(minimizedRef, {
  initialValue: {
    x:
      typeof window !== "undefined"
        ? window.innerWidth - PIP_WIDTH - PADDING
        : PADDING,
    y:
      typeof window !== "undefined"
        ? window.innerHeight - PIP_HEIGHT - PADDING
        : PADDING,
  },
  // غیرفعال کردن درگ در صورتی که کامپوننت مینیمایز نباشد
  disabled: computed(() => !callStore.isMinimized),
});

// ۲. اسنپ شدن به نزدیک‌ترین گوشه بعد از رها کردن کلیک/لمس
watch(isDragging, (dragging) => {
  if (!dragging && callStore.isMinimized) {
    const maxX = windowWidth.value - PIP_WIDTH - PADDING;
    const maxY = windowHeight.value - PIP_HEIGHT - PADDING;

    // جهت RTL روی گوشه پیش‌فرض اولیه تاثیر می‌گذارد
    const isRtl = dir.value === "rtl";

    // پیدا کردن نزدیک‌ترین گوشه بر اساس موقعیت فعلی درگ شده
    const targetX = x.value < windowWidth.value / 2 ? PADDING : maxX;
    const targetY = y.value < windowHeight.value / 2 ? PADDING : maxY;

    x.value = targetX;
    y.value = targetY;
  }
});

// بازنشانی موقعیت به گوشه مناسب در هنگام مینیمایز شدن مجدد
watch(
  () => callStore.isMinimized,
  (isMinimized) => {
    if (isMinimized) {
      nextTick(() => {
        const isRtl = dir.value === "rtl";
        x.value = isRtl ? PADDING : windowWidth.value - PIP_WIDTH - PADDING;
        y.value = windowHeight.value - PIP_HEIGHT - PADDING;
      });
    }
  },
  { immediate: true },
);

// ۳. محدود کردن مختصات در محدوده مانیتور و خروجی استایل
const clampedStyle = computed(() => {
  if (!callStore.isMinimized) return {};

  const maxX = windowWidth.value - PIP_WIDTH - PADDING;
  const maxY = windowHeight.value - PIP_HEIGHT - PADDING;

  const safeX = Math.max(PADDING, Math.min(x.value, maxX));
  const safeY = Math.max(PADDING, Math.min(y.value, maxY));

  return {
    left: `${safeX}px`,
    top: `${safeY}px`,
  };
});
</script>

<template>
  <!-- استفاده از div معمولی به جای motion.div و اعمال پوزیشن با clampedStyle -->
  <div
    v-if="callStore.isActive && callStore.isMinimized"
    ref="minimizedRef"
    data-testid="call-pip"
    :style="clampedStyle"
    class="vue-chat fixed w-70 h-40 bg-black-600 rounded-2xl shadow-floating z-9999 overflow-hidden border border-white/10 flex flex-col items-center justify-center cursor-move touch-none"
    :class="[!isDragging ? 'transition-all duration-300 ease-out' : '']"
  >
    <video
      ref="pipVideoRef"
      muted
      autoplay
      playsinline
      class="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
    />
    <div
      class="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
    />
    <div
      class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20"
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

        <IconButton
          icon="PhPhoneX"
          :label="t('chat.call.controls.endCall')"
          severity="danger"
          :text="false"
          icon-class="size-4"
          data-testid="call-pip-end"
          @pointerdown.stop
          @click.stop="endCall"
        />
      </div>

      <div
        class="absolute right-3 bottom-3 left-3 z-10 flex items-center justify-between"
      >
        <div class="flex items-center gap-2">
          <Button
            :label="String(participantCount)"
            :aria-label="t('chat.call.controls.nextParticipant')"
            :disabled="!hasRemoteVideos"
            :dt="callButtonDt"
            severity="secondary"
            size="small"
            rounded
            @pointerdown.stop
            @click.stop="cycleRemote"
          >
            <template #icon>
              <BIcon icon="PhUsers" class="size-3" />
            </template>
          </Button>

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

        <IconButton
          icon="PhResize"
          :label="t('chat.call.controls.maximize')"
          :dt="callButtonDt"
          :text="false"
          icon-class="size-4"
          data-testid="call-maximize"
          @pointerdown.stop
          @click.stop="callStore.maximize()"
        />
      </div>
    </div>
  </div>

  <div
    v-show="callStore.isActive && !callStore.isMinimized"
    data-testid="call-view"
    class="vue-chat fixed inset-0 z-[60] flex h-full w-full flex-col bg-diamond-black"
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
          <span data-testid="call-participants"
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
        <IconButton
          icon="PhCaretDown"
          :label="t('chat.call.controls.minimize')"
          v-bind="footerButton"
          data-testid="call-minimize"
          @click="callStore.minimize"
        />
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
            <IconButton
              :icon="videoPaused['self_screen'] ? 'PhPlay' : 'PhPause'"
              :label="videoPaused['self_screen'] ? t('chat.call.controls.playVideo') : t('chat.call.controls.pauseVideo')"
              :dt="callButtonDt"
              :text="false"
              icon-class="size-4"
              @click="toggleVideoPause('self_screen', localScreen as any)"
            />
            <IconButton
              :icon="isFullscreen ? 'PhCornersIn' : 'PhFrameCorners'"
              :label="

                isFullscreen

                  ? t('chat.call.controls.exitFullscreen')

                  : t('chat.call.controls.fullscreen')

              "
              :dt="callButtonDt"
              :text="false"
              icon-class="size-4"
              @click="toggleRemote(`self_screen`)"
            />
          </div>
        </div>
        <div
          v-for="(stream, remoteUserId) in remoteVideos"
          :key="`remote-${remoteUserId}`"
          data-testid="call-remote-video"
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
            <IconButton
              :icon="videoPaused[`remote_video_${remoteUserId}`] ? 'PhPlay' : 'PhPause'"
              :label="
                videoPaused[`remote_video_${remoteUserId}`]
                  ? t('chat.call.controls.playVideo')
                  : t('chat.call.controls.pauseVideo')
              "
              :dt="callButtonDt"
              :text="false"
              icon-class="size-4"
              @click="
                toggleVideoPause(
                  `remote_video_${remoteUserId}`,
                  remoteRefs[remoteUserId] as any,
                )
              "
            />
            <IconButton
              :icon="isFullscreen ? 'PhCornersIn' : 'PhFrameCorners'"
              :label="

                isFullscreen

                  ? t('chat.call.controls.exitFullscreen')

                  : t('chat.call.controls.fullscreen')

              "
              :dt="callButtonDt"
              :text="false"
              icon-class="size-4"
              @click="toggleRemote(`remote_video_${remoteUserId}`)"
            />
          </div>
        </div>

        <div
          v-for="(stream, remoteUserId) in remoteScreens"
          :key="`remote-screen-${remoteUserId}`"
          data-testid="call-remote-screen"
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
            <IconButton
              :icon="videoPaused[`remote_screen_${remoteUserId}`] ? 'PhPlay' : 'PhPause'"
              :label="
                videoPaused[`remote_screen_${remoteUserId}`]
                  ? t('chat.call.controls.playVideo')
                  : t('chat.call.controls.pauseVideo')
              "
              :dt="callButtonDt"
              :text="false"
              icon-class="size-4"
              @click="
                toggleVideoPause(
                  `remote_screen_${remoteUserId}`,
                  remoteScreenRefs[remoteUserId] || null,
                )
              "
            />
            <IconButton
              :icon="isFullscreen ? 'PhCornersIn' : 'PhFrameCorners'"
              :label="

                isFullscreen

                  ? t('chat.call.controls.exitFullscreen')

                  : t('chat.call.controls.fullscreen')

              "
              :dt="callButtonDt"
              :text="false"
              icon-class="size-4"
              @click="toggleRemote(`remote_screen_${remoteUserId}`)"
            />
          </div>
        </div>
      </div>

      <!-- وب‌کم محلی (وقتی هنوز کارهای دیگر در صفحه فعال است) -->
      <div class="flex min-h-0" :class="[tileCount && 'absolute inset-0 m-4']">
        <div
          v-if="!callStore.isMinimized"
          class="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-chat-primary/0 bg-black-600 p-2"
          :class="[
            tileCount ? 'absolute z-10 h-[132px] w-[236px]' : 'h-full w-full',
          ]"
        >
          <video
            ref="localVideo"
            data-testid="call-local-video"
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
            <IconButton
              :icon="videoPaused['self_cam'] ? 'PhPlay' : 'PhPause'"
              :label="videoPaused['self_cam'] ? t('chat.call.controls.playVideo') : t('chat.call.controls.pauseVideo')"
              :dt="callButtonDt"
              :text="false"
              icon-class="size-4"
              @click="toggleVideoPause('self_cam', localVideo as any)"
            />
            <IconButton
              :icon="isFullscreen ? 'PhCornersIn' : 'PhFrameCorners'"
              :label="

                isFullscreen

                  ? t('chat.call.controls.exitFullscreen')

                  : t('chat.call.controls.fullscreen')

              "
              :dt="callButtonDt"
              :text="false"
              icon-class="size-4"
              @click="toggleRemote('self_cam')"
            />
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
        </div>
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
      <IconButton
        :icon="isAudioOn ? 'PhMicrophone' : 'PhMicrophoneSlash'"
        :label="isAudioOn ? t('chat.call.controls.mute') : t('chat.call.controls.unmute')"
        :severity="isAudioOn ? 'secondary' : 'contrast'"
        v-bind="footerButton"
        data-testid="call-toggle-audio"
        :data-active="isAudioOn"
        @click="toggleAudio"
      />

      <IconButton
        :icon="isVideoOn ? 'PhVideo' : 'PhVideoCameraSlash'"
        :label="isVideoOn ? t('chat.call.controls.cameraOff') : t('chat.call.controls.cameraOn')"
        :severity="isVideoOn ? 'secondary' : 'contrast'"
        v-bind="footerButton"
        data-testid="call-toggle-video"
        :data-active="isVideoOn"
        @click="toggleVideo"
      />

      <template v-if="cameras.length > 1">
        <IconButton
          icon="PhCaretUp"
          :label="t('chat.call.controls.chooseCamera')"
          v-bind="footerButton"
          @click="cameraPickerOpen = true"
        />
        <ResponsiveDialog
          v-model:visible="cameraPickerOpen"
          :header="t('chat.call.controls.cameras')"
          width="24rem"
        >
          <Listbox
            :options="cameras"
            option-value="deviceId"
            :option-label="(camera: MediaDeviceInfo) => camera.label || `Camera ${camera.deviceId}`"
            class="w-full"
            @change="(event) => pickCamera(event.value)"
          />
        </ResponsiveDialog>
      </template>

      <IconButton
        icon="PhMonitorArrowUp"
        :label="isScreenSharing ? t('chat.call.controls.stopSharing') : t('chat.call.controls.shareScreen')"
        :severity="isScreenSharing ? 'contrast' : 'secondary'"
        v-bind="footerButton"
        data-testid="call-toggle-screen"
        :data-active="isScreenSharing"
        @click="toggleScreenShare"
      />

      <IconButton
        :icon="isFullscreen ? 'PhCornersIn' : 'PhFrameCorners'"
        :label="

          isFullscreen

            ? t('chat.call.controls.exitFullscreen')

            : t('chat.call.controls.fullscreen')

        "
        v-bind="footerButton"
        @click="toggleFullscreen"
      />

      <IconButton
        v-if="isFlashlightSupported"
        :icon="isFlashlightOn ? 'PhLightning' : 'PhLightningSlash'"
        :label="t('chat.call.controls.flashlight')"
        :severity="isFlashlightOn ? 'contrast' : 'secondary'"
        v-bind="footerButton"
        @click="toggleFlashlight"
      />

      <IconButton
        icon="PhPhoneX"
        :label="t('chat.call.controls.endCall')"
        severity="danger"
        :text="false"
        size="large"
        icon-class="size-6"
        data-testid="call-end"
        @click="endCall"
      />
    </div>
  </div>
</template>
