import { defineStore } from "pinia";

export const useUiStore = defineStore("ui", () => {
  const toastText = ref("");
  const ioText = ref("");

  let timer: ReturnType<typeof setTimeout> | null = null;

  const toast = (message: string): void => {
    if (!message) return;
    toastText.value = message;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      toastText.value = "";
      timer = null;
    }, 2400);
  };

  const setIoStatus = (message: string): void => {
    ioText.value = message ? String(message) : "";
  };

  return { toastText, ioText, toast, setIoStatus };
});
