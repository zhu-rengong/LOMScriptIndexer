import { FOLLOW_GROUP } from "./fontFamilies";
import type { CapsMode } from "../types/font";

export type FontGroup = {
  id: string;
  label: string;
  font?: string;
  scale?: number;
  leading?: number;
  tracking?: number;
  weight?: number;
  italic?: boolean;
  caps?: CapsMode;
  numeric?: boolean;
};

export type Wrapper = { tag: string; cls?: string };

export type TypeSlot = {
  id: string;
  group: string;
  label: string;
  font: string;
  scale: number;
  leading: number;
  tracking: number;
  weight: number;
  italic: boolean;
  caps: CapsMode;
  numeric: boolean;
  previewKey: string;
  wrappers: Wrapper[];
};

export const GROUPS: FontGroup[] = [
  { id: "prose", label: "pref.group.prose" },
  { id: "choice", label: "pref.group.choice" },
  { id: "display", label: "pref.group.display" },
  { id: "data", label: "pref.group.data" },
  { id: "interface", label: "pref.group.interface" },
];

export const TYPE_SLOTS: TypeSlot[] = [
  {
    id: "dialog",
    group: "prose",
    label: "pref.type.dialog",
    font: FOLLOW_GROUP,
    scale: 130,
    leading: 100,
    tracking: 0.015,
    weight: 400,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "previewText",
    wrappers: [
      { tag: "div", cls: "say" },
      { tag: "div", cls: "what" },
    ],
  },
  {
    id: "speaker",
    group: "prose",
    label: "pref.type.speaker",
    font: "kai",
    scale: 182,
    leading: 100,
    tracking: 0.16,
    weight: 500,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "previewWho",
    wrappers: [
      { tag: "div", cls: "say" },
      { tag: "span", cls: "who is-link" },
    ],
  },
  {
    id: "narration",
    group: "prose",
    label: "pref.type.narration",
    font: FOLLOW_GROUP,
    scale: 208,
    leading: 100,
    tracking: 0.03,
    weight: 400,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "previewNarration",
    wrappers: [
      { tag: "div", cls: "say narration" },
      { tag: "div", cls: "what" },
    ],
  },
  {
    id: "think",
    group: "prose",
    label: "pref.type.think",
    font: FOLLOW_GROUP,
    scale: 130,
    leading: 100,
    tracking: 0.03,
    weight: 400,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "previewThink",
    wrappers: [
      { tag: "div", cls: "say think" },
      { tag: "div", cls: "what" },
    ],
  },
  {
    id: "excerpt",
    group: "prose",
    label: "pref.type.excerpt",
    font: FOLLOW_GROUP,
    scale: 130,
    leading: 100,
    tracking: 0.02,
    weight: 400,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "previewSnippet",
    wrappers: [
      { tag: "div", cls: "drop-item" },
      { tag: "span", cls: "dtext" },
    ],
  },
  {
    id: "ending",
    group: "prose",
    label: "pref.type.ending",
    font: "kai",
    scale: 195,
    leading: 75,
    tracking: 0.08,
    weight: 400,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "previewEnding",
    wrappers: [{ tag: "span", cls: "ending-title" }],
  },
  {
    id: "option",
    group: "choice",
    label: "pref.type.option",
    font: FOLLOW_GROUP,
    scale: 144,
    leading: 100,
    tracking: 0.01,
    weight: 400,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "previewOption",
    wrappers: [
      { tag: "div", cls: "option-head row" },
      { tag: "span", cls: "option-main" },
      { tag: "span", cls: "option-text" },
    ],
  },
  {
    id: "condition",
    group: "choice",
    label: "pref.type.condition",
    font: FOLLOW_GROUP,
    scale: 144,
    leading: 100,
    tracking: 0.02,
    weight: 600,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "previewBranchCond",
    wrappers: [
      { tag: "div", cls: "branch" },
      { tag: "div", cls: "branch-head row" },
      { tag: "span", cls: "cond" },
    ],
  },
  {
    id: "ordinal",
    group: "choice",
    label: "pref.type.ordinal",
    font: "mono",
    scale: 102,
    leading: 100,
    tracking: 0.02,
    weight: 400,
    italic: false,
    caps: "none",
    numeric: true,
    previewKey: "previewIndex",
    wrappers: [{ tag: "span", cls: "option-idx" }],
  },
  {
    id: "title",
    group: "display",
    label: "pref.type.title",
    font: FOLLOW_GROUP,
    scale: 100,
    leading: 100,
    tracking: 0.12,
    weight: 600,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "previewHeading",
    wrappers: [{ tag: "h2", cls: "panel-title" }],
  },
  {
    id: "script-title",
    group: "display",
    label: "pref.type.script-title",
    font: FOLLOW_GROUP,
    scale: 100,
    leading: 100,
    tracking: 0.01,
    weight: 600,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "previewNode",
    wrappers: [{ tag: "h2", cls: "node-title" }],
  },
  {
    id: "display",
    group: "display",
    label: "pref.type.display",
    font: FOLLOW_GROUP,
    scale: 100,
    leading: 100,
    tracking: 0.16,
    weight: 600,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "appTitle",
    wrappers: [{ tag: "div", cls: "brand-text" }, { tag: "h1" }],
  },
  {
    id: "seal",
    group: "display",
    label: "pref.type.seal",
    font: "kai",
    scale: 100,
    leading: 62.5,
    tracking: 0,
    weight: 600,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "previewSeal",
    wrappers: [{ tag: "span", cls: "seal" }],
  },
  {
    id: "code",
    group: "data",
    label: "pref.type.code",
    font: "mono",
    scale: 100,
    leading: 130,
    tracking: 0.01,
    weight: 400,
    italic: false,
    caps: "none",
    numeric: true,
    previewKey: "previewId",
    wrappers: [
      { tag: "div", cls: "drop-item" },
      { tag: "span", cls: "did" },
    ],
  },
  {
    id: "figure",
    group: "data",
    label: "pref.type.figure",
    font: FOLLOW_GROUP,
    scale: 100,
    leading: 100,
    tracking: 0.01,
    weight: 600,
    italic: false,
    caps: "none",
    numeric: true,
    previewKey: "previewStat",
    wrappers: [
      { tag: "div", cls: "stat-card" },
      { tag: "span", cls: "stat-value" },
    ],
  },
  {
    id: "mark",
    group: "data",
    label: "pref.type.mark",
    font: FOLLOW_GROUP,
    scale: 100,
    leading: 100,
    tracking: 0.02,
    weight: 400,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "previewMark",
    wrappers: [{ tag: "span", cls: "badge" }],
  },
  {
    id: "label",
    group: "interface",
    label: "pref.type.label",
    font: "mono",
    scale: 100,
    leading: 100,
    tracking: 0.12,
    weight: 400,
    italic: false,
    caps: "upper",
    numeric: false,
    previewKey: "previewLabel",
    wrappers: [{ tag: "p", cls: "sub-label" }],
  },
  {
    id: "caption",
    group: "interface",
    label: "pref.type.caption",
    font: "mono",
    scale: 100,
    leading: 100,
    tracking: 0.04,
    weight: 400,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "previewNote",
    wrappers: [{ tag: "p", cls: "panel-hint" }],
  },
  {
    id: "text",
    group: "interface",
    label: "pref.type.text",
    font: FOLLOW_GROUP,
    scale: 100,
    leading: 100,
    tracking: 0.02,
    weight: 400,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "previewBody",
    wrappers: [{ tag: "p", cls: "help-desc" }],
  },
  {
    id: "control",
    group: "interface",
    label: "pref.type.control",
    font: FOLLOW_GROUP,
    scale: 100,
    leading: 100,
    tracking: 0.02,
    weight: 400,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "previewUi",
    wrappers: [{ tag: "button", cls: "btn" }],
  },
  {
    id: "status",
    group: "interface",
    label: "pref.type.status",
    font: FOLLOW_GROUP,
    scale: 100,
    leading: 100,
    tracking: 0.03,
    weight: 400,
    italic: false,
    caps: "none",
    numeric: false,
    previewKey: "previewStatus",
    wrappers: [{ tag: "p", cls: "filter-status" }],
  },
];

const GROUP_BY_ID = new Map(GROUPS.map((group) => [group.id, group]));

const SLOT_BY_ID = new Map(TYPE_SLOTS.map((slot) => [slot.id, slot]));

export const groupById = (id: string): FontGroup | null => GROUP_BY_ID.get(id) || null;

export const slotById = (id: string): TypeSlot | null => SLOT_BY_ID.get(id) || null;

export const slotsOfGroup = (groupId: string): TypeSlot[] =>
  TYPE_SLOTS.filter((slot) => slot.group === groupId);

export const firstSlot = (): TypeSlot => TYPE_SLOTS[0];
