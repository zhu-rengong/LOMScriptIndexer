import { checkpoints } from "../data/checkpoints";
import { dataset } from "../data/dataset";
import { graph } from "../data/graph";
import { textStore } from "../data/text";
import { chapterTitle, sceneLabel, sceneText, t, timeText } from "../i18n";
import { pinia } from "../stores";
import { useUiStore } from "../stores/ui";
import type {
  BattleLine,
  BattleView,
  BeatRow,
  BranchView,
  OptionView,
  ReaderBlock,
} from "../types/beats";
import type { CheckpointModel, ConditionNode, PositionCandidate } from "../types/condition";
import type { Chapter, GraphNode } from "../types/graph";
import { buildReaderBlocks, speakerName } from "./blocks";
import { signedNumber } from "./browser";
import {
  checkpointExpr,
  checkpointFallback,
  condText,
  condTextRaw,
  detailRequirementsText,
  optionHeadText,
  positionNeverReachable,
  positionTargetId,
  requirementText,
} from "./conditions";
import { paragraphLines, stripMarkup } from "./richText";
import { scriptStore as script } from "./scriptStore";
import { zipTextFiles } from "./zip";

const SEPARATOR = "=".repeat(78);
const INVALID_PATH = /[\\/:*?"<>|]/g;

const running = ref(false);

export const exportRunning = running;

const cleanText = (value: unknown): string => stripMarkup(value ?? "").replace(/\r\n?/g, "\n");

const inlineText = (value: unknown): string => cleanText(value).replace(/\s+/g, " ").trim();

const withoutControls = (value: string): string => {
  let out = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    out += code <= 0x1f || code === 0x7f ? " " : char;
  }
  return out;
};

