import { checkpoints } from "../data/checkpoints";
import { flagFacts, flagFactKey, flagMeasureKey } from "../data/flagFacts";
import { graph } from "../data/graph";
import { missions } from "../data/missions";
import { names } from "../data/names";
import { t } from "../i18n";
import { pinia } from "../stores";
import { useViewStore } from "../stores/view";
import type { CheckRef, MetaSeal, MissionEventView } from "../types/beats";
import type { CheckpointModel, ConditionNode, PositionCandidate } from "../types/condition";
import { signedNumber } from "./browser";

let viewHandle: ReturnType<typeof useViewStore> | null = null;

const view = (): ReturnType<typeof useViewStore> => (viewHandle ??= useViewStore(pinia));

export type ConditionPart =
  | { text: string }
  | {
      htmlTag: "span" | "button";
      className: string;
      title?: string;
      seal?: "true" | "false";
      role?: string;
      kind?: string;
      lookup?: { kind: string; key: string };
      children: ConditionPart[];
    };
type FlagFact = { text: string; flag: string; seal: "true" | "false" };
const LOOKUP_KINDS = new Set(["stat", "rel", "flag"]);
const INLINE_LOOKUP_KINDS = new Set(["stat", "rel", "flag", "check"]);
const BINARY_FLAGS = new Set(
  Object.entries(flagFacts)
    .filter(([, table]) => {
      const values = Object.keys(table.values);
      return (
        values.length > 0 &&
        values.includes("1") &&
        values.every((value) => value === "0" || value === "1")
      );
    })
    .map(([flag]) => flag),
);

export const kindText = (kind: string): string => t(`vk.${kind}`, { defaultValue: kind || "" });

export const checkKindText = (kind: string): string =>
  t(`ck.${kind}`, { defaultValue: kind || "" });

const groupText = (op: string): string => t(`grp.${op}`, { defaultValue: op || "" });

const GROUP_JOIN: Record<string, string> = {
  sum: " + ",
  product: " × ",
};

const groupJoin = (op?: string): string => GROUP_JOIN[op || "sum"] ?? t("cGroupSep");

const displayNameOf = (kind: string, key: string): string => names.label(kind, key);

const negativeSuffix = (node: ConditionNode): string =>
  "negative" in node && node.negative ? "×-1" : "";

const singleChild = (node: ConditionNode): ConditionNode | null => {
  if (node.tag !== "group") return null;
  const items = node.items || [];
  if (items.length !== 1 || node.negative) return null;
  if (node.op && node.op !== "sum") return null;
  return items[0];
};

export const facetUsageCount = (kind: string, key: string): number => {
  if (!key) return 0;
  if (kind === "flag") {
    const usage = graph.flagUsage(key);
    return usage.writers.length + usage.checkers.length;
  }
  return graph.nodesWithFacet(kind, key).length;
};

export const localizedName = (node: { kind?: string; key?: string } | null): string =>
  node && node.kind ? displayNameOf(node.kind, node.key || "") : "";

const leafNode = (node: ConditionNode | undefined): ConditionNode | null => {
  if (!node) return null;
  if (node.tag !== "group") return node;
  const child = singleChild(node);
  return child ? leafNode(child) : null;
};

const MEASURE_OPS = new Set(["=", "≠", "<", "≤", ">", "≥"]);

const FLIPPED_OP: Record<string, string> = {
  "=": "=",
  "≠": "≠",
  "<": ">",
  "≤": "≥",
  ">": "<",
  "≥": "≤",
};

const flagMeasureLabel = (flag: string): string => {
  const key = flagMeasureKey(flag);
  if (!key) return "";
  const text = t(key);
  return text === key ? "" : text;
};

const flagMeasureText = (flag: string, op: string, value: unknown): string => {
  const label = flagMeasureLabel(flag);
  if (!label) return "";
  return `${label} ${op} ${String(value ?? "")}`;
};

const flagValueText = (flag: string, value: string, negated: boolean): string => {
  const key = flagFactKey(flag, value, negated);
  if (!key) return "";
  const text = t(key);
  return text === key ? "" : text;
};

