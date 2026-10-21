<script setup lang="ts">
/**
 * Everyone in the call, in a drawer from the inline end (the right, or the left in RTL): their
 * initial, name, microphone and camera, and whether they can't be reached (FR-013).
 */
import { computed } from "vue";
import Avatar from "primevue/avatar";
import Drawer from "primevue/drawer";
import useLocalI18n, { useDirection } from "~/composables/useLocalI18n";
import { chat } from "@i18n/locales";
import type { Participant } from "~/composables/call/session";
import CallButton from "./CallButton.vue";
import CallIcon from "./CallIcon.vue";
import { callButtonDt, callDrawerDt, focusRing } from "./tokens";

defineProps<{ participants: Participant[] }>();
const visible = defineModel<boolean>("visible", { default: false });

const { t } = useLocalI18n(chat);
const { dir } = useDirection();
const position = computed(() => (dir.value === "rtl" ? "left" : "right"));

const nameOf = (p: Participant) => p.name || (p.isSelf ? t("chat.call.you") : "");
const initialOf = (p: Participant) => (nameOf(p) || "?").trim().slice(0, 1).toUpperCase();
const statusOf = (p: Participant) =>
  p.isSelf
    ? ""
    : p.status === "unreachable"
      ? t("chat.call.cantConnect", { name: nameOf(p) })
      : p.status === "recovering"
        ? t("chat.call.reconnecting")
        : p.status === "connecting"
          ? t("chat.call.connecting")
          : "";
</script>

<template>
  <Drawer
    v-model:visible="visible"
    :position="position"
    :dt="callDrawerDt"
    :show-close-icon="false"
    :dir="dir"
    class="vue-chat font-chat-family w-full! sm:w-80!"
    data-testid="call-people-list"
  >
    <template #header>
      <div class="flex w-full items-center justify-between gap-x-2">
        <h2 class="text-title-md text-white">
          {{ t("chat.call.people") }}
          <span class="ms-1 text-neutral-400">({{ participants.length }})</span>
        </h2>
        <CallButton
          icon="close"
          :label="t('chat.call.controls.closePeople')"
          :dt="callButtonDt"
          :text="false"
          icon-class="size-5"
          :class="['size-11!', focusRing]"
          data-testid="call-people-close"
          @click="visible = false"
        />
      </div>
    </template>

    <ul class="flex flex-col">
      <li
        v-for="p in participants"
        :key="p.id"
        data-testid="call-participant"
        :data-participant-id="p.id"
        class="flex min-h-14 items-center gap-x-3 rounded-xl px-2 py-2"
      >
        <Avatar
          :label="initialOf(p)"
          shape="circle"
          class="shrink-0 bg-sky-600! text-white! select-none"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-body-md text-neutral-100">
            <bdi>{{ nameOf(p) }}</bdi>
            <span v-if="p.isSelf" class="text-neutral-400"> ({{ t("chat.call.you") }})</span>
          </p>
          <p
            v-if="statusOf(p)"
            :data-testid="p.status === 'unreachable' ? 'call-participant-unreachable' : undefined"
            class="truncate text-label-sm"
            :class="p.status === 'unreachable' ? 'text-red-400' : 'text-neutral-400'"
          >
            {{ statusOf(p) }}
          </p>
        </div>
        <!-- Unknown for clients too old to say: no icon rather than a wrong one. -->
        <span v-if="p.media" class="flex shrink-0 items-center gap-x-1.5 text-neutral-300">
          <span
            role="img"
            :aria-label="p.media.audio ? t('chat.call.micOn') : t('chat.call.muted')"
            :class="!p.media.audio && 'text-red-400'"
          >
            <CallIcon :name="p.media.audio ? 'mic' : 'micOff'" class="size-5" />
          </span>
          <span
            role="img"
            :aria-label="p.media.video ? t('chat.call.cameraOn') : t('chat.call.cameraOff')"
            :class="!p.media.video && 'text-red-400'"
          >
            <CallIcon :name="p.media.video ? 'videocam' : 'videocamOff'" class="size-5" />
          </span>
        </span>
      </li>
    </ul>
  </Drawer>
</template>
