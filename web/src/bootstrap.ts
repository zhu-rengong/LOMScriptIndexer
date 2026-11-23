import "./styles/index.css";
import { createAppShell } from "./app";
import App from "./components/App.vue";
import { graph } from "./data/graph";
import { textStore } from "./data/text";
import { syncLocale } from "./i18n";
import { applyFilter } from "./lib/filter";
import { installNavHistory } from "./lib/navHistory";
import { router, scriptIdOf, showScript } from "./router";

export const start = (): void => {
  const app = createAppShell(App);
  app.use(router);
  usePrefsStore(pinia);

  const script = useScriptStore(pinia);
  const search = useSearchStore(pinia);
  script.restoreLang();
  syncLocale(script.lang);

  app.mount("#app");
  installNavHistory();

  watch(
    () => script.lang,
    (lang) => syncLocale(lang),
  );

  watch(
    () => script.selectedId,
    (id) => showScript(id),
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