const safeSegment = (value: string): string => {
  const text = withoutControls(value)
    .replace(INVALID_PATH, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  return text ? text.slice(0, 80) : "chapter";
};

const sayLines = (mode: string, speaker: string, text: string, indent: string): string[] => {
  const lines = paragraphLines(text);
  if (!lines.length) return [];
  if (mode === "narration" || !speaker) return lines.map((line) => indent + line);
  const name = speakerName(speaker);
  if (!name) return lines.map((line) => indent + line);
  const label = mode === "think" ? `${name}${t("parenWrap", { text: t("typeThink") })}` : name;
  return lines.map((line, index) =>
    index === 0 ? `${indent}${label}${t("colonPrefix", { text: line })}` : `${indent}${line}`,
  );
};

const rawConditionText = (node: ConditionNode | null): string => {
  if (!node) return "";
  const text = condTextRaw(node);
  if (text) return text;
  return node.tag === "raw" ? inlineText(node.text) : "";
};

const conditionLines = (node: ConditionNode | null, indent: string, head = ""): string[] => {
  if (!node) return [];
  const shown = condText(node) || rawConditionText(node);
  if (!shown) return [];
  const out = [`${indent}${head}${shown}`];
  const raw = rawConditionText(node);
  if (raw && raw !== shown) out.push(`${indent}  ${t("exportRawCondition", { text: raw })}`);
  return out;
};

const chipBlockLines = (chips: { text: string }[], indent: string, prefix = ""): string[] => {
  const texts = chips.map((chip) => inlineText(chip.text)).filter(Boolean);
  if (!texts.length) return [];
  const head = prefix ? `[${prefix}] ` : "";
  return [`${indent}- ${head}${texts.join(" ｜ ")}`];
};

const optionCondition = (option: OptionView): ConditionNode | null => {
  const node = option.condition;
  if (!node) return null;
  if (node.tag !== "check") return node;
  const expr = checkpointExpr({ key: node.key, kind: node.kind, expectedResult: null });
  return expr || node;
};

const optionLines = (option: OptionView, index: number, indent: string): string[] => {
  const out = [`${indent}${index + 1}. ${inlineText(optionHeadText(option.text, option.detail))}`];
  const requirement = requirementText(option.requirement);
  if (requirement) out.push(`${indent}  ${t("optionNeedLabel")}${requirement}`);
  const detail = detailRequirementsText(option.detail);
  if (detail) out.push(`${indent}  ${t("optionNeedLabel")}${detail}`);
  out.push(...conditionLines(optionCondition(option), `${indent}  `, t("optionCondLabel")));
  if (option.lockedText) {
    out.push(`${indent}  ${t("exportLocked", { text: inlineText(option.lockedText) })}`);
  }
  out.push(...renderBlocks(buildReaderBlocks(option.beats), `${indent}  `));
  return out;
};

const branchLines = (branch: BranchView, indent: string): string[] => {
  const out: string[] = [];
  const expr = branch.condition || checkpointExpr(branch.check);
  if (expr) {
    out.push(...conditionLines(expr, indent, `[${t("typeBranchCond")}] `));
  } else {
    const fallback = checkpointFallback(branch.check);
    if (fallback && fallback.lineCount) {
      const excluded = fallback.excluded.map(rawConditionText).filter(Boolean);
      const detail = excluded.length ? `: ${excluded.join(t("listJoin"))}` : "";
      out.push(
        `${indent}[${t("typeBranchCond")}] ${t("lookupCondFallback")} ` +
          `(${t("cxFallbackHint", { n: fallback.lineCount })}${detail})`,
      );
    } else {
      const source = inlineText(branch.source);
      out.push(`${indent}[${t("typeBranchCond")}]${source ? ` ${source}` : ""}`);
    }
  }
  const blocks = branch.blocks || buildReaderBlocks(branch.beats);
  if (blocks.length) out.push(...renderBlocks(blocks, `${indent}  `));
  else out.push(`${indent}  ${t("branchEmpty")}`);
  return out;
};

const battleEventLines = (lines: BattleLine[], indent: string): string[] => {
  const out: string[] = [];
  for (const line of lines) {
    if (line.kind === "say") {
      out.push(...sayLines(line.mode, line.speaker, line.text, indent));
    } else if (line.kind === "jump") {
      if (line.target) out.push(`${indent}→ ${line.target}`);
    } else if (line.kind === "scene") {
      if (line.sceneName) out.push(`${indent}[${t("sceneSwitch")}] ${line.sceneName}`);
    } else if (line.kind === "after") {
      if (line.target) out.push(`${indent}${t("battleAfterStory")}: → ${line.target}`);
    } else if (line.text) {
      out.push(`${indent}- ${inlineText(line.text)}`);
    }
  }
  return out;
};

const battleLines = (battle: BattleView, indent: string): string[] => {
  const out: string[] = [];
  const kind = battle.kind === "combat" ? t("battleDuel") : t("battleCampaign");
  out.push(`${indent}[${kind}]${battle.note ? ` ${inlineText(battle.note)}` : ""}`);
  for (const goal of battle.goals) {
    if (goal) out.push(`${indent}  ${t("battleGoalType")}: ${inlineText(goal)}`);
  }
  if (battle.title) out.push(`${indent}  ${t("battleOpponentType")}: ${inlineText(battle.title)}`);
  for (const fact of battle.facts) {
    if (fact) out.push(`${indent}  ${inlineText(fact)}`);
  }
  for (const row of battle.rows) {
    if (row.label || row.value) {
      out.push(`${indent}  ${inlineText(row.label)}: ${inlineText(row.value)}`);
    }
  }
  for (const event of battle.events) {
    const joiner = event.when.logic
      ? ` ${event.when.logic === "or" ? t("cxOr") : t("cxAnd")} `
      : " ";
    const when = event.when.parts
      .map((part) => inlineText(part.text))
      .filter(Boolean)
      .join(joiner);
    if (when) out.push(`${indent}  [${t("typeBranchCond")}] ${when}`);
    out.push(...battleEventLines(event.lines, `${indent}    `));
  }
  if (battle.afterScript) {
    out.push(`${indent}  ${t("battleAfterStory")}: → ${battle.afterScript}`);
  } else if (battle.nextScene) {
    out.push(`${indent}  ${t("battleAfter")}: ${sceneText(battle.nextScene)}`);
  }
  return out;
};

const positionLines = (ids: string[], model: CheckpointModel | null, indent: string): string[] => {
  const out: string[] = [];
  const prefix = model?.prefix || "";
  const byId = new Map<string, PositionCandidate>();
  for (const candidate of model?.candidates || []) {
    const id = positionTargetId(prefix, candidate.name || "");
    if (!id) continue;
    const key = id.toUpperCase();
    const existing = byId.get(key);
    if (!existing || (positionNeverReachable(existing) && !positionNeverReachable(candidate))) {
      byId.set(key, candidate);
    }
  }
  let total = 0;
  for (const id of ids) {
    const candidate = byId.get(id.toUpperCase());
    if (candidate) total += Math.max(0, candidate.rate ?? 0);
  }
  for (const id of ids) {
    const candidate = byId.get(id.toUpperCase()) || null;
    const parts = [`→ ${id}`];
    if (candidate) {
      const rate = candidate.rate ?? 0;
      const share = total > 0 ? Math.round((Math.max(0, rate) / total) * 100) : 0;
      parts.push(t("jumpWeightShare", { n: rate, p: share }));
      if (positionNeverReachable(candidate)) parts.push(t("jumpPositionNever"));
    }
    out.push(`${indent}${parts.join(" ｜ ")}`);
    if (!candidate) continue;
    if (candidate.active) {
      if (candidate.activeCondition) {
        out.push(...conditionLines(candidate.activeCondition, `${indent}  `, t("jumpCondActive")));
      } else {
        const text = candidate.activeEmpty ? t("lookupCondEmpty") : t("lookupCondUnparsed");
        out.push(`${indent}  ${t("jumpCondActive")}${text}`);
      }
    }
    for (const adjustment of candidate.adjustments || []) {
      const head = `${t("jumpCondWeight")} ${signedNumber(adjustment.rate)}: `;
      if (adjustment.condition) {
        out.push(...conditionLines(adjustment.condition, `${indent}  `, head));
      } else {
        out.push(`${indent}  ${head}${t("lookupCondUnparsed")}`);
      }
    }
  }
  return out;
};

const jumpLines = (block: Extract<ReaderBlock, { kind: "jump" }>, indent: string): string[] => {
  const jump = block.jump;
  const out: string[] = [];
  if (jump.position) {
    const candidates = (jump.targets || []).filter((id) => graph.nodeById.has(id));
    if (candidates.length) {
      out.push(`${indent}[${t("jumpPosition")}] ${jump.position}`);
      out.push(
        ...positionLines(
          candidates,
          checkpoints.getByKey(jump.position, "position"),
          `${indent}  `,
        ),
      );
    } else {
      const missing = t("parenWrap", { text: t("jumpMissing") });
      out.push(`${indent}${t("jumpPosition")} ${jump.position}${missing}`);
    }
    return out;
  }
  const targets = jump.targets || [];
  const dynamicKind = jump.dynamicKind || "";
  if (targets.length > 1) {
    const text =
      dynamicKind === "temp"
        ? t("jumpTempCandidates", { slot: jump.dynamicKey, count: targets.length })
        : t("jumpTravelCandidates", { count: targets.length });
    out.push(`${indent}${text}`);
    for (const id of targets) out.push(`${indent}  → ${id}`);
    return out;
  }
  if (dynamicKind === "travel" && !targets.length) {
    out.push(`${indent}${t("jumpTravelRuntime")}`);
    return out;
  }
  const target = jump.target || (targets.length === 1 ? targets[0] : "");
  if (target) {
    const missing = graph.nodeById.has(target) ? "" : t("parenWrap", { text: t("jumpMissing") });
    out.push(`${indent}→ ${target}${missing}`);
  } else {
    out.push(`${indent}→ ${jump.dynamicSource || t("jumpDynamic")}`);
  }
  return out;
};

const sceneLines = (block: Extract<ReaderBlock, { kind: "scene" }>, indent: string): string[] => {
  const view = block.scene;
  const named = sceneLabel(view.scene);
  const head = named || (view.scene ? `${t("sceneSwitch")} ${view.scene}` : "");
  const title = [head, view.sceneKey].filter(Boolean).join(" / ");
  const out = [`${indent}${title || t("sceneSwitch")}`];
  if (view.afterScript) {
    out.push(`${indent}  ${t("battleAfterStory")}: → ${view.afterScript}`);
  } else if (view.nextScene) {
    out.push(`${indent}  → ${sceneText(view.nextScene)}`);
  }
  return out;
};

const renderBlocks = (blocks: ReaderBlock[], indent = ""): string[] => {
  const out: string[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case "say":
        out.push(...sayLines(block.mode, block.speaker, block.text, indent));
        break;
      case "time":
        out.push(`${indent}[${t("metaTimeLabel")}] ${timeText(block.rounds)}`);
        break;
      case "meta":
        out.push(...chipBlockLines(block.chips, indent));
        break;
      case "missionEvent":
        for (const event of block.events) {
          const label =
            event.type === "trigger"
              ? t("missionEventTrigger")
              : event.type === "cancel"
                ? t("missionEventCancel")
                : t("missionEventEnd");
          out.push(`${indent}[${label}] ${event.name || event.code}`);
        }
        break;
      case "dice":
        out.push(...chipBlockLines(block.chips, indent, t("cDice")));
        break;
      case "choice":
        out.push(`${indent}[${t("typeOption")}]`);
        out.push(...chipBlockLines(block.diceChips, `${indent}  `, t("cDice")));
        for (const option of block.options) {
          out.push(...optionLines(option, option.index, `${indent}  `));
        }
        break;
      case "branches":
        for (const branch of block.branches) {
          out.push(...branchLines(branch, indent));
        }
        break;
      case "lore":
        out.push(`${indent}[${t("typeLore")}]`);
        for (const line of block.lines) {
          if (line) out.push(`${indent}  ${line}`);
        }
        break;
      case "battle":
        out.push(...battleLines(block.battle, indent));
        break;
      case "ending":
        out.push(
          `${indent}[${t("deathEnding")}]${block.ending.title ? ` ${inlineText(block.ending.title)}` : ""}`,
        );
        for (const line of block.ending.desc) {
          if (line) out.push(`${indent}  ${line}`);
        }
        break;
      case "scene":
        out.push(...sceneLines(block, indent));
        break;
      case "jump":
        out.push(...jumpLines(block, indent));
        break;
    }
  }
  return out;
};

