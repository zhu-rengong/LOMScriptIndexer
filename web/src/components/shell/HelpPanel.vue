<script setup lang="ts">
import { t } from "../../i18n";
import { overlay } from "../../lib/overlay";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";

const HELP_GROUPS: { title: string; rows: [string, string][] }[] = [
  { title: "helpGroupNav", rows: [["← / →", "hkHistory"]] },
  {
    title: "helpGroupRead",
    rows: [
      ["B", "hkBookmark"],
      ["C", "hkCondInfer"],
      ["F", "hkInfer"],
      ["H", "revealBtnTitle"],
      ["?", "hkHelp"],
      ["J", "navBtnTitle"],
    ],
  },
];

const open = computed(() => overlay.isOpen("help"));

const close = () => overlay.close("help");

onMounted(() => {
  overlay.register("help", {
    id: UI_IDS.helpPanel,
    triggerId: UI_IDS.helpBtn,
    group: "modal",
    autofocus: UI_IDS.helpClose,
  });
});
</script>

<template>
  <div
    id="helpPanel"
    class="help-panel surface"
    role="dialog"
    aria-modal="true"
    aria-labelledby="helpHeading"
    :hidden="!open"
  >
    <header class="panel-head">
      <h2 id="helpHeading" class="panel-title">{{ t("helpTitle") }}</h2>
      <button
        id="helpClose"
        class="btn btn-icon btn-sm"
        type="button"
        :title="t('closeTitle')"
        @click="close"
      >
        <AppIcon name="close" />
      </button>
    </header>
    <div id="helpBody" class="help-body">
      <section v-for="group in HELP_GROUPS" :key="group.title" class="help-group">
        <h3 class="help-group-title">{{ t(group.title) }}</h3>
        <dl class="help-list">
          <template v-for="row in group.rows" :key="row[0]">
            <dt class="help-key">{{ row[0] }}</dt>
            <dd class="help-desc">{{ t(row[1]) }}</dd>
          </template>
        </dl>
      </section>
    </div>
    <p class="panel-hint">{{ t("helpHint") }}</p>
  </div>
</template>
