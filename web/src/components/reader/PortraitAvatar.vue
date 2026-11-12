<script setup lang="ts">
import { t } from "../../i18n";
import { speakerName } from "../../lib/blocks";
import { ensurePortraitManifest, pickPortrait, portraitUrl } from "../../lib/portraits";

const props = defineProps<{ character: string; expression: string }>();

const loaded = ref(false);
const failed = ref(false);

const pick = computed(() => pickPortrait(props.character, props.expression));
const src = computed(() => (pick.value ? portraitUrl(pick.value.file) : ""));

const label = computed(() => {
  const parts = [speakerName(props.character), props.expression || t("portraitUnknown")];
  if (pick.value?.fallback) parts.push(t("portraitDefault"));
  return parts.filter(Boolean).join(" · ");
});

onMounted(() => {
  void ensurePortraitManifest();
});

watch(
  () => [props.character, props.expression, pick.value?.file],
  () => {
    loaded.value = false;
    failed.value = false;
  },
);
</script>

<template>
  <span class="portrait-avatar" role="img" :aria-label="label" :title="label">
    <img
      v-if="src"
      v-show="loaded && !failed"
      :src="src"
      alt=""
      loading="lazy"
      decoding="async"
      @load="loaded = true"
      @error="failed = true"
    />
    <svg
      v-if="!src || !loaded || failed"
      class="portrait-placeholder"
      viewBox="0 0 40 46"
      aria-hidden="true"
    >
      <circle cx="20" cy="14" r="7" />
      <path d="M6 42c0-10 6-15 14-15s14 5 14 15" />
    </svg>
  </span>
</template>
