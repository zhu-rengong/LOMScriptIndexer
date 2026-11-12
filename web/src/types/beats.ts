import type { ConditionNode } from "./condition";

export type BeatRow = unknown[];

export type CheckRef = { key: string; kind: string; expectedResult?: number | null };

export type OptionView = {
  text: string;
  requirement: Record<string, unknown> | null;
  beats: BeatRow[];
  lockedText: string;
  detail: Record<string, unknown> | null;
  condition: ConditionNode | null;
};

export type BranchView = {
  check: CheckRef | null;
  condition: ConditionNode | null;
  source: string;
  beats: BeatRow[];
  group: number;
  blocks?: ReaderBlock[];
};

export type JumpView = {
  target: string;
  dynamicSource: string;
  position?: string;
  targets?: string[];
};

export type SceneView = {
  scene: string;
  sceneKey: string;
  nextScene: string;
  afterScript: string;
};

export type EndingView = {
  key: string;
  title: string;
  desc: string[];
};

export type MetaView = {
  kind: string;
  key: string;
  value: number | null;
  hidden: boolean;
  extra: string;
};

export type BattleLine = {
  kind: string;
  speaker: string;
  mode: string;
  target: string;
  key: string;
  sceneName: string;
  text: string;
};

export type BattlePart = {
  text: string;
  kind: string;
  key: string;
};

export type BattleWhen = {
  logic: string;
  parts: BattlePart[];
};

export type BattleEvent = {
  when: BattleWhen;
  lines: BattleLine[];
};

export type BattleRow = {
  label: string;
  value: string;
};

export type BattleView = {
  scene: string;
  sceneKey: string;
  nextScene: string;
  afterScript: string;
  kind: string;
  title: string;
  speaker: string;
  note: string;
  goals: string[];
  facts: string[];
  rows: BattleRow[];
  events: BattleEvent[];
};

export type MetaSeal = "infer" | "true" | "false";

export type MetaChip = {
  text: string;
  target: { kind: string; key: string; method?: string } | null;
  match: { kind: string; key: string } | null;
  title?: string;
  seal?: MetaSeal;
  hidden?: boolean;
  jump?: string;
};

export type ChoiceOption = OptionView & { index: number };

export type ReaderBlock =
  | { kind: "say"; mode: string; speaker: string; text: string; expression?: string }
  | { kind: "time"; rounds: number }
  | { kind: "meta"; chips: MetaChip[] }
  | { kind: "dice"; chips: MetaChip[] }
  | { kind: "choice"; options: ChoiceOption[]; diceChips: MetaChip[] }
  | { kind: "branches"; branches: BranchView[] }
  | { kind: "lore"; lines: string[] }
  | { kind: "battle"; battle: BattleView }
  | { kind: "scene"; scene: SceneView }
  | { kind: "ending"; ending: EndingView }
  | { kind: "jump"; jump: JumpView };

export type RichTextSegment = {
  text: string;
  scale: number;
};

export type SayKind = "dialog" | "think" | "narration";

export type ReaderVisibleKind = SayKind | "lore";

export type ReaderVisibility = Record<ReaderVisibleKind, boolean>;
