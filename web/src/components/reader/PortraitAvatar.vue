<script setup lang="ts">
import { t } from "../../i18n";
import { speakerName } from "../../lib/blocks";
import { ensurePortraitManifest, pickPortrait, portraitUrl } from "../../lib/portraits";

const props = defineProps<{ character: string; expression: string }>();

const loads = new Map<string, Promise<boolean>>();

const loadPage = (url: string): Promise<boolean> => {
  const pending = loads.get(url);
  if (pending) return pending;
  const next = new Promise<boolean>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
  loads.set(url, next);
  return next;
};

const pick = computed(() => pickPortrait(props.character, props.expression));
const src = computed(() => (pick.value ? portraitUrl(pick.value.file) : ""));
const loadedPage = ref("");
const failedPage = ref("");

const loaded = computed(() => !!src.value && loadedPage.value === src.value);
const failed = computed(() => !!src.value && failedPage.value === src.value);

const label = computed(() => {
  const parts = [speakerName(props.character), props.expression || t("portraitUnknown")];
  if (pick.value?.fallback) parts.push(t("portraitDefault"));
  return parts.filter(Boolean).join(t("sepPair"));
});

const style = computed<Record<string, string | number>>(() => ({
  "--portrait-sheet": loaded.value ? `url("${src.value}")` : "none",
  "--portrait-columns": pick.value?.columns ?? 1,
  "--portrait-col": pick.value?.column ?? 0,
  "--portrait-row": pick.value?.row ?? 0,
  "--portrait-aspect": pick.value?.aspect ?? 1.15,
}));

onMounted(() => {
  void ensurePortraitManifest();
});

watch(
  src,
  (url) => {
    if (!url) return;
    const token = url;
    void loadPage(url).then((ok) => {
      if (src.value !== token) return;
      if (ok) loadedPage.value = token;
      else failedPage.value = token;
    });
  },
  { immediate: true },
);
</script>

<template>
  <span class="portrait-avatar" role="img" :aria-label="label" :title="label" :style="style">
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
