import { checkpoints } from "../data/checkpoints";
import { dataset } from "../data/dataset";
import { graph } from "../data/graph";
import { textStore } from "../data/text";
import { chapterTitle, t, timeText } from "../i18n";

import type { BattleView, BeatRow, BranchView, OptionView } from "../types/beats";
import type { ConditionNode } from "../types/condition";
import type { GraphNode } from "../types/graph";
import * as beatRows from "./beatRows";
import { speakerName } from "./blocks";
import {
  checkpointExpr,
  checkpointFallback,
  condTextRaw,
  detailRequirementsText,
  metaText,
  optionHeadText,
  requirementText,
} from "./conditions";
import { stripMarkup } from "./richText";
import { scriptStore as script } from "./scriptStore";

const SEPARATOR = "=".repeat(78);

let running = false;

const cleanText = (value: unknown): string => stripMarkup(value ?? "").replace(/\r\n?/g, "\n");

const textLines = (value: string, indent: string): string[] =>
  value ? value.split("\n").map((line) => (line ? indent + line : "")) : [];

const sayLine = (mode: string, speaker: string, text: string): string => {
  const body = cleanText(text);
  if (!body) return "";
  if (mode === "narration") return body;
  const name = speaker ? speakerName(speaker) : "";
  if (mode === "think") {
    const label = name ? `${name}${t("parenWrap", { text: t("typeThink") })}` : t("typeThink");
    return `${label}${t("colonPrefix", { text: body })}`;
  }
  return name ? t("lineSpeaker", { name, text: body }) : body;
};

const conditionSuffix = (node: ConditionNode | null): string => {
  const text = condTextRaw(node);
  return text ? `｜${t("ck.condition")}: ${text}` : "";
};

const branchSuffix = (branch: BranchView, current: string): string => {
  const check = branch.check;
  if (!check) return "";
  const expr = checkpointExpr(check);
  if (expr) return condTextRaw(expr) === current ? "" : conditionSuffix(expr);
  const fallback = checkpointFallback(check);
  if (!fallback || !fallback.lineCount) return "";
  const excluded = fallback.excluded.map((item) => condTextRaw(item)).filter(Boolean);
  const detail = excluded.length ? `: ${excluded.join(t("listJoin"))}` : "";
  return `｜${t("lookupCondFallback")} (${t("cxFallbackHint", { n: fallback.lineCount })}${detail})`;
};

const optionSuffix = (option: OptionView, current: string): string => {
  const condition = option.condition;
  if (!condition || condition.tag !== "check") return "";
  const expr = checkpointExpr({
    key: condition.key,
    kind: condition.kind,
    expectedResult: null,
  });
  if (!expr) return "";
  return condTextRaw(expr) === current ? "" : conditionSuffix(expr);
};

const optionBlock = (option: OptionView, index: number, indent: string): string[] => {
  const out: string[] = [];
  const head = cleanText(optionHeadText(option.text, option.detail)).replace(/\s+/g, " ").trim();
  out.push(`${indent}${index + 1}. ${head}`);
  const condition = condTextRaw(option.condition);
  if (condition) {
    out.push(`${indent}   ${t("typeOptionCond")}: ${condition}${optionSuffix(option, condition)}`);
  }
  const requirement = requirementText(option.requirement);
  if (requirement) out.push(`${indent}   ${requirement}`);
  const detail = detailRequirementsText(option.detail);
  if (detail) out.push(`${indent}   ${detail}`);
  if (option.lockedText) {
    out.push(`${indent}   ${t("fieldLock")}: ${cleanText(option.lockedText)}`);
  }
  out.push(...renderRows(option.beats, `${indent}   `));
  return out;
};

const branchBlock = (branch: BranchView, indent: string): string[] => {
  const source = condTextRaw(branch.condition) || branch.source;
  const suffix = branchSuffix(branch, source);
  const condition = source ? `${source}${suffix}` : suffix.replace(/^｜/, "");
  const head = condition
    ? `${indent}[${t("typeBranchCond")}] ${condition}`
    : `${indent}[${t("typeBranchCond")}]`;
  const out = [head, ...renderRows(branch.beats, `${indent}  `)];
  if (!branch.beats.length) out.push(`${indent}  ${t("branchEmpty")}`);
  return out;
};

