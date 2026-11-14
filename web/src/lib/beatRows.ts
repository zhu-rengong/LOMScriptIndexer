import type {
  BattleEvent,
  BattleLine,
  BattlePart,
  BattleTableRow,
  BattleView,
  BattleWhen,
  BeatNode,
  BranchView,
  CheckRef,
  EndingView,
  JumpView,
  MetaView,
  OptionView,
  SayKind,
  SceneView,
} from "../types/beats";
import type { ConditionNode } from "../types/condition";
import { stripMarkup } from "./richText";

export const BEAT_TAG = {
  say: "say",
  choice: "choice",
  branch: "branch",
  jump: "jump",
  meta: "meta",
  lore: "lore",
  scene: "scene",
  ending: "ending",
  battle: "battle",
} as const;

export type BeatKind = keyof typeof BEAT_TAG;

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export const asList = <T = unknown>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

export const asString = (value: unknown): string => (typeof value === "string" ? value : "");

export const asNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const isBeat = (row: unknown, kind: BeatKind): boolean =>
  asRecord(row)?.t === BEAT_TAG[kind];

export const parseSay = (
  row: BeatNode,
): { speaker: string; text: string; mode: string; expression: string; offstage: boolean } => {
  const record = asRecord(row) || {};
  return {
    speaker: asString(record.speaker),
    text: asString(record.text),
    mode: asString(record.mode) || "dialog",
    expression: asString(record.expression),
    offstage: record.offstage === true,
  };
};

export const sayKindOf = (mode: string): SayKind => {
  if (mode === "dialog") return "dialog";
  return mode === "think" ? "think" : "narration";
};

export const parseCheck = (value: unknown): CheckRef | null => {
  const record = asRecord(value);
  if (!record || !asString(record.key)) return null;
  return {
    key: asString(record.key),
    kind: asString(record.kind),
    expectedResult: typeof record.expectedResult === "number" ? record.expectedResult : null,
  };
};

export const parseOption = (item: unknown): OptionView => {
  const record = asRecord(item) || {};
  return {
    text: asString(record.text),
    requirement: asRecord(record.requirement),
    beats: asList<BeatNode>(record.rows),
    lockedText: asString(record.lock),
    detail: asRecord(record.detail),
    condition: (asRecord(record.condition) as ConditionNode | null) ?? null,
  };
};

export const parseChoice = (row: BeatNode): OptionView[] =>
  asList<unknown>((asRecord(row) || {}).options).map(parseOption);

export const parseBranch = (row: BeatNode): BranchView => {
  const record = asRecord(row) || {};
  return {
    check: parseCheck(record.check),
    condition: (asRecord(record.condition) as ConditionNode | null) ?? null,
    source: asString(record.source),
    beats: asList<BeatNode>(record.rows),
    group: asNumber(record.group, 0),
  };
};

export const parseJump = (row: BeatNode): JumpView => {
  const record = asRecord(row) || {};
  const view: JumpView = {
    target: asString(record.target),
    dynamicSource: asString(record.dynamic),
  };
  const position = asString(record.position);
  if (!position) return view;
  view.position = position;
  view.targets = asList<unknown>(record.targets).map(asString).filter(Boolean);
  return view;
};

export const parseScene = (row: BeatNode): SceneView => {
  const record = asRecord(row) || {};
  return {
    scene: asString(record.scene),
    sceneKey: asString(record.sceneKey),
    nextScene: asString(record.nextScene),
    afterScript: asString(record.afterScript),
  };
};

export const parseEnding = (row: BeatNode): EndingView => {
  const record = asRecord(row) || {};
  return {
    key: asString(record.key),
    title: asString(record.title),
    desc: asString(record.desc)
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean),
  };
};

export const parseMeta = (row: BeatNode): MetaView => {
  const record = asRecord(row) || {};
  return {
    kind: asString(record.kind),
    key: asString(record.key),
    value: typeof record.value === "number" ? record.value : null,
    hidden: record.hidden === true,
    extra: asString(record.extra),
  };
};