const binaryFlagFact = (flag: string, op: string, value: string): FlagFact | null => {
  if (!BINARY_FLAGS.has(flag)) return null;
  if (op !== "=" && op !== "≠") return null;
  if (value !== "0" && value !== "1") return null;
  const text = flagValueText(flag, "1", false);
  if (!text) return null;
  const positive = (op === "=") === (value === "1");
  return { text, flag, seal: positive ? "true" : "false" };
};

const flagFactOf = (node: ConditionNode): FlagFact | null => {
  if (node.tag !== "compare") return null;
  const op = node.op || "";
  const left = leafNode(node.left);
  const right = leafNode(node.right);
  const flagNode =
    left && left.tag === "var" && left.kind === "flag"
      ? left
      : right && right.tag === "var" && right.kind === "flag"
        ? right
        : null;
  if (!flagNode || flagNode.negative) return null;
  const valueNode = flagNode === left ? right : left;
  if (!valueNode || valueNode.tag !== "const") return null;
  const value = String(valueNode.value ?? "");
  const binary = binaryFlagFact(flagNode.key, op, value);
  if (binary) return binary;
  if (op === "=" || op === "≠") {
    const text = flagValueText(flagNode.key, value, op === "≠");
    if (text) return { text, flag: flagNode.key, seal: "true" };
  }
  if (!MEASURE_OPS.has(op)) return null;
  const displayOp = flagNode === left ? op : FLIPPED_OP[op] || op;
  const text = flagMeasureText(flagNode.key, displayOp, valueNode.value);
  return text ? { text, flag: flagNode.key, seal: "true" } : null;
};

const flagFactDisplayText = (fact: { text: string; seal: MetaSeal }): string =>
  fact.seal === "false" ? t("cFactNot", { name: fact.text }) : fact.text;

const namedCompareValue = (
  node: ConditionNode | undefined,
  other: ConditionNode | undefined,
  op: string,
): string => {
  if (op !== "=" && op !== "≠") return "";
  const value = leafNode(node);
  const variable = leafNode(other);
  if (!value || value.tag !== "const" || !variable || variable.tag !== "var") return "";
  if (variable.kind !== "stat") return "";
  const raw = String(value.value ?? "");
  const label = displayNameOf(variable.key, raw);
  return label && label !== raw ? label : "";
};

const operandText = (
  node: ConditionNode | undefined,
  other: ConditionNode | undefined,
  op: string,
  infer: boolean,
): string => namedCompareValue(node, other, op) || condTextWith(node || null, infer);

const condTextWith = (node: ConditionNode | null, infer: boolean): string => {
  if (!node) return "";
  switch (node.tag) {
    case "const":
      return String(node.value ?? "");
    case "random":
      return t("cRandom", { min: node.min, max: node.max });
    case "dice":
      return t("cDice");
    case "var":
      return (
        t("cVar", {
          type: kindText(node.kind),
          name: displayNameOf(node.kind, node.key),
        }) + negativeSuffix(node)
      );
    case "check":
      return (
        t("cVar", {
          type: checkKindText(node.kind),
          name: displayNameOf("check", node.key),
        }) + negativeSuffix(node)
      );
    case "group": {
      const child = singleChild(node);
      if (child) return condTextWith(child, infer);
      const items = node.items || [];
      const op = node.op || "";
      return (
        t("cGroup", {
          name: node.name || groupText(op),
          group: groupText(op),
          items: items.map((item) => condTextWith(item, infer)).join(groupJoin(op)) || "—",
        }) + negativeSuffix(node)
      );
    }
    case "compare": {
      if (infer) {
        const fact = flagFactOf(node);
        if (fact) return flagFactDisplayText(fact);
      }
      const op = node.op || "?";
      return `${operandText(node.left, node.right, op, infer)} ${op} ${operandText(node.right, node.left, op, infer)}`;
    }
    case "logic": {
      const joiner = ` ${node.op === "or" ? t("cxOr") : t("cxAnd")} `;
      return (node.items || []).map((item) => condTextWith(item, infer)).join(joiner);
    }
    default:
      return "";
  }
};

export const condText = (node: ConditionNode | null): string =>
  condTextWith(node, view().inferEnabled);