const battleBlock = (battle: BattleView, indent: string): string[] => {
  const kind = battle.kind === "combat" ? t("battleDuel") : t("battleCampaign");
  const note = battle.note ? ` ${battle.note}` : "";
  const out: string[] = [`${indent}[${kind}]${note}`];
  if (battle.goals.length) {
    out.push(`${indent}  ${t("battleGoalType")}: ${battle.goals.join(t("listJoin"))}`);
  }
  if (battle.title) out.push(`${indent}  ${t("battleOpponentType")}: ${battle.title}`);
  for (const fact of battle.facts) {
    if (fact) out.push(`${indent}  ${fact}`);
  }
  for (const row of battle.rows) {
    if (row.label || row.value) out.push(`${indent}  ${row.label}: ${row.value}`);
  }
  for (const event of battle.events) {
    const joiner = ` ${t(event.when.logic === "or" ? "cxOr" : "cxAnd")} `;
    const when = event.when.parts
      .map((part) => part.text)
      .filter(Boolean)
      .join(joiner);
    if (when) out.push(`${indent}  [${t("typeBranchCond")}] ${when}`);
    const lineIndent = `${indent}    `;
    for (const line of event.lines) {
      if (line.kind === "say") {
        const text = sayLine(line.mode, line.speaker, line.text);
        if (text) out.push(...textLines(text, lineIndent));
      } else if (line.kind === "jump") {
        if (line.target) out.push(`${lineIndent}→ ${line.target}`);
      } else if (line.kind === "scene") {
        out.push(`${lineIndent}[${t("sceneSwitch")}] ${line.sceneName}`);
      } else if (line.kind === "after") {
        if (line.target) out.push(`${lineIndent}${t("battleAfterStory")}: → ${line.target}`);
      } else if (line.text) {
        out.push(`${lineIndent}${line.text}`);
      }
    }
  }
  if (battle.afterScript) {
    out.push(`${indent}  ${t("battleAfterStory")}: → ${battle.afterScript}`);
  } else if (battle.nextScene) {
    out.push(`${indent}  ${t("battleAfter")}: ${battle.nextScene}`);
  }
  return out;
};

const renderRows = (input: unknown, indent: string): string[] => {
  const out: string[] = [];
  const rows = Array.isArray(input) ? (input as BeatRow[]) : [];
  for (const row of rows) {
    if (!Array.isArray(row) || !row.length) continue;

    if (beatRows.isBeat(row, "say")) {
      const said = beatRows.parseSay(row);
      const text = sayLine(said.mode, said.speaker, said.text);
      if (text) out.push(...textLines(text, indent));
      continue;
    }

    if (beatRows.isBeat(row, "choice")) {
      out.push(`${indent}[${t("typeOption")}]`);
      beatRows.parseChoice(row).forEach((option, index) => {
        out.push(...optionBlock(option, index, `${indent}  `));
      });
      continue;
    }

    if (beatRows.isBeat(row, "branch")) {
      out.push(...branchBlock(beatRows.parseBranch(row), indent));
      continue;
    }

    if (beatRows.isBeat(row, "jump")) {
      const jump = beatRows.parseJump(row);
      if (jump.position) {
        const detail = (jump.targets || []).join(t("listJoin")) || t("jumpMissing");
        out.push(
          `${indent}→ [${t("jumpPosition")}] ${jump.position}` + t("colonPrefix", { text: detail }),
        );
        continue;
      }
      const target = jump.target || jump.dynamicSource;
      out.push(`${indent}→ ${target || t("jumpDynamic")}`);
      continue;
    }

    if (beatRows.isBeat(row, "meta")) {
      const meta = beatRows.parseMeta(row);
      if (meta.kind === "time") {
        if (typeof meta.value === "number") {
          out.push(`${indent}- ${t("metaTimeLabel")} → ${timeText(meta.value)}`);
        }
        continue;
      }
      const text = metaText(meta.kind, meta.key, meta.value, meta.extra);
      if (text) out.push(`${indent}- ${text}`);
      continue;
    }

    if (beatRows.isBeat(row, "lore")) {
      out.push(`${indent}[${t("typeLore")}]`);
      const lines = cleanText(beatRows.parseLore(row))
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      lines.forEach((line) => out.push(`${indent}  ${line}`));
      continue;
    }

    if (beatRows.isBeat(row, "ending")) {
      const ending = beatRows.parseEnding(row);
      out.push(`${indent}[${t("deathEnding")}]${ending.title ? ` ${ending.title}` : ""}`);
      for (const line of ending.desc) out.push(`${indent}  ${line}`);
      continue;
    }

    if (beatRows.isBeat(row, "scene")) {
      const scene = beatRows.parseScene(row);
      const head = [scene.scene, scene.sceneKey].filter(Boolean).join(" / ");
      out.push(`${indent}[${t("sceneSwitch")}]${head ? ` ${head}` : ""}`);
      if (scene.afterScript) {
        out.push(`${indent}  ${t("battleAfterStory")}: → ${scene.afterScript}`);
      } else if (scene.nextScene) {
        out.push(`${indent}  → ${scene.nextScene}`);
      }
      continue;
    }

    if (beatRows.isBeat(row, "battle")) {
      out.push(...battleBlock(beatRows.parseBattle(row), indent));
    }
  }
  return out;
};

