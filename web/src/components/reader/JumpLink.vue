<script setup lang="ts">
import { checkpoints } from "../../data/checkpoints";
import { graph } from "../../data/graph";
import { t } from "../../i18n";
import { positionNeverReachable, positionTargetId } from "../../lib/conditions";
import { signedNumber } from "../../lib/numbers";
import type { JumpView } from "../../types/beats";
import type { CheckpointModel, PositionCandidate } from "../../types/condition";
import { useFoldable } from "../../composables/useFoldable";

const store = useScriptStore();
const panels = usePanelsStore();

const props = defineProps<{ jump: JumpView; foldKey?: string }>();

const candidates = computed(() =>
  (props.jump.targets || []).filter((id) => graph.nodeById.has(id)),
);

const isPosition = computed(() => !!props.jump.position);

const dynamicKind = computed(() => props.jump.dynamicKind || "");

const slotCandidates = computed(() =>
  isPosition.value || !dynamicKind.value ? [] : candidates.value,
);

const collapsible = computed(() =>
  isPosition.value ? candidates.value.length > 1 : slotCandidates.value.length > 1,
);

const hasRows = computed(() => isPosition.value && candidates.value.length > 0);

const model = ref<CheckpointModel | null>(null);

type PositionRow = {
  id: string;
  candidate: PositionCandidate | null;
  weight: number;
  never: boolean;
};

const rows = computed<PositionRow[]>(() => {
  const prefix = model.value?.prefix || "";
  const byId = new Map<string, PositionCandidate>();
  for (const candidate of model.value?.candidates || []) {
    const id = positionTargetId(prefix, candidate.name || "");
    if (!id) continue;
    const key = id.toUpperCase();
    const existing = byId.get(key);
    if (!existing || (positionNeverReachable(existing) && !positionNeverReachable(candidate))) {
      byId.set(key, candidate);
    }
  }
  return candidates.value.map((id) => {
    const candidate = byId.get(id.toUpperCase()) || null;
    return {
      id,
      candidate,
      weight: candidate ? (candidate.rate ?? 0) : 0,
      never: candidate ? positionNeverReachable(candidate) : false,
    };
  });
});

const totalWeight = computed(() =>
  rows.value.reduce(
    (sum, row) => sum + (row.candidate ? Math.max(0, row.candidate.rate ?? 0) : 0),
    0,
  ),
);

const percentOf = (candidate: PositionCandidate): number =>
  totalWeight.value > 0
    ? Math.round((Math.max(0, candidate.rate ?? 0) / totalWeight.value) * 100)
    : 0;

const weightText = (candidate: PositionCandidate): string =>
  t("jumpWeightShare", { n: candidate.rate ?? 0, p: percentOf(candidate) });

const hasConditions = (candidate: PositionCandidate): boolean =>
  candidate.active || (candidate.adjustments || []).length > 0;

const open = ref(false);

const foldKey = props.foldKey || (props.jump.position ? `pos:${props.jump.position}` : "");

useFoldable(foldKey, open, () => collapsible.value);

const target = computed(
  () => props.jump.target || (slotCandidates.value.length === 1 ? slotCandidates.value[0] : ""),
);

const display = computed<{
  mode: "rows" | "candidates" | "link" | "dynamic";
  text: string;
}>(() => {
  const missing = t("parenWrap", { text: t("jumpMissing") });
  if (hasRows.value) return { mode: "rows", text: "" };
  if (isPosition.value) {
    return { mode: "dynamic", text: `${t("jumpPosition")} ${props.jump.position}${missing}` };
  }
  if (dynamicKind.value === "travel" && !slotCandidates.value.length) {
    return { mode: "dynamic", text: t("jumpTravelRuntime") };
  }
  if (slotCandidates.value.length > 1) {
    const text =
      dynamicKind.value === "temp"
        ? t("jumpTempCandidates", {
            slot: props.jump.dynamicKey,
            count: slotCandidates.value.length,
          })
        : t("jumpTravelCandidates", { count: slotCandidates.value.length });
    return { mode: "candidates", text };
  }
  if (!target.value) {
    return { mode: "dynamic", text: props.jump.dynamicSource || t("jumpDynamic") };
  }
  if (!graph.nodeById.has(target.value)) {
    return { mode: "dynamic", text: `${target.value}${missing}` };
  }
  return { mode: "link", text: target.value };
});

const dynamicHint = computed(() => {
  if (dynamicKind.value === "temp") return t("jumpTempSlot", { n: props.jump.dynamicKey });
  if (dynamicKind.value === "travel") return t("jumpTravelScript");
  return props.jump.dynamicSource;
});

const toggle = () => {
  open.value = !open.value;
};

const go = (id: string) => {
  if (!id) return;
  store.select(id);
};

const openLookup = (event: Event) => {
  if (!props.jump.position) return;
  event.stopPropagation();
  event.preventDefault();
  panels.openLookup("check", props.jump.position, event.currentTarget as HTMLElement, "position");
};

let loadSeq = 0;

