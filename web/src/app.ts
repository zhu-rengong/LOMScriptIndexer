import { VueQueryPlugin } from "@tanstack/vue-query";
import { queryClient } from "./api/query";

export const createAppShell = (root: Component): ReturnType<typeof createApp> => {
  const app = createApp(root);
  app.use(pinia);
  app.use(VueQueryPlugin, { queryClient });
  return app;
};
