import { createApp } from "vue";
import type { Component } from "vue";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { queryClient } from "./api/query";
import { pinia } from "./stores";

export const createAppShell = (root: Component): ReturnType<typeof createApp> => {
  const app = createApp(root);
  app.use(pinia);
  app.use(VueQueryPlugin, { queryClient });
  return app;
};
