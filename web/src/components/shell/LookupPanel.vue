<script setup lang="ts">
import { useLookupPanel } from "../../composables/useLookupPanel";
import { missions } from "../../data/missions";
import { t } from "../../i18n";

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
  flagWriters,
  flagCheckers,
  mainRows,
  readerRows,
  close,
  pickById,
} = useLookupPanel();

const totalCount = computed(() => mainRows.value.length + readerRows.value.length);
const flagGroups = computed(() =>
  kind.value === "flag" ? { writers: flagWriters.value, checkers: flagCheckers.value } : null,
);
</script>

<template>
  <div
    id="lookupPanel"
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
    <div id="lookupList" class="lookup-list popover-list">
      <template v-if="kind === 'mission'">
        <p v-if="!mainRows.length" class="lookup-empty popover-empty">
          {{ t("lookupEmpty") }}
        </p>
        <template v-else>
          <p class="lookup-group">
            {{
              missions.missionOfState(key)
                ? t("lookupGroupTriggers", { n: mainRows.length })
                : t("lookupGroupEnds", { n: mainRows.length })
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

        <p v-if="!totalCount" class="lookup-empty popover-empty">
          {{ t("lookupEmpty") }}
        </p>

        <template v-else-if="flagGroups">
          <template v-if="flagGroups.writers.length">
            <p class="lookup-group">
              {{ t("lookupGroupWrites", { n: flagGroups.writers.length }) }}
            </p>
            <NodeResultList :items="flagGroups.writers" @pick="pickById" />
          </template>
          <template v-if="flagGroups.checkers.length">
            <p class="lookup-group">
              {{ t("lookupGroupReads", { n: flagGroups.checkers.length }) }}
            </p>
            <NodeResultList :items="flagGroups.checkers" @pick="pickById" />
          </template>
          <p v-else class="lookup-group-note">{{ t("lookupGroupReadsEmpty") }}</p>
        </template>

        <template v-else>
          <NodeResultList :items="mainRows" @pick="pickById" />
          <template v-if="readerRows.length">
            <p class="lookup-group">
              {{ t("lookupGroupReads", { n: readerRows.length }) }}
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