export const condTextRaw = (node: ConditionNode | null): string => condTextWith(node, false);

export const condHint = (node: ConditionNode | null): string => {
  if (!node) return "";
  if (!view().inferEnabled) return condTextWith(node, false);
  const inferred = condTextWith(node, true);
  const raw = condTextWith(node, false);
  if (inferred === raw) return inferred;
  return [inferred, raw, t("inferTip")].join("\n");
};

const textPart = (value: string): ConditionPart => ({ text: value });

const span = (
  className: string,
  children: ConditionPart[],
  title?: string,
  seal?: "true" | "false",
): ConditionPart => ({
  htmlTag: "span",
  className,
  children,
  title,
  seal,
});

const chipPart = (node: Extract<ConditionNode, { tag: "var" | "check" }>): ConditionPart => {
  const isCheck = node.tag === "check";
  const kind = isCheck ? "check" : node.kind;
  const key = node.key;
  const label = displayNameOf(kind, key);
  const type = isCheck ? checkKindText(node.kind) : kindText(kind);
  const children: ConditionPart[] = [
    span("cx-type", [textPart(type)]),
    span("cx-name", [textPart(label)]),
  ];
  if ((kind === "flag" || kind === "check") && key && key !== label) {
    children.push(span("cx-id", [textPart(key)]));
  }
  if (node.negative) children.push(span("cx-neg", [textPart("×-1")]));
  const count = facetUsageCount(kind, key);
  const hint = count
    ? t("cxVarTip", { type, name: label, n: count })
    : t("cxVarTipNone", { type, name: label });
  if (INLINE_LOOKUP_KINDS.has(kind) && count > 0) {
    return {
      htmlTag: "button",
      className: "cx-var is-link",
      children,
      title: hint,
      role: "button",
      kind,
      lookup: { kind, key },
    };
  }
  return { htmlTag: "span", className: "cx-var", children, title: hint };
};

const groupPart = (node: Extract<ConditionNode, { tag: "group" }>): ConditionPart => {
  const child = singleChild(node);
  if (child) {
    const leaf = nodePart(child);
    if (node.name && !("text" in leaf) && !leaf.title) leaf.title = node.name;
    return leaf;
  }
  const op = node.op || "";
  const children: ConditionPart[] = [];
  if (op) children.push(span("cx-gtag", [textPart(groupText(op))]));
  const items: ConditionPart[] = [span("cx-bracket", [textPart("[")])];
  const list = node.items || [];
  list.forEach((item, index) => {
    if (index) items.push(span("cx-gsep", [textPart(groupJoin(op))]));
    items.push(nodePart(item));
  });
  if (!list.length) items.push(span("cx-const", [textPart(node.name || "—")]));
  items.push(span("cx-bracket", [textPart("]")]));
  children.push(span("cx-gitems", items));
  if (node.negative) children.push(span("cx-neg", [textPart("×-1")]));
  return span("cx-group", children, node.name || undefined);
};

const nodePart = (node: ConditionNode): ConditionPart => {
  switch (node.tag) {
    case "const":
      return span("cx-const", [textPart(String(node.value ?? ""))]);
    case "random":
      return span("cx-const cx-rand", [textPart(t("cRandom", { min: node.min, max: node.max }))]);
    case "dice":
      return span("cx-dice", [textPart(t("cDice"))]);
    case "var":
    case "check":
      return chipPart(node);
    case "group":
      return groupPart(node);
    default:
      return span("cx-const", [textPart("")]);
  }
};

const factPart = (fact: FlagFact, expr: ConditionNode): ConditionPart => {
  const count = facetUsageCount("flag", fact.flag);
  const title = [
    flagFactDisplayText(fact),
    condTextWith(expr, false),
    t("inferTip"),
    count ? t("cxVarTip", { type: kindText("flag"), name: fact.flag, n: count }) : "",
  ]
    .filter(Boolean)
    .join("\n");
  const children: ConditionPart[] = [span("cx-name", [textPart(fact.text)])];
  if (count > 0) {
    return {
      htmlTag: "button",
      className: "cx-var is-link cx-fact",
      children,
      title,
      seal: fact.seal,
      role: "button",
      kind: "flag",
      lookup: { kind: "flag", key: fact.flag },
    };
  }
  return span("cx-var cx-fact", children, title, fact.seal);
};