const parseBattleLine = (value: unknown): BattleLine => {
  const row = asRecord(value) || {};
  return {
    kind: asString(row.kind),
    speaker: asString(row.speaker),
    mode: asString(row.mode) || "dialog",
    target: asString(row.target),
    key: asString(row.key),
    sceneName: asString(row.scene),
    text: asString(row.text),
  };
};

const tightenCjk = (text: string): string =>
  text.replace(/(?<=[\u4e00-\u9fff])\s+(?=\d)|(?<=\d)\s+(?=[\u4e00-\u9fff])/g, "");

const parseBattlePart = (value: unknown): BattlePart => {
  const item = asRecord(value) || {};
  return {
    text: tightenCjk(asString(item.text)),
    kind: asString(item.kind),
    key: asString(item.key),
  };
};

const parseBattleWhen = (value: unknown): BattleWhen => {
  const row = asRecord(value) || {};
  return { logic: asString(row.logic), parts: asList<unknown>(row.parts).map(parseBattlePart) };
};

export const parseBattle = (row: BeatNode): BattleView => {
  const outer = asRecord(row) || {};
  const info = asRecord(outer.card) || {};
  return {
    scene: asString(outer.scene),
    sceneKey: asString(outer.sceneKey),
    nextScene: asString(outer.nextScene),
    afterScript: asString(outer.afterScript),
    kind: asString(info.kind),
    title: asString(info.title),
    speaker: asString(info.speaker),
    note: asString(info.note),
    goals: asList<unknown>(info.goals).map(asString),
    facts: asList<unknown>(info.facts).map(asString),
    rows: asList<unknown>(info.rows).map((item) => {
      const record = asRecord(item) || {};
      return {
        label: asString(record.label),
        value: tightenCjk(asString(record.value)),
      } as BattleTableRow;
    }),
    events: asList<unknown>(info.events).map((item) => {
      const record = asRecord(item) || {};
      return {
        when: parseBattleWhen(record.when),
        lines: asList<unknown>(record.lines).map(parseBattleLine),
      } as BattleEvent;
    }),
  };
};

export const parseLore = (row: BeatNode): string => asString((asRecord(row) || {}).text);

export const walkRows = (rows: unknown, visit: (row: BeatNode) => void): void => {
  for (const row of asList<BeatNode>(rows)) {
    if (!asRecord(row)?.t) continue;
    visit(row);
    if (isBeat(row, "choice")) {
      for (const item of parseChoice(row)) walkRows(item.beats, visit);
    } else if (isBeat(row, "branch")) {
      walkRows(parseBranch(row).beats, visit);
    }
  }
};

export const plainTextOf = (rows: unknown): string => {
  const parts: string[] = [];
  walkRows(rows, (row) => {
    if (isBeat(row, "say")) parts.push(stripMarkup(parseSay(row).text));
    else if (isBeat(row, "choice")) {
      for (const item of parseChoice(row)) parts.push(stripMarkup(item.text));
    } else if (isBeat(row, "lore")) parts.push(stripMarkup(parseLore(row)));
    else if (isBeat(row, "ending")) {
      const ending = parseEnding(row);
      if (ending.title) parts.push(stripMarkup(ending.title));
      for (const line of ending.desc) parts.push(stripMarkup(line));
    } else if (isBeat(row, "battle")) {
      for (const event of parseBattle(row).events) {
        for (const line of event.lines) {
          if (line.kind !== "say" && line.kind !== "status" && line.kind !== "support") continue;
          if (line.text) parts.push(stripMarkup(line.text));
        }
      }
    }
  });
  return parts.join("\n");
};

export const firstSay = (rows: unknown): { speaker: string; text: string } | null => {
  let found: { speaker: string; text: string } | null = null;
  walkRows(rows, (row) => {
    if (found || !isBeat(row, "say")) return;
    const said = parseSay(row);
    found = { speaker: said.speaker, text: stripMarkup(said.text) };
  });
  return found;
};
