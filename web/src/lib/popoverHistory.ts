import type { RouteLocationPathRaw } from "vue-router";
import { router } from "../router";
import { stripPanel } from "./overlayRoute";

const baseOf = (): string => {
  const route = router.currentRoute.value;
  return router.resolve({
    path: route.path,
    query: stripPanel(route.query),
    hash: route.hash,
  }).fullPath;
};

class OverlayHistory {
  private pushed: string[] = [];
  private installed = false;

  install(): void {
    if (this.installed) return;
    this.installed = true;
    router.afterEach((to) => this.reconcile(to.fullPath));
  }

  navigate(location: RouteLocationPathRaw, mode: "push" | "replace"): void {
    const target = router.resolve(location).fullPath;
    if (mode === "replace") {
      if (this.pushed.length) this.pushed[this.pushed.length - 1] = target;
      void router.replace(location);
      return;
    }
    this.pushed.push(target);
    void router.push(location).then((failure) => {
      if (!failure) return;
      const index = this.pushed.lastIndexOf(target);
      if (index >= 0) this.pushed.splice(index, 1);
    });
  }

  dismiss(count: number): void {
    const current = router.currentRoute.value.fullPath;
    if (
      count > 0 &&
      this.pushed.length >= count &&
      current === this.pushed[this.pushed.length - 1]
    ) {
      router.go(-count);
      return;
    }
    void router.replace(baseOf());
  }

  private reconcile(path: string): void {
    if (!this.pushed.length) return;
    const index = this.pushed.lastIndexOf(path);
    if (index >= 0) {
      this.pushed = this.pushed.slice(0, index + 1);
      return;
    }
    this.pushed = [];
  }
}

export const overlayHistory = new OverlayHistory();
