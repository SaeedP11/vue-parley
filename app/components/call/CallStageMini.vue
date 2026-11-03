<script setup lang="ts">
import { useCallStore } from "~/stores/callStore";
import { formatDuration } from "~/utils/format";
import useLocalI18n, { useDirection } from "~/composables/useLocalI18n";
import { chat } from "@i18n/locales";
import { computed, ref } from "vue";
import { useDraggable, useWindowSize } from "@vueuse/core";
import CallIcon from "./CallIcon.vue";
import CallStageVideo from "./CallStageVideo.vue";

/** The stage's minimized call: a draggable floating card, a compact strip on phones. */
const props = defineProps<{ title: string; beforeEnd?: () => unknown }>();

const { t, n } = useLocalI18n(chat);
const { dir } = useDirection();
const callStore = useCallStore();
const session = callStore.session!;
const { media } = session;

const participants = computed(() => session.participants.value);
const main = computed(() => participants.value.find((person) => !person.isSelf) ?? participants.value[0]);
const stream = computed(() => (main.value?.isSelf ? media.localStream.value : main.value?.camera));
const cameraOn = computed(() =>
  main.value?.isSelf ? media.isVideoOn.value : main.value?.media?.video !== false && !!main.value?.camera?.getVideoTracks().length,
);
const name = computed(() => main.value?.name || t("chat.call.stage.participant"));
const duration = computed(() => formatDuration(Math.max(0, Math.floor(callStore.elapsedTime))));

const card = ref<HTMLElement>();
const { width, height } = useWindowSize();
const { x, y, isDragging } = useDraggable(card, { initialValue: { x: 12, y: 96 }, preventDefault: true });
const style = computed(() => {
  const w = card.value?.offsetWidth ?? 0;
  const h = card.value?.offsetHeight ?? 0;
  return {
    left: `${Math.min(Math.max(0, x.value), Math.max(0, width.value - w))}px`,
    top: `${Math.min(Math.max(0, y.value), Math.max(0, height.value - h))}px`,
  };
});

const endCall = async () => {
  await props.beforeEnd?.();
  callStore.endCall();
};
</script>

<template>
  <div
    ref="card"
    :dir="dir"
    role="region"
    :aria-label="title"
    data-testid="call-stage-mini"
    :style="style"
    class="call-mini vue-chat font-chat-family"
    :class="isDragging && 'call-mini--dragging'"
  >
    <div class="call-mini-head">
      <span class="call-mini-avatar">{{ name.charAt(0) }}</span>
      <div class="call-mini-title">
        <strong>{{ title }}</strong>
        <span>{{ duration }} · {{ t("chat.call.stage.peopleCount", { count: n(participants.length) }) }}</span>
      </div>
      <button
        type="button"
        class="call-mini-btn"
        :aria-label="t('chat.call.stage.returnToCall')"
        data-testid="call-stage-mini-expand"
        @pointerdown.stop
        @click="callStore.maximize()"
      >
        <CallIcon name="fullscreen" class="size-4.5" />
      </button>
      <button
        type="button"
        class="call-mini-btn call-mini-btn--end"
        :aria-label="t('chat.call.controls.endCall')"
        data-testid="call-stage-mini-end"
        @pointerdown.stop
        @click="endCall"
      >
        <CallIcon name="callEnd" class="size-4.5" />
      </button>
    </div>

    <div class="call-mini-video">
      <CallStageVideo v-if="cameraOn" :stream="stream" />
      <span v-else class="call-mini-off">{{ t("chat.call.cameraOff") }}</span>
      <span class="call-mini-name">{{ name }}</span>
    </div>
  </div>
</template>

<style scoped>
.call-mini {
  position: fixed;
  z-index: 9999;
  width: min(22rem, calc(100vw - 1.5rem));
  padding: 0.75rem;
  border-radius: 1.25rem;
  background: #111822;
  color: #fff;
  outline: 1px solid rgb(255 255 255 / 0.12);
  box-shadow: 0 18px 50px rgb(2 6 14 / 0.45);
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.call-mini--dragging {
  cursor: grabbing;
}

.call-mini-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.call-mini-title {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  font-size: 0.75rem;
}

.call-mini-title span {
  color: rgb(255 255 255 / 0.6);
  font-size: 0.6875rem;
}

.call-mini-avatar,
.call-mini-btn {
  display: grid;
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  place-items: center;
  border-radius: 0.75rem;
}

.call-mini-avatar {
  background: #2f4469;
  font-weight: 700;
}

.call-mini-btn {
  background: #2b3a47;
  cursor: pointer;
}

.call-mini-btn--end {
  background: #ef4a5f;
}

.call-mini-video {
  position: relative;
  height: 8rem;
  margin-top: 0.625rem;
  overflow: hidden;
  border-radius: 0.9rem;
  background: #1c2a36;
}

.call-mini-off {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: rgb(255 255 255 / 0.6);
  font-size: 0.75rem;
}

.call-mini-name {
  position: absolute;
  inset-inline-start: 0.5rem;
  bottom: 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-shadow: 0 1px 4px rgb(0 0 0 / 0.6);
}

@media (max-width: 640px) {
  .call-mini {
    padding: 0.5rem;
  }

  .call-mini-video {
    display: none;
  }
}
</style>
