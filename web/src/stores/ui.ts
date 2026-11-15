import { defineStore } from "pinia";

export type InfoTab = "stats" | "help" | "changelog";

export const useUiStore = defineStore("ui", () => {
  const toastKey = ref("");
  const toastVars = ref<Record<string, unknown> | undefined>(undefined);
  const ioKey = ref("");
  const ioVars = ref<Record<string, unknown> | undefined>(undefined);
  const infoTab = ref<InfoTab>("stats");

  let timer: ReturnType<typeof setTimeout> | null = null;

  const toast = (key: string, vars?: Record<string, unknown>): void => {
    if (!key) return;
    toastKey.value = key;
    toastVars.value = vars;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      toastKey.value = "";
      toastVars.value = undefined;
      timer = null;
    }, 2400);
  };

  const setIoStatus = (key: string, vars?: Record<string, unknown>): void => {
    ioKey.value = key ? String(key) : "";
    ioVars.value = key ? vars : undefined;
  };

  const setInfoTab = (tab: InfoTab): void => {
    infoTab.value = tab;
  };

  return { toastKey, toastVars, ioKey, ioVars, infoTab, toast, setIoStatus, setInfoTab };
});
