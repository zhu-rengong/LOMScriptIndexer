export type FontScope = "group" | "slot";

export type FontTarget = { scope: FontScope; id: string };

export type PrefEntry = {
  font: string;
  scale: number;
  leading: number;
  weight: number | null;
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
  scale: number;
  leading: number;
  px: number;
  lineHeight: number;
  weight: number | null;
  font: string;
  fontStack: string;
};
