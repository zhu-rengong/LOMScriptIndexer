import { t } from "../i18n";
import type { BattleText, BattleVar } from "../types/beats";

const resolveVar = (value: BattleVar, joiner: string): string | number => {
  if (Array.isArray(value)) return value.map((item) => resolveVar(item, joiner)).join(joiner);
  if (typeof value === "object" && value !== null) return battleText(value);
  return value;
};

export const battleText = (value: BattleText | null | undefined): string => {
  if (!value) return "";
  if (!value.textKey) return value.text || "";
  const joiner = t(value.joiner || "battle.joinList");
  const vars: Record<string, string | number> = {};
  for (const [name, raw] of Object.entries(value.vars || {})) {
    vars[name] = resolveVar(raw, joiner);
  }
  return t(value.textKey, vars);
};
