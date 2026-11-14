// OWNER: Aarav. Replace these stubs with the real Telem + Tavily layer (AGENTS.md §7).
// Keep the signatures exactly as they are; the brain calls them.
import type { Source, TrailRecorder, WatchUpdate } from "../types";

export async function searchAll(
  queries: string[],
  trail: TrailRecorder,
  opts?: { platforms?: boolean },
): Promise<Source[]> {
  void queries; void trail; void opts;
  throw new Error("searchAll is not built yet (Aarav, lib/search). Run with MOCK=1 meanwhile.");
}

export async function extract(urls: string[], trail: TrailRecorder): Promise<{ url: string; text: string }[]> {
  void urls; void trail;
  throw new Error("extract is not built yet (Aarav, lib/search).");
}

export async function watch(company: string): Promise<{ monitor_id: string }> {
  void company;
  throw new Error("watch is not built yet (Aarav, lib/search).");
}

export async function pollWatch(monitor_id: string): Promise<WatchUpdate[]> {
  void monitor_id;
  throw new Error("pollWatch is not built yet (Aarav, lib/search).");
}