const chapterFileBase = (chapter: Chapter, index: number): string =>
  `${String(index + 1).padStart(2, "0")}-${safeSegment(chapterTitle(chapter) || chapter.id)}`;

const scriptText = (node: GraphNode, rows: BeatRow[]): string => {
  const lines = [`# ${node.id}`, `${t("statsChapter")}: ${chapterTitle(graph.chapterOf(node))}`];
  if (typeof node.time === "number") {
    lines.push(`${t("metaTimeLabel")}: ${timeText(node.time)}`);
  }
  lines.push("", ...renderBlocks(buildReaderBlocks(rows)));
  return lines.join("\n");
};

const readmeText = (
  lang: string,
  count: number,
  chapters: number,
  skipped: number,
  checkpointOk: boolean,
): string => {
  const game = dataset.meta.game;
  const lines = [
    t("appTitle"),
    `language: ${lang}`,
    `chapters: ${chapters}`,
    `scripts: ${count}`,
    `skipped: ${skipped}`,
    `generated: ${new Date().toISOString()}`,
  ];
  if (game?.version) lines.push(t("gameVersion", { ver: game.version }));
  if (game?.build) lines.push(t("gameBuild", { build: game.build }));
  lines.push(t("exportNote"));
  if (!checkpointOk) lines.push(t("exportCheckpointWarning"));
  lines.push("", SEPARATOR);
  return lines.join("\n");
};

