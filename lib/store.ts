// In-memory store for memos, trails and watches. Lives as long as the dev server.
import type { Memo, Trail, TrailRecorder, TrailStep, Watch } from "./types";

const g = globalThis as unknown as {
  __proven?: { memos: Map<string, Memo>; trails: Map<string, Trail>; watches: Map<string, Watch> };
};
g.__proven ??= { memos: new Map(), trails: new Map(), watches: new Map() };
export const store = g.__proven;

export const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

export function newTrail(): TrailRecorder {
  const trail: Trail = { id: newId("tr"), steps: [] };
  store.trails.set(trail.id, trail);
  return {
    id: trail.id,
    step: (s) => trail.steps.push({ ...s, at: s.at ?? new Date().toISOString() } as TrailStep),
  };
}
