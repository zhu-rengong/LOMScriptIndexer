import { graph } from "../data/graph";
import { missions } from "../data/missions";
import { names } from "../data/names";
import { textStore } from "../data/text";
import { t } from "../i18n";

import type { BeatRow, BranchView, MetaChip, MetaView, ReaderBlock } from "../types/beats";
import type { GraphEdge, GraphNode } from "../types/graph";
import type { BeatKind } from "./beatRows";
import * as beatRows from "./beatRows";
import { condText, metaDisplay, metaTarget } from "./conditions";
import { stripMarkup } from "./richText";
import { scriptStore as script } from "./scriptStore";

export const speakerName = (id: string): string => {
  if (!id) return "";
  const name = names.speaker(id);
  const title = names.title(id);
  return title ? t("nameWithTitle", { name, title }) : name;
};

export const edgeLabelOf = (edge: GraphEdge): string =>
  textStore.edgeLabel(script().textLang(), String(edge.index), edge.label);

export const branchLabel = (branch: BranchView): string =>
  condText(branch.condition) || branch.source || "";

const MATCH_KINDS: Record<string, string> = {
  stat: "stat",
  setstat: "stat",
  rel: "rel",
  setrel: "rel",
  flag: "flag",
  setflag: "flag",
  dice: "check",
};

const matchOf = (meta: MetaView): MetaChip["match"] => {
  const kind = MATCH_KINDS[meta.kind];
  if (!kind || !meta.key) return null;
  return { kind, key: meta.key };
};

const metaChipOf = (meta: MetaView): { chip: MetaChip | null; isDice: boolean } => {
  const display = metaDisplay(meta.kind, meta.key, meta.value, meta.extra);
  if (!display.text) return { chip: null, isDice: false };
  const target =
    meta.kind === "dice"
      ? meta.key
        ? { kind: "check", key: meta.key }
        : null
      : metaTarget(meta.kind, meta.key);
  const chip: MetaChip = { text: display.text, target, match: matchOf(meta) };
  if (display.title) chip.title = display.title;
  if (display.seal) chip.seal = display.seal;
  if (meta.hidden) chip.hidden = true;
  if (meta.kind === "mission") {
    const start = missions.startOf(meta.key);
    if (start && graph.nodeById.has(start)) chip.jump = start;
  }
  return { chip, isDice: !!target && meta.kind === "dice" };
};

class BlockBuffer {
  readonly blocks: ReaderBlock[] = [];
  readonly metaQueue: MetaView[] = [];
  diceChips: MetaChip[] = [];
  private branches: BranchView[] = [];
  private branchGroup: number | null = null;

  push(block: ReaderBlock): void {
    this.blocks.push(block);
  }

  takeDice(): MetaChip[] {
    const chips = this.diceChips;
    this.diceChips = [];
    return chips;
  }

  flushMeta(): void {
    if (!this.metaQueue.length) return;
    const chips: MetaChip[] = [];
    const dice: MetaChip[] = [];
    for (const meta of this.metaQueue) {
      const { chip, isDice } = metaChipOf(meta);
      if (!chip) continue;
      (isDice ? dice : chips).push(chip);
    }
    this.metaQueue.length = 0;
    if (dice.length) this.diceChips.push(...dice);
    if (chips.length) this.blocks.push({ kind: "meta", chips });
  }

  flushDice(): void {
    if (!this.diceChips.length) return;
    this.blocks.push({ kind: "dice", chips: this.takeDice() });
  }

  flushBranches(): void {
    if (!this.branches.length) return;
    const pending = this.branches;
    this.branches = [];
    this.branchGroup = null;
    this.flushDice();
    const filled = pending.filter((branch) => !!branch.blocks && branch.blocks.length > 0);
    if (filled.length) this.blocks.push({ kind: "branches", branches: filled });
  }

  flushAll(): void {
    this.flushBranches();
    this.flushMeta();
    this.flushDice();
  }

  addBranch(branch: BranchView): void {
    if (this.branches.length && branch.group !== this.branchGroup) this.flushBranches();
    this.branchGroup = branch.group;
    branch.blocks = buildReaderBlocks(branch.beats);
    this.branches.push(branch);
  }
}

type Builder = (buffer: BlockBuffer, row: BeatRow) => void;

const builders: Record<BeatKind, Builder> = {
  branch: (buffer, row) => {
    buffer.flushMeta();
    buffer.addBranch(beatRows.parseBranch(row));
  },
  meta: (buffer, row) => {
    buffer.flushBranches();
    const meta = beatRows.parseMeta(row);
    if (meta.kind === "time" && typeof meta.value === "number") {
      buffer.flushMeta();
      buffer.flushDice();
      buffer.push({ kind: "time", rounds: meta.value });
      return;
    }
    buffer.metaQueue.push(meta);
  },
  choice: (buffer, row) => {
    buffer.flushBranches();
    buffer.flushMeta();
    const options = beatRows.parseChoice(row).map((item, index) => ({ ...item, index }));
    buffer.push({ kind: "choice", options, diceChips: buffer.takeDice() });
  },
  lore: (buffer, row) => {
    buffer.flushAll();
    const lines = stripMarkup(beatRows.parseLore(row))
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    buffer.push({ kind: "lore", lines });
  },
  say: (buffer, row) => {
    buffer.flushAll();
    const said = beatRows.parseSay(row);
    buffer.push({
      kind: "say",
      mode: said.mode,
      speaker: said.speaker,
      text: said.text,
      expression: said.expression,
    });
  },
  battle: (buffer, row) => {
    buffer.flushAll();
    buffer.push({ kind: "battle", battle: beatRows.parseBattle(row) });
  },
  ending: (buffer, row) => {
    buffer.flushAll();
    buffer.push({ kind: "ending", ending: beatRows.parseEnding(row) });
  },
  scene: (buffer, row) => {
    buffer.flushAll();
    buffer.push({ kind: "scene", scene: beatRows.parseScene(row) });
  },
  jump: (buffer, row) => {
    buffer.flushAll();
    buffer.push({ kind: "jump", jump: beatRows.parseJump(row) });
  },
};

export const buildReaderBlocks = (input: unknown): ReaderBlock[] => {
  const buffer = new BlockBuffer();
  for (const row of beatRows.asList<unknown>(input)) {
    if (!Array.isArray(row) || !row.length) continue;
    const tag = row[0];
    if (typeof tag !== "string" || !Object.hasOwn(builders, tag)) continue;
    builders[tag as BeatKind](buffer, row);
  }
  buffer.flushMeta();
  buffer.flushBranches();
  buffer.flushDice();
  return buffer.blocks;
};

export const firstSayTextOf = (node: GraphNode | null): string => {
  if (!node) return "";
  const rows = textStore.beatRows(script().textLang(), node.id);
  if (!rows) return "";
  const first = beatRows.firstSay(rows);
  if (!first) return "";
  if (!first.speaker) return first.text;
  return t("lineSpeaker", { name: speakerName(first.speaker), text: first.text });
};
