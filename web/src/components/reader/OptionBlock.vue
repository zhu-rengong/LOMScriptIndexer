<script setup lang="ts">
import { buildReaderBlocks } from "../../lib/blocks";
import {
  condHint,
  detailRequirementsText,
  optionHeadText,
  requirementText,
} from "../../lib/conditions";
import type { ChoiceOption } from "../../types/beats";
import AppIcon from "../ui/AppIcon.vue";
import BlockList from "./BlockList.vue";
import CondExpr from "./CondExpr.vue";
import RichText from "./RichText.vue";
import { useFoldable } from "../../composables/useFoldable";

const props = defineProps<{ option: ChoiceOption; index: number; foldKey: string }>();

const open = ref(false);
useFoldable(props.foldKey, open);

const head = computed(() => optionHeadText(props.option.text, props.option.detail));

const requirement = computed(() => requirementText(props.option.requirement));

const detailRequirements = computed(() => detailRequirementsText(props.option.detail));

const condition = computed(() => condHint(props.option.condition));

const blocks = computed(() => buildReaderBlocks(props.option.beats));

const toggle = () => {
  open.value = !open.value;
};
</script>

<template>
  <div class="option" :class="{ 'is-open': open }" data-reveal @reveal="open = true">
    <div
      class="option-head row"
      role="button"
      tabindex="0"
      :aria-expanded="open"
      @click="toggle"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
    >
      <span class="option-idx">{{ index + 1 }}</span>
      <span class="option-main">
        <span class="option-text"><RichText :text="head" /></span>
        <span v-if="option.lockedText" class="option-lock">
          <AppIcon name="lock" class="lock-icon" />{{ option.lockedText }}
        </span>
        <span v-if="condition || requirement || detailRequirements" class="option-badges">
          <span v-if="requirement" class="option-cond">{{ requirement }}</span>
          <span v-if="detailRequirements" class="badge">{{ detailRequirements }}</span>
          <span v-if="condition" class="option-cond" :title="condition" @click.stop>
            <CondExpr :expr="option.condition" />
          </span>
        </span>
      </span>
    </div>
    <div class="option-body">
      <BlockList :blocks="blocks" :path="props.foldKey" />
    </div>
  </div>
</template>
