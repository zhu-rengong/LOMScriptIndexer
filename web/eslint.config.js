import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import skipFormatting from "@vue/eslint-config-prettier/skip-formatting";
import pluginVue from "eslint-plugin-vue";

export default defineConfigWithVueTs(
  {
    name: "app/files-to-lint",
    files: ["**/*.{ts,mts,tsx,vue}"],
  },
  {
    name: "app/files-to-ignore",
    ignores: [
      "node_modules/**",
      "docs/**",
      "public/**",
      "schema.json",
      "src/auto-imports.d.ts",
      "src/components.d.ts",
      "src/types/contract.ts",
      "src/types/generated.ts",
    ],
  },
  pluginVue.configs["flat/recommended"],
  vueTsConfigs.recommended,
  {
    name: "app/rules",
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/require-default-prop": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  skipFormatting,
);
