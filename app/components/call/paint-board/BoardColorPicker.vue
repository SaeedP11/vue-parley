<!-- Normal script block used to export the interface for other components to import -->
<script lang="ts">
export interface BoardColorPickerExposed {
  open: () => void;
  close: () => void;
}
</script>

<script setup lang="ts">
import { ref } from "vue";
import Button from "primevue/button";
import SelectButton from "primevue/selectbutton";
import ResponsiveDialog from "~/components/general/ResponsiveDialog.vue";
import useLocalI18n from "~/composables/useLocalI18n";
import { boardColorPicker } from "@i18n/locales";

defineProps<{ colors: string[]; title: string }>();

const model = defineModel<string>({ default: "#000000" });

const { t } = useLocalI18n(boardColorPicker);
const visible = ref(false);
/** The colour when the picker opened; closing without confirming goes back to it. */
const committed = ref(model.value);
let confirmed = false;

const open = () => {
  committed.value = model.value;
  confirmed = false;
  visible.value = true;
};

const close = () => {
  visible.value = false;
};

const confirm = () => {
  confirmed = true;
  visible.value = false;
};

const onHide = () => {
  if (!confirmed) model.value = committed.value;
};

defineExpose<BoardColorPickerExposed>({ open, close });
</script>

<template>
  <ResponsiveDialog
    v-model:visible="visible"
    :header="title"
    width="22rem"
    @hide="onHide"
  >
    <SelectButton
      v-model="model"
      :options="colors"
      :allow-empty="false"
      class="flex-wrap"
    >
      <template #option="{ option }">
        <span
          class="block size-6 rounded-md"
          :style="{ backgroundColor: option }"
          :aria-label="option"
        />
      </template>
    </SelectButton>
    <template #footer>
      <Button
        class="w-full"
        :label="t('board.confirm')"
        :disabled="model === committed"
        @click="confirm"
      />
    </template>
  </ResponsiveDialog>
</template>
