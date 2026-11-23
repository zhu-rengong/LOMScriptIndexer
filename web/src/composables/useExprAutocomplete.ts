import { useTimeoutFn } from "@vueuse/core";
import { stepIndex } from "../lib/listNav";
import { popovers } from "../lib/popover";
import type { OverlayKey } from "../ui/ids";
import { query } from "../lib/query";
import type { QuerySuggestion } from "../types/query";

type SuggestState = {
  items: QuerySuggestion[];
  activeIndex: number;
  from: number;
  to: number;
  mode: string;
};

type AutocompleteOptions = {
  domId: string;
  suggestKey: OverlayKey;
  popoverKey: OverlayKey;
  onChange: () => void;
  onSubmit: () => void;
};

const REFRESH_SUFFIX = /(:|\(|\s)$/;

const emptyState = (): SuggestState => ({
  items: [],
  activeIndex: 0,
  from: 0,
  to: 0,
  mode: "field",
});

export const useExprAutocomplete = (
  input: Ref<HTMLInputElement | null>,
  value: Ref<string>,
  options: AutocompleteOptions,
) => {
  const filter = useFilterStore();
  const state = ref<SuggestState>(emptyState());

  const isOpen = computed(() => popovers.isOpen(options.suggestKey));

  const hide = (): void => {
    popovers.close(options.suggestKey);
  };

  const { start: scheduleHide, stop: cancelHide } = useTimeoutFn(hide, 120, { immediate: false });

  const refresh = (source: string, caret: number): void => {
    const node = input.value;
    if (!node) return;
    if (!source) {
      hide();
      return;
    }
    cancelHide();
    const result = query.suggest(source, caret, filter.queryIndex());
    state.value = {
      items: result.items || [],
      activeIndex: 0,
      from: result.from,
      to: result.to,
      mode: result.mode,
    };
    void nextTick(() => {
      popovers.open(options.suggestKey, { trigger: node });
    });
  };

  const update = (): void => {
    const node = input.value;
    if (!node) return;
    refresh(node.value, node.selectionStart ?? node.value.length);
  };

  const replaceRange = (start: number, end: number, text: string): boolean => {
    const current = value.value || "";
    const next = current.slice(0, start) + text + current.slice(end);
    const caret = start + text.length;
    value.value = next;
    void nextTick(() => {
      const node = input.value;
      if (!node) return;
      node.setSelectionRange(caret, caret);
      node.focus();
    });
    const keep = REFRESH_SUFFIX.test(text);
    if (keep) refresh(next, caret);
    return keep;
  };

  const insert = (text: string): void => {
    const node = input.value;
    if (!node) return;
    replaceRange(node.selectionStart || 0, node.selectionEnd || 0, text);
  };

  const accept = (index?: number): void => {
    const node = input.value;
    const item = state.value.items[index === undefined ? state.value.activeIndex : index];
    if (!node || !item) return;
    const text = item.insert || item.value;
    if (!replaceRange(state.value.from, state.value.to, text)) hide();
    options.onChange();
  };

  const stepActive = (step: number): void => {
    const count = state.value.items.length;
    if (!count) return;
    state.value.activeIndex = stepIndex(state.value.activeIndex, step, count, true);
  };

  const onInput = (): void => {
    options.onChange();
    update();
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const navigating =
      state.value.items.length > 0 &&
      !event.shiftKey &&
      (event.key === "ArrowDown" || event.key === "ArrowUp");
    if (navigating) {
      event.preventDefault();
      stepActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    const picking =
      isOpen.value &&
      state.value.items.length > 0 &&
      (event.key === "Tab" || event.key === "Enter");
    if (picking) {
      event.preventDefault();
      accept(state.value.activeIndex);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      options.onSubmit();
    }
  };

  const onKeyup = (event: KeyboardEvent): void => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(event.key) >= 0) update();
  };

  const onBlur = (): void => {
    scheduleHide();
  };

  onMounted(() => {
    popovers.register(options.suggestKey, {
      id: options.domId,
      group: "menu",
      keep: [options.popoverKey],
      onHide: () => {
        state.value = emptyState();
      },
      placement: { align: "start", gap: 6, matchWidth: true },
    });
  });

  onUnmounted(() => {
    popovers.unregister(options.suggestKey);
  });

  return { state, isOpen, update, hide, insert, accept, onInput, onKeydown, onKeyup, onBlur };
};
