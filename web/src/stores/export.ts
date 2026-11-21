export const useExportStore = defineStore("export", () => {
  const running = ref(false);

  return { running };
});
