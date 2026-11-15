<script setup lang="ts">
import { textStore } from "../../data/text";
import { t } from "../../i18n";
import { useScriptStore } from "../../stores/script";

const store = useScriptStore();

defineProps<{ failed?: boolean }>();
const emit = defineEmits<{ (event: "retry"): void }>();

const retry = () => {
  const node = store.selected();
  if (!node) return;
  void textStore.retry(store.textLang(), node.id);
  emit("retry");
};
</script>

<template>
  <div v-if="!failed" class="reader-skeleton" role="status" aria-live="polite">
    <span class="sk-caption">{{ t("loadTextLoading") }}</span>
    <span
      v-for="index in 5"
      :key="index"
      class="sk-line"
      :style="{ width: `${100 - (index - 1) * 9}%` }"
    ></span>
  </div>
  <div v-else class="reader-skeleton is-failed">
    <span class="sk-caption">{{ t("loadTextFailed") }}</span>
    <button class="tool-btn btn" type="button" @click="retry">{{ t("loadTextRetry") }}</button>
  </div>
</template>
