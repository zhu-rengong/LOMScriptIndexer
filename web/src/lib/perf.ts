export type PerfEntry = {
  label: string;
  duration: number;
  at: number;
};

const LONG_TASK_MS = 200;

const entries: PerfEntry[] = [];

let watcher: PerformanceObserver | null = null;

const record = (label: string, duration: number, at: number): void => {
  entries.push({ label, duration: Math.round(duration), at: Math.round(at) });
};

export const watchLongTasks = (): void => {
  if (watcher || typeof PerformanceObserver === "undefined") return;
  if (PerformanceObserver.supportedEntryTypes.indexOf("longtask") < 0) return;
  watcher = new PerformanceObserver((list) => {
    for (const item of list.getEntries()) {
      if (item.duration >= LONG_TASK_MS) record("longtask", item.duration, item.startTime);
    }
  });
  watcher.observe({ entryTypes: ["longtask"] });
};

export const measure = async <T>(label: string, run: () => Promise<T>): Promise<T> => {
  const started = performance.now();
  try {
    return await run();
  } finally {
    if (!entries.some((item) => item.label === label)) {
      record(label, performance.now() - started, started);
    }
  }
};

type HeapPerformance = Performance & { memory?: { usedJSHeapSize: number } };

export const report = (): PerfEntry[] => {
  const memory = (performance as HeapPerformance).memory;
  if (!memory) return [...entries];
  return [
    ...entries,
    {
      label: "heap",
      duration: Math.round(memory.usedJSHeapSize / 1024),
      at: Math.round(performance.now()),
    },
  ];
};

declare global {
  interface Window {
    __perf?: () => PerfEntry[];
  }
}

window.__perf = report;