const nodeBlock = (node: GraphNode, rows: BeatRow[]): string[] => {
  const out = [
    SEPARATOR,
    `# ${node.id}`,
    `${t("statsChapter")}: ${chapterTitle(graph.chapterOf(node))}`,
  ];
  if (typeof node.time === "number") out.push(`${t("metaTimeLabel")}: ${timeText(node.time)}`);
  out.push(SEPARATOR, "", ...renderRows(rows, ""), "");
  return out;
};

const headerLines = (lang: string, count: number): string[] => {
  const game = dataset.meta.game || {};
  const out = [
    t("appTitle"),
    `language: ${lang}`,
    `scripts: ${count}`,
    `generated: ${new Date().toISOString()}`,
  ];
  if (game.version) out.push(t("gameVersion", { ver: game.version }));
  if (game.build) out.push(t("gameBuild", { build: game.build }));
  out.push(
    "# Parsed scripts only; checkpoint conditions are expanded in place, everything else stays raw and uninferred.",
  );
  out.push("", SEPARATOR, "");
  return out;
};

const buildScriptExport = (lang: string): { text: string; count: number } => {
  const pack = textStore.pack(lang);
  if (!pack) throw new Error("text pack is unavailable");
  const scripts = pack.scripts || {};
  const sections: string[][] = [];
  let count = 0;
  graph.chapters.forEach((chapter, index) => {
    const block: string[] = [];
    for (const node of graph.nodesByChapter()[index] || []) {
      const rows = scripts[node.id];
      if (!Array.isArray(rows) || !rows.length) continue;
      block.push(...nodeBlock(node, rows));
      count++;
    }
    if (!block.length) return;
    sections.push([SEPARATOR, `## ${chapterTitle(chapter)}`, SEPARATOR, "", ...block]);
  });
  const text = [...headerLines(lang, count), ...sections.flat()].join("\n");
  return { text, count };
};

const filenameOf = (lang: string): string => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return `legend-of-mortal-scripts-${lang}-${stamp}.txt`;
};

const saveText = (filename: string, text: string): void => {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
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
  if (running) {
    console.info("[ScriptIndexer] script export is already running");
    return;
  }
  running = true;
  const lang = script().textLang();
  try {
    const total = textStore.progress().total;
    console.info(`[ScriptIndexer] loading scripts (0/${total})…`);
    const headOk = await textStore.ensureHead(lang);
    if (!headOk) throw new Error("text head failed");
    const loaded = await textStore.ensureAll(lang, (done, count) => {
      console.info(`[ScriptIndexer] loading scripts (${done}/${count})…`);
    });
    if (!loaded) throw new Error("text load failed");
    const checkpointsOk = await checkpoints.loadAll();
    if (!checkpointsOk) {
      console.warn("[ScriptIndexer] some checkpoint shards failed to load; raw references remain");
    }
    console.info("[ScriptIndexer] building plain text…");
    const { text, count } = buildScriptExport(lang);
    if (!count) throw new Error("no scripts to export");
    const filename = filenameOf(lang);
    saveText(filename, text);
    console.info(`[ScriptIndexer] exported ${count} scripts to ${filename}`);
  } catch (error) {
    console.error("[ScriptIndexer] script export failed", error);
  } finally {
    running = false;
  }
};
