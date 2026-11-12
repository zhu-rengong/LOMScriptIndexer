import type {
  BattleEvent,
  BattleLine,
  BattlePart,
  BattleRow,
  BattleView,
  BattleWhen,
  BeatRow,
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
  Array.isArray(row) && row.length > 0 && row[0] === BEAT_TAG[kind];

export const parseSay = (
  row: BeatRow,
): { speaker: string; text: string; mode: string; expression: string } => ({
  speaker: asString(row[1]),
  text: asString(row[2]),
  mode: asString(row[3]) || "dialog",
  expression: asString(row[4]),
});

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
  const row = asList(item);
  return {
    text: asString(row[0]),
    requirement: asRecord(row[1]),
    beats: asList<BeatRow>(row[2]),
    lockedText: asString(row[3]),
    detail: asRecord(row[4]),
    condition: asRecord(row[5]) as ConditionNode | null,
  };
};

export const parseChoice = (row: BeatRow): OptionView[] =>
  asList<unknown>(row[1]).filter(Array.isArray).map(parseOption);

export const parseBranch = (row: BeatRow): BranchView => ({
  check: parseCheck(row[1]),
  condition: asRecord(row[2]) as ConditionNode | null,
  source: asString(row[3]),
  beats: asList<BeatRow>(row[4]),
  group: asNumber(row[5], 0),
});

export const parseJump = (row: BeatRow): JumpView => {
  const view: JumpView = {
    target: asString(row[1]),
    dynamicSource: asString(row[2]),
  };
  const meta = asRecord(row[3]);
  if (!meta) return view;
  const position = asString(meta.position);
  if (!position) return view;
  view.position = position;
  view.targets = asList<unknown>(meta.targets).map(asString).filter(Boolean);
  return view;
};

export const parseScene = (row: BeatRow): SceneView => ({
  scene: asString(row[1]),
  sceneKey: asString(row[2]),
  nextScene: asString(row[3]),
  afterScript: asString(row[4]),
});

export const parseEnding = (row: BeatRow): EndingView => ({
  key: asString(row[1]),
  title: asString(row[2]),
  desc: asString(row[3])
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean),
});

export const parseMeta = (row: BeatRow): MetaView => ({
  kind: asString(row[1]),
  key: asString(row[2]),
  value: typeof row[3] === "number" ? (row[3] as number) : null,
  hidden: row[4] === true,
});

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

const parseBattlePart = (value: unknown): BattlePart => {
  const item = asRecord(value) || {};
  return { text: asString(item.text), kind: asString(item.kind), key: asString(item.key) };
};

const parseBattleWhen = (value: unknown): BattleWhen => {
  const row = asRecord(value) || {};
  return { logic: asString(row.logic), parts: asList<unknown>(row.parts).map(parseBattlePart) };
};

export const parseBattle = (row: BeatRow): BattleView => {
  const info = asRecord(row[4]) || {};
  return {
    scene: asString(row[1]),
    sceneKey: asString(row[2]),
    nextScene: asString(row[3]),
    afterScript: asString(row[5]),
    kind: asString(info.kind),
    title: asString(info.title),
    speaker: asString(info.speaker),
    note: asString(info.note),
    goals: asList<unknown>(info.goals).map(asString),
    facts: asList<unknown>(info.facts).map(asString),
    rows: asList<unknown>(info.rows).map((item) => {
      const record = asRecord(item) || {};
      return { label: asString(record.label), value: asString(record.value) } as BattleRow;
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

export const parseLore = (row: BeatRow): string => asString(row[1]);

export const walkRows = (rows: unknown, visit: (row: BeatRow) => void): void => {
  for (const row of asList<BeatRow>(rows)) {
    if (!Array.isArray(row) || !row.length) continue;
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
