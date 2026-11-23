import { router } from "../router";
import { refreshNavHistory } from "./navHistory";

type LayerState = {
  back?: unknown;
  current?: unknown;
  forward?: unknown;
  position?: number;
  siBack?: boolean;
};

let depth = 0;
let entry = false;
let timer = 0;
let selfPop = false;
let popHandler: (() => void) | null = null;

const stateOf = (): LayerState => (window.history.state || {}) as LayerState;

const cancelPending = (): void => {
  if (!timer) return;
  window.clearTimeout(timer);
  timer = 0;
};

const consume = (): void => {
  if (!entry) return;
  entry = false;
  selfPop = true;
  window.history.back();
};

export const pushBackLayer = (): void => {
  cancelPending();
  depth += 1;
  if (entry) return;
  entry = true;
  const state = stateOf();
  window.history.pushState(
    {
      ...state,
      back: state.current ?? state.back ?? null,
      forward: null,
      position: typeof state.position === "number" ? state.position + 1 : 1,
      siBack: true,
    },
    "",
  );
  refreshNavHistory();
};

export const popBackLayer = (): void => {
  depth = Math.max(0, depth - 1);
  if (depth > 0 || !entry) return;
  cancelPending();
  timer = window.setTimeout(() => {
    timer = 0;
    consume();
  }, 0);
};

export const takeBackLayer = (): boolean => {
  cancelPending();
  if (!entry || !stateOf().siBack) return false;
  entry = false;
  depth = Math.max(0, depth - 1);
  return true;
};

export const releaseBackLayer = (): void => {
  depth = Math.max(0, depth - 1);
  if (depth > 0 || !entry) return;
  cancelPending();
  entry = false;
  const state = stateOf();
  if (!state.siBack) return;
  window.history.replaceState({ ...state, siBack: false }, "");
  refreshNavHistory();
};

export const installBackLayer = (onPop: () => void): void => {
  popHandler = onPop;
  window.addEventListener("popstate", (event) => {
    const state = (event.state || {}) as LayerState;
    if (state.siBack) {
      refreshNavHistory();
      return;
    }
    if (!entry) {
      refreshNavHistory();
      return;
    }
    cancelPending();
    entry = false;
    depth = 0;
    const self = selfPop;
    selfPop = false;
    refreshNavHistory();
    if (!self) popHandler?.();
  });
  router.afterEach(() => {
    const state = stateOf();
    if (!state.siBack) return;
    window.history.replaceState({ ...state, siBack: false }, "");
    entry = false;
    refreshNavHistory();
  });
};
