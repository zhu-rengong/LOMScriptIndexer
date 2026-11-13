import type {
  CalendarInfo,
  CheckpointDocument,
  DataIndex,
  FlagFactsPayload,
  MissionDocument,
  VarReadsPayload,
  VocabPayload,
} from "./generated";

export type { CalendarInfo, DataIndex, FlagFactsPayload, MissionDocument, VarReadsPayload };

export type Facets = {
  speakers: string[];
  flags: string[];
  checks: string[];
  stats: string[];
  relations: string[];
  endings: string[];
  optionCount: number;
  lockCount: number;
  diceCheckCount: number;
};

export type ScriptFlags = {
  isEmpty?: boolean;
  isSimplifiedOnly?: boolean;
  hasNoOutgoing?: boolean;
  hasNoIncoming?: boolean;
};

export type GraphNode = {
  id: string;
  chapterIndex: number;
  outDegree: number;
  inDegree: number;
  sayCount: number;
  flags: ScriptFlags;
  facets: Facets;
  time: number | null;
};

export type GraphEdge = {
  index: number;
  source: string;
  target: string;
  kind: string;
  label: string;
};

export type Chapter = {
  id: string;
  kind: string;
  number: number | null;
  color: string;
  scriptCount: number;
};

export type Shard = {
  key: string;
  nodeCount: number;
  bytes: number;
  chapterIds: string[];
};

export type GameInfo = {
  version?: string | null;
  build?: string | null;
  updated?: string | null;
};

export type Vocab = VocabPayload & { [key: string]: unknown };

export type GraphMeta = {
  generated?: string;
  game?: GameInfo;
  langs: string[];
  defaultLang: string;
  sourceLang: string;
  vocab: Vocab;
  calendar: CalendarInfo;
  counts: Record<string, number>;
  shards: Shard[];
  systemEntries: { id: string; label: string; origin: string }[];
  shardByNode: Record<string, string>;
  checkpointShardByKey: Record<string, number>;
};

export type VarReads = {
  flag: Record<string, string[]>;
  stat: Record<string, string[]>;
  rel: Record<string, string[]>;
};

export type Dataset = {
  index: DataIndex;
  schema: string;
  meta: GraphMeta;
  vocab: Vocab;
  calendar: CalendarInfo;
  nodes: GraphNode[];
  edges: GraphEdge[];
  chapters: Chapter[];
  varReads: VarReads;
  missions: MissionDocument;
  flagFacts: FlagFactsPayload;
  checkpoints: CheckpointDocument;
  langs: string[];
  systemEntries: { id: string; label: string; origin: string }[];
  shardByNode: Record<string, string>;
  checkpointShardByKey: Record<string, number>;
  assetUrl: (name: string, vars?: Record<string, string | number>) => string;
};
