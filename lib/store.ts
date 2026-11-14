// Store for memos, trails and watches: in memory, with memos and trails also saved as JSON files
// so shared memo links and history survive a server restart (.data/ locally, /tmp on Vercel).
import "@/lib/seed";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Memo, Trail, TrailRecorder, TrailStep, Watch } from "./types";

const g = globalThis as unknown as {
  __proven?: { memos: Map<string, Memo>; trails: Map<string, Trail>; watches: Map<string, Watch> };
};
g.__proven ??= { memos: new Map(), trails: new Map(), watches: new Map() };
export const store = g.__proven;

export const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const DIR = process.env.VERCEL ? "/tmp/proven" : join(process.cwd(), ".data");
const file = (kind: "memos" | "trails", id: string) => join(DIR, kind, `${id.replace(/[^\w-]/g, "")}.json`);

function save(kind: "memos" | "trails", id: string, value: unknown) {
  try {
    mkdirSync(join(DIR, kind), { recursive: true });
    writeFileSync(file(kind, id), JSON.stringify(value));
  } catch {
    // Disk is a convenience; memory still has it.
  }
}

function load<T>(kind: "memos" | "trails", id: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file(kind, id), "utf8")) as T;
  } catch {
    return undefined;
  }
}

export function saveMemo(memo: Memo) {
  store.memos.set(memo.id, memo);
  save("memos", memo.id, memo);
  const trail = store.trails.get(memo.trail_id);
  if (trail) save("trails", trail.id, trail);
}

export function getMemo(id: string): Memo | undefined {
  const m = store.memos.get(id) ?? load<Memo>("memos", id);
  if (m) store.memos.set(id, m);
  return m;
}

export function getTrail(id: string): Trail | undefined {
  const t = store.trails.get(id) ?? load<Trail>("trails", id);
  if (t) store.trails.set(id, t);
  return t;
}

export function listMemos(limit = 20): Memo[] {
  try {
    for (const f of readdirSync(join(DIR, "memos"))) {
      const id = f.replace(/\.json$/, "");
      if (!store.memos.has(id)) getMemo(id);
    }
  } catch {
    // no saved memos yet
  }
  return [...store.memos.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
}

// onStep is called with every step as it is recorded (used to stream progress to the browser).
export function newTrail(onStep?: (s: TrailStep) => void): TrailRecorder {
  const trail: Trail = { id: newId("tr"), steps: [] };
  store.trails.set(trail.id, trail);
  return {
    id: trail.id,
    step: (s) => {
      const step = { ...s, at: s.at ?? new Date().toISOString() } as TrailStep;
      trail.steps.push(step);
      try {
        onStep?.(step);
      } catch {
        // A closed stream must not break the research.
      }
    },
  };
}
