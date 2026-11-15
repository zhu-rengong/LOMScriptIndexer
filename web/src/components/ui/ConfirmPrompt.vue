<script setup lang="ts">
import { t } from "../../i18n";

withDefaults(
  defineProps<{
    label: string;
    prompt: string;
    tone?: "neutral" | "danger";
  }>(),
  { tone: "neutral" },
);

const emit = defineEmits<{ confirm: [] }>();

const asking = ref(false);

const ask = () => {
  asking.value = true;
};

const cancel = () => {
  asking.value = false;
};

const confirm = () => {
  if (!asking.value) return;
  asking.value = false;
  emit("confirm");
};
</script>

<template>
  <span class="confirm">
    <button v-if="!asking" class="link" :data-tone="tone" type="button" @click="ask">
      {{ label }}
    </button>
    <template v-else>
      <span class="confirm-text" role="status">{{ prompt }}</span>
      <button class="btn" data-size="sm" type="button" @click="confirm">
        {{ t("confirmAccept") }}
      </button>
      <button class="btn" data-size="sm" type="button" @click="cancel">
        {{ t("confirmCancel") }}
      </button>
    </template>
  </span>
</template>
