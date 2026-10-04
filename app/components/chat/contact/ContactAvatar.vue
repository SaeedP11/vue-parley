<script setup lang="ts">
import { computed } from "vue";
import Avatar from "primevue/avatar";
import type { Contact } from "~/types";

const props = withDefaults(
  defineProps<{
    // Only what an avatar draws, so a message's reader can use it as well as a contact.
    contact: Pick<Contact, "name" | "lastName" | "imageUrl"> & Partial<Pick<Contact, "isOnline">>;
    showOnline?: boolean;
  }>(),
  { showOnline: true },
);

const image = computed(() => props.contact.imageUrl?.trim() || undefined);

const initials = computed(() => {
  const first = props.contact?.name?.trim() || "";
  const last = props.contact?.lastName?.trim() || "";

  if (!first && !last) return "";

  const firstInitial = first.charAt(0);
  const lastInitial = last.charAt(0);

  const isRTL = /[؀-ۿ]/.test(firstInitial);

  if (isRTL) {
    return lastInitial ? `${firstInitial} ${lastInitial}` : firstInitial;
  } else {
    return (firstInitial + lastInitial).toUpperCase();
  }
});
</script>
<template>
  <div class="relative z-10 size-full">
    <Avatar
      :image="image"
      :label="image ? undefined : initials"
      shape="circle"
      class="size-full! bg-chat-primary/10! text-sm! font-semibold text-chat-primary! select-none"
      :pt="{ image: { draggable: false } }"
    />
    <div
      v-if="contact.isOnline && showOnline"
      class="absolute end-0 bottom-0 size-3 rounded-full border-2 border-chat-background bg-chat-primary"
    ></div>
  </div>
</template>
