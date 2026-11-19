import { defineStore } from "pinia";
import { dataset } from "../data/dataset";
import { textStore } from "../data/text";
import { syncLocale } from "../i18n";
import { applyFilter, resetFilterContext } from "../lib/filter";
import { lang as langState } from "../lib/lang";
import { pinia } from "./index";
import { usePanelsStore } from "./panels";
import { useScriptStore } from "./script";
import { useSearchStore } from "./search";

export const useLanguageStore = defineStore("language", () => {
  let token = 0;

  const switchTo = async (id: string): Promise<void> => {
    if (!id) return;
    const script = useScriptStore(pinia);
    const panels = usePanelsStore(pinia);
    const search = useSearchStore(pinia);
    const current = ++token;
    const content = dataset.meta.langs.indexOf(id) >= 0 ? id : script.textLang();
    const ok = await textStore.ensureHead(content);
    if (current !== token || !ok) return;
    if (!script.setLang(id)) return;
    syncLocale(id);
    langState.applyDocument(id);
    panels.hideLookup();
    search.invalidate();
    search.warm();
    resetFilterContext();
    if (script.filterSource.trim()) applyFilter(script.filterSource);
  };

  return { switchTo };
});
