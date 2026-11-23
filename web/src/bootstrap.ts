import "./styles/index.css";
import { createAppShell } from "./app";
import App from "./components/App.vue";
import { graph } from "./data/graph";
import { textStore } from "./data/text";
import { syncLocale } from "./i18n";
import { installBackLayer, takeBackLayer } from "./lib/backLayer";
import { applyFilter } from "./lib/filter";
import { installNavHistory } from "./lib/navHistory";
import { popovers } from "./lib/popover";
import { replaceScript, router, scriptIdOf, showScript } from "./router";

export const start = (): void => {
  const app = createAppShell(App);
  app.use(router);
  usePrefsStore(pinia);

  const script = useScriptStore(pinia);
  const search = useSearchStore(pinia);
  const view = useViewStore(pinia);
  script.restoreLang();
  syncLocale(script.lang);

  app.mount("#app");
  installNavHistory();
  installBackLayer(() => {
    popovers.closeAll();
    view.collapseSearch();
  });

  watch(
    () => script.lang,
    (lang) => syncLocale(lang),
  );

  watch(
    () => script.selectedId,
    (id) => {
      if (!id || scriptIdOf(router.currentRoute.value.params.id) === id) return;
      if (takeBackLayer()) replaceScript(id);
      else showScript(id);
    },
  );

  watch(
    () => router.currentRoute.value.params.id,
    (raw) => {
      const id = scriptIdOf(raw);
      if (!id || !graph.nodeById.has(id)) return;
      if (script.selectedId !== id) script.select(id);
    },
    { immediate: true },
  );

  textStore.ensureHead(script.textLang()).then(() => {
    search.invalidate();
    search.warm();
    if (script.filterSource.trim()) applyFilter(script.filterSource);
  });
};