const operandPart = (
  node: ConditionNode | undefined,
  other: ConditionNode | undefined,
  op: string,
): ConditionPart => {
  const named = namedCompareValue(node, other, op);
  if (named) return span("cx-const", [textPart(named)]);
  return inlineNodePart(node || null);
};

const inlineNodePart = (
  input: ConditionNode | null,
  infer = view().inferEnabled,
): ConditionPart => {
  if (!input) return span("cx-empty", [textPart(t("lookupCondEmpty"))]);
  if (input.tag === "compare") {
    if (infer) {
      const fact = flagFactOf(input);
      if (fact) return factPart(fact, input);
    }
    const op = input.op || "?";
    return span("cx-cmp", [
      operandPart(input.left, input.right, op),
      span("cx-op", [textPart(op)]),
      operandPart(input.right, input.left, op),
    ]);
  }
  if (input.tag === "logic") {
    const joiner = input.op === "or" ? t("cxOr") : t("cxAnd");
    const children: ConditionPart[] = [];
    (input.items || []).forEach((child, index) => {
      if (index) children.push(span("cx-op", [textPart(joiner)]));
      children.push(inlineNodePart(child, infer));
    });
    return span("cx-cmp", children);
  }
  return nodePart(input);
};

export const condParts = (expr: ConditionNode | null): ConditionPart => {
  if (!expr) return span("cx-expr", []);
  const joiner = expr.tag === "logic" ? (expr.op === "or" ? t("cxOr") : t("cxAnd")) : "";
  const items = expr.tag === "logic" ? expr.items || [] : [expr];
  const lines: ConditionPart[] = items.map((node, index) => {
    const children: ConditionPart[] = [];
    if (index && joiner) children.push(span("cx-logic", [textPart(joiner)]));
    children.push(inlineNodePart(node));
    return span("cx-line", children);
  });
  return span("cx-expr", lines);
};

const checkpointOf = (
  check: CheckRef | null,
): { checkpoint: CheckpointModel; kind: string } | null => {
  if (!check || !check.key) return null;
  const checkpoint = checkpoints.getByKey(check.key, check.kind);
  if (!checkpoint) return null;
  return { checkpoint, kind: checkpoint.kind || check.kind };
};

export const checkpointExpr = (
  check: CheckRef | null,
  result?: number | null,
): ConditionNode | null => {
  const found = checkpointOf(check);
  if (!found) return null;
  const branches = found.checkpoint.branches || [];
  if (!branches.length) return null;
  const expectedResult = result === undefined ? check?.expectedResult : result;
  if (found.kind === "condition") return branches[0].expr || null;
  if (found.kind !== "switch" && found.kind !== "dice") return null;
  if (expectedResult === null || expectedResult === undefined) return null;
  for (const branch of branches) {
    if (branch.result === expectedResult) return branch.expr || null;
  }
  return null;
};

export type ConditionFallback = { lineCount: number; excluded: ConditionNode[] };

export const checkpointFallback = (
  check: CheckRef | null,
  result?: number | null,
): ConditionFallback | null => {
  const found = checkpointOf(check);
  if (!found) return null;
  if (found.kind !== "switch" && found.kind !== "dice") return null;
  const expectedResult = result === undefined ? check?.expectedResult : result;
  if (expectedResult === null || expectedResult === undefined) return null;
  if (found.checkpoint.fallback === undefined || expectedResult !== found.checkpoint.fallback)
    return null;
  const branches = found.checkpoint.branches || [];
  const excluded: ConditionNode[] = [];
  for (const branch of branches) if (branch && branch.expr) excluded.push(branch.expr);
  return { lineCount: branches.length, excluded };
};

export const positionTargetId = (prefix: string, name: string): string =>
  prefix && name ? `${prefix}_${name}` : "";

export const positionMaxWeight = (candidate: PositionCandidate): number => {
  if (candidate.active && candidate.activeEmpty) return 0;
  let total = Number.isFinite(candidate.rate) ? candidate.rate : 0;
  for (const item of candidate.adjustments || []) {
    if (item && item.rate > 0) total += item.rate;
  }
  return total;
};

