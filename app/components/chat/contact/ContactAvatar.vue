<script setup lang="ts">
import { computed } from "vue";
import Avatar from "primevue/avatar";
import BIcon from "~/components/global/BIcon.vue";
import type { Contact } from "~/types";
import { avatarToneStyle, nameInitials } from "~/utils/avatar";

const props = withDefaults(
  defineProps<{
    // Only what an avatar draws, so a message's reader can use it as well as a contact.
    contact: Pick<Contact, "name" | "lastName" | "imageUrl"> & Partial<Pick<Contact, "isOnline">>;
    showOnline?: boolean;
  }>(),
  { showOnline: true },
);

const image = computed(() => props.contact.imageUrl?.trim() || undefined);

// Without a picture, the initials on the palette tone the name hashes to: one colour per person.
const initials = computed(() => nameInitials(props.contact?.name, props.contact?.lastName));
const toneStyle = computed(() => (image.value ? undefined : avatarToneStyle(props.contact?.name, props.contact?.lastName)));
</script>
<template>
  <div class="relative z-10 size-full">
    <Avatar
      :image="image"
      :label="image ? undefined : initials || undefined"
      shape="circle"
      class="size-full! text-sm! font-semibold select-none"
      :style="toneStyle"
      :pt="{ image: { draggable: false } }"
    >
      <template v-if="!image && !initials" #icon><BIcon icon="PhUser" class="size-1/2" /></template>
    </Avatar>
    <div
      v-if="contact.isOnline && showOnline"
      class="absolute end-0 bottom-0 size-3 rounded-full border-2 border-chat-background bg-chat-primary"
    ></div>
  </div>
</template>
