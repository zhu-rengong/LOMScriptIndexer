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
import { useFoldable } from "../../composables/useFoldable";
import { useLookupPress } from "../../composables/useLookupPress";

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

const expanded = ref(false);

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

const { target: pressTarget, consume: consumePress } = useLookupPress((trigger) => {
  const checkRef = check.value;
  if (!checkRef || !trigger) return;
  panels.openLookup("check", checkRef.key, trigger, checkRef.kind);
});

const onHeadClick = (): void => {
  if (consumePress()) return;
  toggle();
};

let resolveSeq = 0;

const resolveCondition = () => {
  const seq = ++resolveSeq;
  const node = props.option.condition;
  expr.value = node;
  expanded.value = !!node && node.tag !== "check";
  const checkRef = check.value;
  if (!checkRef) return;
  const resolved = checkpointExpr(checkRef);
  if (resolved) {
    expr.value = resolved;
    expanded.value = true;
    return;
  }
  void checkpoints.ensure(checkRef.key).then(() => {
    if (seq !== resolveSeq) return;
    const loaded = checkpointExpr(checkRef);
    if (!loaded) return;
    expr.value = loaded;
    expanded.value = true;
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
      @click="onHeadClick"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
    >
      <span class="option-idx">{{ index + 1 }}</span>
      <span class="option-main">
        <span class="option-text"><RichText :text="head" /></span>
        <span v-if="option.lockedText" class="option-lock">
          <AppIcon name="lock" class="lock-icon" />{{ option.lockedText }}
        </span>
        <span
          v-if="requirement || detailRequirements || expr"
          ref="pressTarget"
          class="option-conds"
        >
          <template v-if="requirement || detailRequirements">
            <span class="option-cond-label">{{ t("optionNeedLabel") }}</span>
            <span class="option-cond-stack">
              <span v-if="requirement" class="option-cond">{{ requirement }}</span>
              <span v-if="detailRequirements" class="option-cond">{{ detailRequirements }}</span>
            </span>
          </template>
          <template v-if="expr">
            <span class="option-cond-label">{{ t("optionCondLabel") }}</span>
            <span class="option-cond-row">
              <span class="option-cond" :title="hint || undefined">
                <CondExpr v-if="expanded" :expr="expr" :method="check?.kind" />
                <span v-else class="cx-var"
                  ><span class="cx-name">{{ check?.key }}</span></span
                >
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
          </template>
        </span>
      </span>
    </div>
    <div class="option-body">
      <BlockList :blocks="blocks" :path="props.foldKey" />
    </div>
  </div>
</template>
