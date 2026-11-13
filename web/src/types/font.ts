export type FontScope = "group" | "slot";

export type CapsMode = "none" | "upper" | "small";

export type FontTarget = { scope: FontScope; id: string };

export type PrefEntry = {
  font: string;
  scale: number;
  leading: number;
  tracking: number;
  weight: number | null;
  italic: boolean | null;
  caps: CapsMode | null;
  numeric: boolean | null;
};

export type PrefState = {
  groups: Record<string, PrefEntry>;
  slots: Record<string, PrefEntry>;
  measure: number;
  showPortraits: boolean;
  portraitSize: number;
};

export type PrefPatch = {
  measure?: number;
  groups?: Record<string, Partial<PrefEntry>>;
  slots?: Record<string, Partial<PrefEntry>>;
  showPortraits?: boolean;
  portraitSize?: number;
};

export type ResolvedTypeStyle = {
  scope: FontScope;
  id: string;
  group: string;
  px: number;
  lineHeight: number;
  tracking: number;
  weight: number;
  italic: boolean;
  caps: CapsMode;
  numeric: boolean;
  font: string;
  fontStack: string;
};