export const positionNeverReachable = (candidate: PositionCandidate): boolean =>
  positionMaxWeight(candidate) <= 0;

const signed = (value: number | null | undefined): string =>
  typeof value === "number" ? signedNumber(value) : "";

const gain = (label: string, count: number | null): string => {
  if (typeof count === "number" && count < 0) return t("metaLose", { label });
  if (typeof count === "number" && count > 1) return t("metaGainCount", { label, count });
  return t("metaGain", { label });
};

const missionName = (missionId: string): string => {
  if (!missionId) return "";
  if (missions.isMain(missionId)) return t("missionMain");
  const note = names.label("mission", missionId);
  return note && note !== missionId ? note : missionId;
};

const stateNoteOf = (key: string): string => {
  const note = names.label("missionState", key);
  return note && note !== key ? note : "";
};

const missionText = (key: string, extra: string): string => {
  if (!key) return "";
  const missionId = missions.missionIdOf(key, extra);
  if (!missionId) return key === "clear" ? "" : t("metaMissionRaw", { key });
  if (key === "clear") {
    return t("metaMissionClear", { mission: missionName(missionId) });
  }
  const name = stateNoteOf(key) || missionName(missionId);
  return t("metaMission", { name });
};

const missionTriggerText = (key: string, value: number | null): string => {
  const missionId = key && key !== "0" ? key : "";
  const name = missionId ? missionName(missionId) : "";
  if (value === 1) {
    return name ? t("metaMissionTrigger", { name }) : t("metaMissionUntrigger");
  }
  return name ? t("metaMissionUntriggerName", { name }) : t("metaMissionUntrigger");
};

export const missionEventView = (
  kind: string,
  key: string,
  value: number | null,
  extra: string,
): MissionEventView => {
  if (kind === "missionTrigger") {
    const missionId = key && key !== "0" ? key : "";
    return {
      type: value === 1 ? "trigger" : "cancel",
      code: missionId,
      name: missionName(missionId),
    };
  }
  const missionId = missions.missionIdOf(key, extra);
  if (key === "clear") return { type: "end", code: missionId, name: missionName(missionId) };
  return { type: "trigger", code: key, name: stateNoteOf(key) || missionName(missionId) };
};

export const metaText = (kind: string, key: string, value: number | null, extra = ""): string => {
  if (kind === "stat") {
    const name = displayNameOf("stat", key);
    const delta = signed(value);
    return delta ? t("metaValue", { name, delta }) : name;
  }
  if (kind === "rel") {
    const name = displayNameOf("rel", key);
    const delta = signed(value);
    return delta
      ? t("metaRelation", { name, delta })
      : t("metaRelation", { name, delta: "" }).trim();
  }
  if (kind === "flag") {
    const name = displayNameOf("flag", key);
    const delta = signed(value);
    return delta ? t("metaFlag", { name, delta }) : name;
  }
  if (kind === "setflag") {
    return t("metaAssignFlag", { name: displayNameOf("flag", key), value });
  }
  if (kind === "setstat") {
    return t("metaAssign", { name: displayNameOf("stat", key), value });
  }
  if (kind === "setrel") {
    return t("metaAssignRelation", { name: displayNameOf("rel", key), value });
  }
  if (kind === "settitle") {
    return t("metaSetTitle", { name: displayNameOf("title", String(value ?? "")) });
  }
  if (kind === "setlover") {
    return t("metaSetLover", { name: displayNameOf("lover", String(value ?? "")) });
  }
  if (kind === "book") return gain(t("metaBook", { name: displayNameOf("book", key) }), value);
  if (kind === "misc") return gain(t("metaItem", { name: displayNameOf("misc", key) }), value);
  if (kind === "special") {
    return gain(t("metaItem", { name: displayNameOf("special", key) }), value);
  }
  if (kind === "talent") {
    const name = displayNameOf("talent", key);
    const forget = typeof value === "number" && value < 0;
    return t(forget ? "metaForgetTalent" : "metaTalent", {
      name,
      value: Math.abs(value ?? 0),
    });
  }
  if (kind === "library") return t("metaLibrary", { name: displayNameOf("chronicle", key) });
  if (kind === "mission") return missionText(key, extra);
  if (kind === "missionTrigger") return missionTriggerText(key, value);
  if (kind === "dice") return t("metaDice", { name: displayNameOf("check", key) });
  return "";
};

