<script setup lang="ts">
import { t } from "../../i18n";
import { speakerName } from "../../lib/blocks";
import { loadPortrait } from "../../lib/dds";
import { ensurePortraitManifest, pickPortrait, portraitUrl } from "../../lib/portraits";

const props = defineProps<{ character: string; expression: string }>();

const canvas = ref<HTMLCanvasElement | null>(null);
const ready = ref(false);

const pick = computed(() => pickPortrait(props.character, props.expression));

const label = computed(() => {
  const parts = [speakerName(props.character), props.expression || t("portraitUnknown")];
  if (pick.value?.fallback) parts.push(t("portraitDefault"));
  return parts.filter(Boolean).join(" · ");
});

const draw = async (): Promise<void> => {
  const target = canvas.value;
  const current = pick.value;
  ready.value = false;
  if (!target || !current) return;
  try {
    const image = await loadPortrait(portraitUrl(current.file));
    if (pick.value?.file !== current.file) return;
    const context = target.getContext("2d");
    if (!context) return;
    context.putImageData(image, 0, 0);
    ready.value = true;
  } catch {
    ready.value = false;
  }
};

onMounted(() => {
  void ensurePortraitManifest();
  void draw();
});

watch(
  () => [props.character, props.expression, pick.value?.file],
  () => {
    void draw();
  },
);
</script>

<template>
  <span class="portrait-avatar" role="img" :aria-label="label" :title="label">
    <canvas ref="canvas" width="80" height="92" aria-hidden="true"></canvas>
    <svg v-if="!ready" class="portrait-placeholder" viewBox="0 0 40 46" aria-hidden="true">
      <circle cx="20" cy="14" r="7" />
      <path d="M6 42c0-10 6-15 14-15s14 5 14 15" />
    </svg>
  </span>
</template>
