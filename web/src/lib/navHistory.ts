import { readonly, ref } from "vue";
import { router } from "../router";

type RouterState = {
  back?: unknown;
  forward?: unknown;
  position?: number;
};

const backAvailable = ref(false);
const forwardAvailable = ref(false);

const stateOf = (): RouterState => (window.history.state || {}) as RouterState;

export const refreshNavHistory = (): void => {
  const state = stateOf();
  backAvailable.value = !!state.back;
  forwardAvailable.value = !!state.forward;
};

export const canBack = readonly(backAvailable);

export const canForward = readonly(forwardAvailable);

export const navBack = (): void => {
  window.history.back();
};

export const navForward = (): void => {
  window.history.forward();
};

export const installNavHistory = (): void => {
  router.afterEach(() => refreshNavHistory());
  window.addEventListener("popstate", refreshNavHistory);
  refreshNavHistory();
};
