<script setup lang="ts">
import { useInfiniteScroll } from "@vueuse/core";
import { useLookupPanel } from "../../composables/useLookupPanel";
import { missions } from "../../data/missions";
import { t } from "../../i18n";
import type { GraphNode } from "../../types/graph";
import { UI_IDS } from "../../ui/ids";

const PAGE = 60;

const {
  open,
  kind,
  key,
  method,
  checkpoint,
  loading,
  title,
  subText,
  readsEmptyText,
  rowOf,
  mainNodes,
  readerNodes,
  flagWriters,
  flagCheckers,
  close,
  pickById,
} = useLookupPanel();

const limit = ref(PAGE);
const list = ref<HTMLElement | null>(null);

const empty = computed(() => !mainNodes.value.length && !readerNodes.value.length);

const sliceOf = (nodes: GraphNode[]) => nodes.slice(0, limit.value);

const mainRows = computed(() => sliceOf(mainNodes.value).map(rowOf));
const readerRows = computed(() => sliceOf(readerNodes.value).map(rowOf));

const writerRows = computed(() => sliceOf(flagWriters.value).map(rowOf));
const checkerRows = computed(() => sliceOf(flagCheckers.value).map(rowOf));

const isFlag = computed(() => kind.value === "flag");

const hasMore = computed(() => {
  if (isFlag.value) {
    return limit.value < flagWriters.value.length || limit.value < flagCheckers.value.length;
  }
  if (kind.value === "mission") return limit.value < mainNodes.value.length;
  return limit.value < mainNodes.value.length || limit.value < readerNodes.value.length;
});

useInfiniteScroll(
  list,
  () => {
    limit.value += PAGE;
  },
  { distance: 96, canLoadMore: () => hasMore.value },
);

watch(
  () => [open.value, kind.value, key.value, method.value].join("\u0000"),
  () => {
    limit.value = PAGE;
    if (list.value) list.value.scrollTop = 0;
  },
);
</script>

<template>
  <div
    :id="UI_IDS.lookupPanel"
    class="lookup surface popover"
    role="dialog"
    :aria-label="t('lookupSpeaker')"
    :hidden="!open"
  >
    <header class="lookup-head">
      <span id="lookupTitle" class="overlay-title">{{ title }}</span>
      <button
        id="lookupClose"
        class="btn btn-icon"
        type="button"
        :title="t('closeTitle')"
        @click="close"
      >
        <AppIcon name="close" />
      </button>
    </header>
    <p v-if="subText" id="lookupSub" class="lookup-sub">{{ subText }}</p>
    <div id="lookupList" ref="list" class="lookup-list popover-list">
      <template v-if="kind === 'mission'">
        <p v-if="!mainRows.length" class="lookup-empty popover-empty">
          {{ t("lookupEmpty") }}
        </p>
        <template v-else>
          <p class="lookup-group">
            {{
              missions.missionOfState(key)
                ? t("lookupGroupTriggers", { n: mainNodes.length })
                : t("lookupGroupEnds", { n: mainNodes.length })
            }}
          </p>
          <NodeResultList :items="mainRows" @pick="pickById" />
        </template>
      </template>
      <template v-else>
        <CheckpointBranches
          v-if="kind === 'check' && checkpoint"
          :checkpoint="checkpoint"
          :method="method"
        />
        <div v-else-if="kind === 'check' && loading" class="lookup-cond">
          <p class="lookup-cond-title">{{ t("lookupCondTitle") }}</p>
          <div class="lookup-cond-body">
            <p class="lookup-cond-muted">{{ t("lookupCondLoading") }}</p>
          </div>
        </div>

        <p v-if="empty" class="lookup-empty popover-empty">
          {{ t("lookupEmpty") }}
        </p>

        <template v-else-if="isFlag">
          <template v-if="flagWriters.length">
            <p class="lookup-group">
              {{ t("lookupGroupWrites", { n: flagWriters.length }) }}
            </p>
            <NodeResultList :items="writerRows" @pick="pickById" />
          </template>
          <template v-if="flagCheckers.length">
            <p class="lookup-group">
              {{ t("lookupGroupReads", { n: flagCheckers.length }) }}
            </p>
            <NodeResultList :items="checkerRows" @pick="pickById" />
          </template>
          <p v-else class="lookup-group-note">{{ t("lookupGroupReadsEmpty") }}</p>
        </template>

        <template v-else>
          <NodeResultList :items="mainRows" @pick="pickById" />
          <template v-if="readerNodes.length">
            <p class="lookup-group">
              {{ t("lookupGroupReads", { n: readerNodes.length }) }}
            </p>
            <NodeResultList :items="readerRows" @pick="pickById" />
          </template>
          <p v-else-if="kind === 'stat' || kind === 'rel'" class="lookup-group-note">
            {{ t(readsEmptyText) }}
          </p>
        </template>
      </template>
    </div>
  </div>
</template>