const loadCheckpoint = () => {
  const key = props.jump.position || "";
  const seq = ++loadSeq;
  const cached = key ? checkpoints.getByKey(key, "position") : null;
  model.value = cached;
  if (!key || cached) return;
  void checkpoints.ensure(key).then(() => {
    if (seq !== loadSeq) return;
    model.value = checkpoints.getByKey(key, "position");
  });
};

watch(() => props.jump.position, loadCheckpoint, { immediate: true });
</script>

<template>
  <div
    v-if="display.mode === 'rows'"
    class="jump-group"
    :class="{ 'is-open': !collapsible || open }"
    :data-reveal="collapsible ? '' : undefined"
    @reveal="open = true"
  >
    <div
      class="option-head jump-head row"
      :class="{ 'is-static': !collapsible }"
      :role="collapsible ? 'button' : undefined"
      :tabindex="collapsible ? 0 : undefined"
      :aria-expanded="collapsible ? open : undefined"
      @click="collapsible ? toggle() : undefined"
      @keydown.enter.prevent="collapsible ? toggle() : undefined"
      @keydown.space.prevent="collapsible ? toggle() : undefined"
    >
      <span class="option-main">
        <span class="option-text">{{ jump.position }}</span>
      </span>
      <button
        class="cond-lookup btn btn-icon"
        type="button"
        :title="t('jumpPositionLookup')"
        :aria-label="t('jumpPositionLookup')"
        @click="openLookup"
      >
        <AppIcon name="search" />
      </button>
    </div>
    <div class="jump-body">
      <div
        v-for="row in rows"
        :key="row.id"
        class="jump jump-target"
        role="button"
        tabindex="0"
        :aria-label="row.id"
        @click="go(row.id)"
        @keydown.enter.prevent="go(row.id)"
        @keydown.space.prevent="go(row.id)"
      >
        <span class="jump-target-main">
          <AppIcon name="arrow-right" class="arrow" />
          <span class="jump-target-id">{{ row.id }}</span>
          <span v-if="row.candidate" class="jump-weight">
            {{ weightText(row.candidate) }}
          </span>
          <span v-if="row.never" class="jump-never">
            {{ t("jumpPositionNever") }}
          </span>
        </span>
        <span v-if="row.candidate && hasConditions(row.candidate)" class="jump-conds">
          <template v-if="row.candidate.active">
            <span class="jump-cond-label">{{ t("jumpCondActive") }}</span>
            <span class="jump-cond-text" :class="{ 'is-warn': !row.candidate.activeCondition }">
              <CondExpr
                v-if="row.candidate.activeCondition"
                :expr="row.candidate.activeCondition"
                method="position"
              />
              <template v-else-if="row.candidate.activeEmpty">
                {{ t("lookupCondEmpty") }}
              </template>
              <template v-else>{{ t("lookupCondUnparsed") }}</template>
            </span>
          </template>
          <template
            v-for="(adjustment, adjustIndex) in row.candidate.adjustments || []"
            :key="`adj-${adjustIndex}`"
          >
            <span class="jump-cond-label">
              {{ `${t("jumpCondWeight")} ${signedNumber(adjustment.rate)}` }}
            </span>
            <span class="jump-cond-text" :class="{ 'is-warn': !adjustment.condition }">
              <CondExpr
                v-if="adjustment.condition"
                :expr="adjustment.condition"
                method="position"
              />
              <template v-else>{{ t("lookupCondUnparsed") }}</template>
            </span>
          </template>
        </span>
      </div>
    </div>
  </div>
  <div
    v-else-if="display.mode === 'candidates'"
    class="jump-group"
    :class="{ 'is-open': open }"
    :data-reveal="collapsible ? '' : undefined"
    @reveal="open = true"
  >
    <div
      class="option-head jump-head row"
      :class="{ 'is-static': !collapsible }"
      :role="collapsible ? 'button' : undefined"
      :tabindex="collapsible ? 0 : undefined"
      :aria-expanded="collapsible ? open : undefined"
      @click="collapsible ? toggle() : undefined"
      @keydown.enter.prevent="collapsible ? toggle() : undefined"
      @keydown.space.prevent="collapsible ? toggle() : undefined"
    >
      <span class="option-main">
        <span class="option-text">{{ display.text }}</span>
      </span>
    </div>
    <div class="jump-body">
      <div
        v-for="id in slotCandidates"
        :key="id"
        class="jump jump-target"
        role="button"
        tabindex="0"
        :aria-label="id"
        @click="go(id)"
        @keydown.enter.prevent="go(id)"
        @keydown.space.prevent="go(id)"
      >
        <span class="jump-target-main">
          <AppIcon name="arrow-right" class="arrow" />
          <span class="jump-target-id">{{ id }}</span>
        </span>
      </div>
    </div>
  </div>
  <button v-else-if="display.mode === 'link'" class="jump btn" type="button" @click="go(target)">
    <AppIcon name="arrow-right" class="arrow" />{{ display.text
    }}<span v-if="dynamicHint" class="option-cond">{{ `  ${dynamicHint}` }}</span>
  </button>
  <span v-else class="scene-switch">
    <span class="scene-name">{{ display.text }}</span>
  </span>
</template>
