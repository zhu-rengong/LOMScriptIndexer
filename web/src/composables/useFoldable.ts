export const useFoldMemory = (key: string, open: Ref<boolean>): void => {
  if (!key) return;
  const fold = useFoldStore();
  const stored = fold.recall(key);
  if (stored !== undefined) open.value = stored;
  watch(open, (value) => fold.remember(key, value), { flush: "sync" });
};

export const useFoldable = (
  key: string,
  open: Ref<boolean>,
  enabled: () => boolean = () => true,
): string => {
  useFoldMemory(key, open);
  const fold = useFoldStore();
  const id = useId();

  watch(
    enabled,
    (active) => {
      if (active) fold.register(id, open);
      else fold.unregister(id);
    },
    { immediate: true, flush: "sync" },
  );

  onUnmounted(() => fold.unregister(id));

  return id;
};
