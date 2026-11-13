<script setup lang="ts">
import { checkpoints } from "../../data/checkpoints";
import { t } from "../../i18n";
import { buildReaderBlocks } from "../../lib/blocks";
import {
  checkpointExpr,
  condHint,
  detailRequirementsText,
  optionHeadText,
  requirementText,
} from "../../lib/conditions";
import type { CheckRef, ChoiceOption } from "../../types/beats";
import type { ConditionNode } from "../../types/condition";
import AppIcon from "../ui/AppIcon.vue";
import BlockList from "./BlockList.vue";
import CondExpr from "./CondExpr.vue";
import RichText from "./RichText.vue";
import { useFoldable } from "../../composables/useFoldable";
import { usePanelsStore } from "../../stores/panels";

const panels = usePanelsStore();

const props = defineProps<{ option: ChoiceOption; index: number; foldKey: string }>();

const open = ref(false);
useFoldable(props.foldKey, open);

const head = computed(() => optionHeadText(props.option.text, props.option.detail));

const requirement = computed(() => requirementText(props.option.requirement));

const detailRequirements = computed(() => detailRequirementsText(props.option.detail));

const check = computed<CheckRef | null>(() => {
  const node = props.option.condition;
  if (!node || node.tag !== "check" || !node.key) return null;
  return { key: node.key, kind: node.kind, expectedResult: null };
});

const expr = ref<ConditionNode | null>(null);

const hint = computed(() => condHint(expr.value));

const blocks = computed(() => buildReaderBlocks(props.option.beats));

const toggle = () => {
  open.value = !open.value;
};

const openCheck = (event: Event) => {
  const checkRef = check.value;
  if (!checkRef) return;
  event.stopPropagation();
  panels.openLookup("check", checkRef.key, event.currentTarget as HTMLElement, checkRef.kind);
};

let resolveSeq = 0;

const resolveCondition = () => {
  const seq = ++resolveSeq;
  expr.value = props.option.condition;
  const checkRef = check.value;
  if (!checkRef) return;
  const expanded = checkpointExpr(checkRef);
  if (expanded) {
    expr.value = expanded;
    return;
  }
  void checkpoints.ensure(checkRef.key).then(() => {
    if (seq !== resolveSeq) return;
    const loaded = checkpointExpr(checkRef);
    if (loaded) expr.value = loaded;
  });
};

watch(() => props.option.condition, resolveCondition, { immediate: true });
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
        <span v-if="requirement || detailRequirements" class="option-badges">
          <span v-if="requirement" class="option-cond">{{ requirement }}</span>
          <span v-if="detailRequirements" class="option-cond">{{ detailRequirements }}</span>
        </span>
        <span v-if="expr" class="option-cond-row">
          <span class="option-cond" :title="hint || undefined" @click.stop>
            <CondExpr :expr="expr" :method="check?.kind" />
          </span>
          <button
            v-if="check"
            class="cond-lookup btn btn-icon"
            type="button"
            :title="t('condLookup')"
            :aria-label="t('condLookup')"
            @click="openCheck"
          >
            <AppIcon name="search" />
          </button>
        </span>
      </span>
    </div>
    <div class="option-body">
      <BlockList :blocks="blocks" :path="props.foldKey" />
    </div>
  </div>
</template>
