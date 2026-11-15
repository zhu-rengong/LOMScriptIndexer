<script setup lang="ts">
import { t } from "../../i18n";
import { signedNumber } from "../../lib/browser";
import { condText, localizedName } from "../../lib/conditions";
import type { CheckpointModel, DiceAddition, PositionCandidate } from "../../types/condition";
import CondExpr from "../reader/CondExpr.vue";
import CondRow from "./CondRow.vue";
import { usePanelsStore } from "../../stores/panels";

const panels = usePanelsStore();

const props = defineProps<{ checkpoint: CheckpointModel; method: string }>();

const kind = computed(() => props.checkpoint.kind || props.method);

const branches = computed(() => props.checkpoint.branches || []);

const branchReturnsResult = computed(() => kind.value === "switch" || kind.value === "dice");

const branchRows = computed(() =>
  branches.value.map((branch) => ({
    expr: branch.expr || null,
    resultText: branchReturnsResult.value
      ? t("lookupCondResult", { n: branch.result })
      : t("lookupCondTrue"),
  })),
);

const fallback = computed(() => {
  const checkpoint = props.checkpoint;
  if (!checkpoint.fallback && checkpoint.fallback !== 0) return null;
  const excluded = branches.value
    .map((branch) => (branch && branch.expr ? condText(branch.expr) : ""))
    .filter(Boolean);
  const hint = [t("cxFallbackHint", { n: branches.value.length })];
  if (excluded.length) hint.push(excluded.join(t("listJoin")));
  return {
    resultText: t("lookupCondResult", { n: checkpoint.fallback }),
    tooltipText: hint.join("\n"),
  };
});

const countItems = computed(() =>
  props.checkpoint.useCount ? props.checkpoint.countItems || [] : [],
);

const additions = computed(() => props.checkpoint.additions || []);

const candidates = computed(() => props.checkpoint.candidates || []);

const prefix = computed(() =>
  t("lookupCondPrefix", {
    prefix: props.checkpoint.prefix || "—",
  }),
);

const candidateLabel = (candidate: PositionCandidate) => candidate.name || t("lookupUnset");

const additionType = (item: DiceAddition) =>
  item.kind ? t(`diceAdd.${item.kind}`, { defaultValue: "" }) : "";

const additionName = (item: DiceAddition) => localizedName(item) || item.key || "—";

const additionLinkable = (item: DiceAddition) =>
  !!item.key && (item.kind === "stat" || item.kind === "rel" || item.kind === "flag");

const additionRate = (item: DiceAddition) => {
  const rate = Number(item.rate);
  const factor = Number.isFinite(rate) && rate !== 1 ? t("diceAddRate", { n: rate }) : "";
  return `${item.negative ? "−" : "+"}${factor}`;
};

const openAddition = (item: DiceAddition, event: Event) => {
  if (!item.kind || !item.key) return;
  event.stopPropagation();
  event.preventDefault();
  panels.openLookup(item.kind, item.key, event.currentTarget as HTMLElement);
};
</script>

<template>
  <div class="lookup-cond">
    <p class="lookup-cond-title">{{ t("lookupCondTitle") }}</p>
    <div class="lookup-cond-body">
      <template v-if="kind === 'switch' || kind === 'condition'">
        <CondRow
          v-for="(row, index) in branchRows"
          :key="`branch-${index}`"
          :result="row.resultText"
        >
          <CondExpr v-if="row.expr" :expr="row.expr" :method="method" />
          <template v-else>{{ t("lookupCondEmpty") }}</template>
        </CondRow>
        <CondRow v-if="kind === 'switch' && fallback" :result="fallback.resultText">
          <span
            class="cx-fallback"
            :title="fallback.tooltipText"
            :aria-label="fallback.tooltipText"
          >
            {{ t("lookupCondFallback") }}
          </span>
        </CondRow>
        <template v-if="countItems.length">
          <p class="lookup-cond-sub">{{ t("lookupCondCount") }}</p>
          <CondRow
            v-for="(item, index) in countItems"
            :key="`count-${index}`"
            :result="t('lookupCondResult', { n: item.result })"
          >
            {{ t("lookupCondCountRow", { n: item.value ?? "", op: item.op }) }}
          </CondRow>
        </template>
      </template>

      <template v-else-if="kind === 'dice'">
        <template v-if="additions.length">
          <p class="lookup-cond-sub">{{ t("lookupCondAdditions") }}</p>
          <p
            v-for="(item, index) in additions"
            :key="`add-${index}`"
            class="lc-row lc-add"
            :class="{ 'is-neg': item.negative }"
          >
            <button
              v-if="additionLinkable(item)"
              class="cx-var is-link"
              type="button"
              :title="t('lookupStat')"
              @click="openAddition(item, $event)"
            >
              <span v-if="additionType(item)" class="cx-type">{{ additionType(item) }}</span>
              <span class="cx-name">{{ additionName(item) }}</span>
            </button>
            <span v-else class="lc-add-main">
              <span v-if="additionType(item)" class="lc-add-type">{{ additionType(item) }}</span>
              <span class="lc-add-name">{{ additionName(item) }}</span>
            </span>
            <span class="lc-add-rate">{{ additionRate(item) }}</span>
            <span v-if="item.hide" class="lc-add-tag">{{ t("diceAddHide") }}</span>
          </p>
        </template>
        <CondRow v-for="(row, index) in branchRows" :key="`die-${index}`" :result="row.resultText">
          <CondExpr v-if="row.expr" :expr="row.expr" :method="method" />
          <template v-else>{{ t("lookupCondEmpty") }}</template>
        </CondRow>
        <CondRow v-if="fallback" :result="fallback.resultText">
          <span
            class="cx-fallback"
            :title="fallback.tooltipText"
            :aria-label="fallback.tooltipText"
          >
            {{ t("lookupCondFallback") }}
          </span>
        </CondRow>
      </template>

      <template v-else-if="kind === 'position'">
        <p class="lookup-cond-sub">{{ prefix }}</p>
        <div v-for="(item, index) in candidates" :key="`cand-${index}`" class="lc-item">
          <CondRow :result="t('lookupCondWeight', { n: item.rate })">
            {{ candidateLabel(item) }}
          </CondRow>
          <p v-if="item.active && item.activeEmpty" class="lc-row lc-sub lc-warn">
            <span class="lc-sub-label">{{ t("lookupCondActive") }}</span>
            <span>{{ t("lookupCondUnset") }}</span>
          </p>
          <p v-else-if="item.active" class="lc-row lc-sub">
            <span class="lc-sub-label">{{ t("lookupCondActive") }}</span>
            <CondExpr v-if="item.activeCondition" :expr="item.activeCondition" method="position" />
            <span v-else>{{ t("lookupCondUnparsed") }}</span>
          </p>
          <p
            v-for="(adjustment, adjustIndex) in item.adjustments || []"
            :key="`adj-${adjustIndex}`"
            class="lc-row lc-sub"
          >
            <span class="lc-sub-label">{{ t("lookupCondAdjust") }}</span>
            <span class="lc-sub-rate">{{ signedNumber(adjustment.rate) }}</span>
            <CondExpr v-if="adjustment.condition" :expr="adjustment.condition" method="position" />
            <span v-else>{{ t("lookupCondUnparsed") }}</span>
          </p>
        </div>
      </template>

      <p v-else-if="kind === 'flag'" class="lc-row lc-plain">
        {{ t("lookupCondFlag", { n: checkpoint.default }) }}
      </p>

      <p v-else class="lookup-cond-muted">{{ t("lookupCondEmpty") }}</p>
    </div>
  </div>
</template>