const buildExportFiles = (
  lang: string,
  checkpointOk: boolean,
): { files: { name: string; content: string }[]; count: number; skipped: number } => {
  const files: { name: string; content: string }[] = [];
  const byChapter = graph.nodesByChapter();
  let count = 0;
  let skipped = 0;
  graph.chapters.forEach((chapter, index) => {
    const parts: string[] = [];
    for (const node of byChapter[index] || []) {
      const rows = textStore.beatRows(lang, node.id);
      if (!rows || !rows.length) {
        skipped++;
        continue;
      }
      parts.push(scriptText(node, rows));
      count++;
    }
    if (!parts.length) return;
    files.push({
      name: `${chapterFileBase(chapter, index)}.txt`,
      content: parts.join("\n\n"),
    });
  });
  if (!count) return { files, count, skipped };
  files.unshift({
    name: "README.txt",
    content: readmeText(lang, count, files.length, skipped, checkpointOk),
  });
  return { files, count, skipped };
};

const filenameOf = (lang: string): string => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return `legend-of-mortal-scripts-${lang}-${stamp}.zip`;
};

const saveBlob = (filename: string, blob: Blob): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const exportScripts = async (): Promise<void> => {
  if (running.value) {
    console.info("[ScriptIndexer] script export is already running");
    return;
  }
  running.value = true;
  const lang = script().textLang();
  const ui = useUiStore(pinia);
  try {
    const total = textStore.progress().total;
    ui.setIoStatus(t("exportLoading", { done: 0, total }));
    console.info(`[ScriptIndexer] loading scripts (0/${total})…`);
    const textOk = await textStore.ensureAll(lang, (done, count) => {
      ui.setIoStatus(t("exportLoading", { done, total: count }));
      console.info(`[ScriptIndexer] loading scripts (${done}/${count})…`);
    });
    if (!textOk) throw new Error("text shards failed to load");
    ui.setIoStatus(t("exportBuilding"));
    console.info("[ScriptIndexer] loading checkpoints…");
    const checkpointOk = await checkpoints.loadAll();
    if (!checkpointOk) {
      console.warn("[ScriptIndexer] some checkpoint shards failed; raw references remain");
    }
    const { files, count, skipped } = buildExportFiles(lang, checkpointOk);
    if (!count) throw new Error("no scripts to export");
    ui.setIoStatus(t("exportPacking"));
    console.info(`[ScriptIndexer] packing ${files.length} files…`);
    const blob = await zipTextFiles(files);
    const filename = filenameOf(lang);
    saveBlob(filename, blob);
    ui.toast(t("exportDone", { n: count }));
    console.info(`[ScriptIndexer] exported ${count} scripts (${skipped} skipped) to ${filename}`);
  } catch (error) {
    console.error("[ScriptIndexer] script export failed", error);
    ui.toast(t("exportFailed"));
  } finally {
    ui.setIoStatus("");
    running.value = false;
  }
};
