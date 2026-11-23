<script setup lang="ts">
import { t } from "../../i18n";
import { popovers } from "../../lib/popover";
import { UI_IDS } from "../../ui/ids";

const HELP_GROUPS: { title: string; rows: [string, string][] }[] = [
  { title: "helpGroupNav", rows: [["← / →", "hkHistory"]] },
  {
    title: "helpGroupRead",
    rows: [
      ["B", "hkBookmark"],
      ["F", "hkInfer"],
      ["H", "hkReveal"],
      ["V", "hkFold"],
      ["?", "hkHelp"],
      ["J", "hkJump"],
    ],
  },
];

const TOUCH_ROWS: { gesture: string; desc: string }[] = [
  { gesture: "htTap", desc: "htTapDesc" },
  { gesture: "htHold", desc: "htHoldDesc" },
  { gesture: "htPress", desc: "htPressDesc" },
  { gesture: "htBack", desc: "htBackDesc" },
];

const FILTER_DOCS: { expr: string; desc: string }[] = [
  { expr: "helpFilterField", desc: "helpFilterFieldDesc" },
  { expr: "helpFilterLogic", desc: "helpFilterLogicDesc" },
  { expr: "helpFilterExample", desc: "helpFilterExampleDesc" },
];

const open = computed(() => popovers.isOpen("help"));

const close = () => popovers.close("help");

const view = useViewStore();

onMounted(() => {
  popovers.register("help", {
    id: UI_IDS.helpPanel,
    triggerId: UI_IDS.helpBtn,
    group: "modal",
    autofocus: UI_IDS.helpClose,
  });
});
</script>

<template>
  <div class="scrim" :hidden="!open || !view.sheetMode" @click="close"></div>
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
        class="btn btn-icon"
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
      <section v-if="view.sheetMode" class="help-group">
        <h3 class="help-group-title">{{ t("helpGroupTouch") }}</h3>
        <dl class="help-list">
          <template v-for="row in TOUCH_ROWS" :key="row.gesture">
            <dt class="help-key">{{ t(row.gesture) }}</dt>
            <dd class="help-desc">{{ t(row.desc) }}</dd>
          </template>
        </dl>
      </section>
      <section class="help-group">
        <h3 class="help-group-title">{{ t("helpGroupFilter") }}</h3>
        <dl class="help-filter">
          <template v-for="item in FILTER_DOCS" :key="item.expr">
            <dt class="help-expr">{{ t(item.expr) }}</dt>
            <dd class="help-desc">{{ t(item.desc) }}</dd>
          </template>
        </dl>
      </section>
    </div>
    <p class="panel-hint">{{ t("helpEscNote") }}</p>
  </div>
</template>
