<script setup lang="ts">
import { t } from "../../i18n";
import { popovers } from "../../lib/popover";
import { versionInfo } from "../../lib/version";
import { UI_IDS } from "../../ui/ids";

const open = computed(() => popovers.isOpen("version"));

const close = () => popovers.close("version");

const view = useViewStore();

onMounted(() => {
  popovers.register("version", {
    id: UI_IDS.versionPanel,
    triggerId: UI_IDS.moreBtn,
    group: "modal",
    autofocus: UI_IDS.versionClose,
  });
});
</script>

<template>
  <div class="scrim" :hidden="!open || !view.sheetMode" @click="close"></div>
  <div
    id="versionPanel"
    class="version-panel surface"
    role="dialog"
    aria-modal="true"
    aria-labelledby="versionHeading"
    :hidden="!open"
  >
    <header class="panel-head">
      <h2 id="versionHeading" class="panel-title">{{ t("versionTitle") }}</h2>
      <button
        id="versionClose"
        class="btn btn-icon"
        type="button"
        :title="t('closeTitle')"
        @click="close"
      >
        <AppIcon name="close" />
      </button>
    </header>
    <dl class="version-list">
      <div class="version-row">
        <dt>{{ t("versionPy") }}</dt>
        <dd>{{ versionInfo.py || t("versionUnknown") }}</dd>
      </div>
      <div class="version-row">
        <dt>{{ t("versionWeb") }}</dt>
        <dd>{{ versionInfo.web || t("versionUnknown") }}</dd>
      </div>
      <div class="version-row">
        <dt>{{ t("versionCommit") }}</dt>
        <dd>
          <a
            v-if="versionInfo.commitUrl && versionInfo.commit"
            :href="versionInfo.commitUrl"
            target="_blank"
            rel="noopener noreferrer"
            :title="t('versionCommitTitle')"
          >
            {{ versionInfo.commit }}
          </a>
          <span v-else>{{ versionInfo.commit || t("versionUnknown") }}</span>
        </dd>
      </div>
    </dl>
  </div>
</template>