const flagSetFact = (
  flag: string,
  value: number | null,
): { text: string; seal: MetaSeal } | null => {
  if (typeof value !== "number") return null;
  if (BINARY_FLAGS.has(flag)) {
    if (value !== 0 && value !== 1) return null;
    const text = flagValueText(flag, "1", false);
    return text ? { text, seal: value === 1 ? "true" : "false" } : null;
  }
  const key = flagFactKey(flag, String(value), false);
  if (!key) return null;
  const text = t(key);
  return text === key ? null : { text, seal: "infer" };
};

const flagMetaText = (kind: string, key: string, value: number | null): string => {
  const label = flagMeasureLabel(key);
  if (!label) return "";
  if (kind === "setflag") {
    if (typeof value !== "number") return "";
    return t("metaAssign", { name: label, value });
  }
  const delta = signed(value);
  return delta ? t("metaValue", { name: label, delta }) : "";
};

export const metaDisplay = (
  kind: string,
  key: string,
  value: number | null,
  extra = "",
): { text: string; title: string; seal?: MetaSeal } => {
  const raw = metaText(kind, key, value, extra);
  const fallbackTitle = raw.length > 24 ? raw : "";
  if (kind === "mission" || kind === "missionTrigger") {
    const missionId =
      kind === "mission" ? missions.missionIdOf(key, extra) : key && key !== "0" ? key : "";
    const name = missionName(missionId);
    return { text: raw, title: [name, key].filter(Boolean).join(" · ") };
  }
  if (!view().inferEnabled || (kind !== "setflag" && kind !== "flag")) {
    return { text: raw, title: fallbackTitle };
  }
  const measure = flagMetaText(kind, key, value);
  const fact =
    (kind === "setflag" ? flagSetFact(key, value) : null) ||
    (measure ? { text: measure, seal: "infer" as const } : null);
  if (!fact) return { text: raw, title: fallbackTitle };
  return {
    text: fact.text,
    title: [flagFactDisplayText(fact), raw, t("inferTip")].filter(Boolean).join("\n"),
    seal: fact.seal,
  };
};

export const metaTarget = (kind: string, key: string): { kind: string; key: string } | null => {
  if (!key) return null;
  if (kind === "setflag") return { kind: "flag", key };
  if (kind === "mission") {
    return missions.missionOfState(key) ? { kind: "mission", key } : null;
  }
  return LOOKUP_KINDS.has(kind) ? { kind, key } : null;
};

export const requirementText = (requirement: Record<string, unknown> | null): string => {
  if (!requirement || typeof requirement !== "object") return "";
  const operand = requirement.operand === undefined ? "" : String(requirement.operand);
  const op = typeof requirement.op === "string" ? requirement.op : "";
  if (!op) return operand;
  return t("option.cond", { op, value: operand });
};

export const detailRequirementsText = (detail: Record<string, unknown> | null): string => {
  const requirements = detail && Array.isArray(detail.requirements) ? detail.requirements : [];
  return requirements
    .filter(
      (item: unknown) =>
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).kind === "string" &&
        (item as Record<string, unknown>).kind,
    )
    .map((item: unknown) => {
      const row = item as Record<string, unknown>;
      return t("option.need", {
        label: t(`need.${String(row.kind)}`, { defaultValue: String(row.kind) }),
        op: row.op === undefined ? "" : row.op,
        value: row.value === undefined ? "" : row.value,
      });
    })
    .join(" · ");
};

export const optionHeadText = (text: string, detail: Record<string, unknown> | null): string => {
  const action =
    detail && typeof detail.action === "string" && detail.action
      ? t(`action.${detail.action}`, { defaultValue: detail.action })
      : "";
  if (action && text) return t("optionActionJoin", { action, title: text });
  return action || text || t("optionOther");
};
