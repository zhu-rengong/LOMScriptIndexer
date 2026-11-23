<script setup lang="ts">
import { sceneLabel, sceneText, t } from "../../i18n";
import type { SceneView } from "../../types/beats";

const props = defineProps<{ view: SceneView; blockPath: string }>();

const scene = computed(() => sceneLabel(props.view.scene));
</script>

<template>
  <div class="scene-switch" :data-block-path="blockPath">
    <span v-if="scene" class="scene-name">{{ scene }}</span>
    <template v-else-if="view.scene">
      <span class="scene-label">{{ t("sceneSwitch") }}</span>
      <span class="scene-name">{{ view.scene }}</span>
    </template>
    <span v-if="view.sceneKey" class="scene-key">{{ view.sceneKey }}</span>
    <template v-if="view.nextScene && !view.afterScript">
      <AppIcon name="arrow-right" class="scene-arrow" />
      <span class="scene-next">{{ sceneText(view.nextScene) }}</span>
    </template>
    <template v-if="view.afterScript">
      <span class="scene-label">{{ t("battleAfterStory") }}</span>
      <JumpLink :jump="{ target: view.afterScript, dynamicSource: '' }" />
    </template>
  </div>
</template>
