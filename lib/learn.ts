// OWNER: learner. What Proven learned: which engines' results end up as verified evidence (AGENTS.md PHASE 2).
// An engine earns credit only when one of its results is the source of a verified quote behind a kept memo line.
// Board persists to .data/engines.json (/tmp/proven on Vercel), and is also kept in memory.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EngineBoard, EngineStat, Memo, Source, TrailRecorder } from "./types";
import { normalizeUrl } from "./search/http";

const DIR = process.env.VERCEL ? "/tmp/proven" : join(process.cwd(), ".data");
const FILE = join(DIR, "engines.json");

// A learned score moves a source at most this many places from its consensus position.
export const MAX_SHIFT = 3;

const g = globalThis as unknown as { __provenEngines?: EngineBoard };

const empty = (): EngineBoard => ({ engines: [], memos: 0, updated_at: "" });

export const scoreOf = (s: Pick<EngineStat, "supported" | "returned">) => (s.supported + 1) / (s.returned + 10);

// Newest of disk and memory: the disk copy may come from another process (e.g. scripts/warm-cache.ts).
function load(): EngineBoard {
  const mem = g.__provenEngines;
  let disk: EngineBoard | undefined;
  try {
    disk = JSON.parse(readFileSync(FILE, "utf8")) as EngineBoard;
  } catch {
    // no saved board yet
  }
  const board = disk && (!mem || disk.updated_at >= mem.updated_at) ? disk : (mem ?? empty());
  g.__provenEngines = board;
  return board;
}

function save(board: EngineBoard) {
  g.__provenEngines = board;
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(board, null, 2));
  } catch {
    // Disk is a convenience; memory still has it.
  }
}

const sorted = (engines: EngineStat[]) =>
  [...engines].sort((a, b) => b.score - a.score || b.returned - a.returned || a.name.localeCompare(b.name));

export function getBoard(): EngineBoard {
  const b = load();
  return { ...b, engines: sorted(b.engines) };
}

const engineOf = (s: Source) => s.engine || "unknown";
const fmt = (n: number) => String(Math.round(n * 10) / 10);

// candidates: every source found before the memo was written (cited or not).
// Credit per candidate: cited if any kept fact/risk cites it; supported = 1 if a kept line's evidence quotes it
// with verdict "supported", 0.5 if only "partial". A memo without `verification` gives citation credit only.
export function recordMemo(memo: Memo, candidates: Source[], trail: TrailRecorder): EngineBoard {
  const t0 = Date.now();
  const lines = [...memo.facts, ...memo.risks];
  const urlOf = new Map(memo.sources.map((s) => [s.id, normalizeUrl(s.url)]));

  const cited = new Set<string>();
  const credit = new Map<string, number>();
  for (const l of lines) {
    for (const id of l.source_ids) {
      const u = urlOf.get(id);
      if (u) cited.add(u);
    }
    if (!memo.verification) continue;
    for (const e of l.evidence ?? []) {
      const u = urlOf.get(e.source_id);
      if (!u) continue;
      credit.set(u, Math.max(credit.get(u) ?? 0, e.verdict === "supported" ? 1 : e.verdict === "partial" ? 0.5 : 0));
    }
  }

  // This memo's counts per engine (each URL counted once).
  const seen = new Set<string>();
  const delta = new Map<string, { returned: number; cited: number; supported: number }>();
  for (const s of candidates) {
    const u = normalizeUrl(s.url);
    if (seen.has(u)) continue;
    seen.add(u);
    const d = delta.get(engineOf(s)) ?? { returned: 0, cited: 0, supported: 0 };
    d.returned++;
    if (cited.has(u)) {
      d.cited++;
      d.supported += credit.get(u) ?? 0;
    }
    delta.set(engineOf(s), d);
  }
  if (delta.size === 0) {
    trail.step({ kind: "learn", label: "Nothing to learn from this memo: no candidate sources", ms: Date.now() - t0 });
    return getBoard();
  }

  const board = load();
  const byName = new Map(board.engines.map((e) => [e.name, { ...e }]));
  for (const [name, d] of delta) {
    const e = byName.get(name) ?? { name, memos: 0, returned: 0, cited: 0, supported: 0, score: 0 };
    e.memos++;
    e.returned += d.returned;
    e.cited += d.cited;
    e.supported += d.supported;
    e.score = Math.round(scoreOf(e) * 10000) / 10000;
    byName.set(name, e);
  }
  const next: EngineBoard = { engines: sorted([...byName.values()]), memos: board.memos + 1, updated_at: new Date().toISOString() };
  save(next);

  const rows = [...delta].sort((a, b) => b[1].supported - a[1].supported || b[1].cited - a[1].cited);
  const withCites = rows.filter(([, d]) => d.cited > 0);
  const quiet = rows.length - withCites.length;
  const parts = withCites.map(([n, d]) =>
    memo.verification ? `${n} ${fmt(d.supported)}/${d.cited} verified` : `${n} ${d.cited} cited`,
  );
  if (quiet) parts.push(`${quiet} more engine${quiet === 1 ? "" : "s"} cited nothing`);
  trail.step({
    kind: "learn",
    label: `Learned from this memo${memo.verification ? "" : " (not verified, citations only)"}: ${parts.join(", ")}`,
    ms: Date.now() - t0,
  });
  return getBoard();
}

// Reorder candidates: consensus order (Telem routing + round-robin merge) stays the main signal; an engine's
// learned score nudges its results up or down by at most MAX_SHIFT places, scaled by how far it is from the
// average score of this candidate set. Ties keep the original order. Re-ids s1..sN.
export function rankSources(sources: Source[], trail: TrailRecorder): Source[] {
  const t0 = Date.now();
  const board = load();
  if (board.memos === 0) {
    trail.step({ kind: "learn", label: `Ranked ${sources.length} sources by consensus; nothing learned yet`, ms: Date.now() - t0 });
    return sources;
  }
  const stat = new Map(board.engines.map((e) => [e.name, e]));
  const scores = sources.map((s) => {
    const e = stat.get(engineOf(s));
    return e ? scoreOf(e) : scoreOf({ supported: 0, returned: 0 });
  });
  const ref = scores.reduce((a, b) => a + b, 0) / (scores.length || 1);
  const ranked = sources
    .map((s, i) => ({ s, i, key: i - MAX_SHIFT * Math.tanh((scores[i] - ref) / ref) }))
    .sort((a, b) => a.key - b.key || a.i - b.i)
    .map(({ s }, i) => ({ ...s, id: `s${i + 1}` }));
  trail.step({
    kind: "learn",
    label: `Ranked ${sources.length} sources with what Proven learned from ${board.memos} memo${board.memos === 1 ? "" : "s"}`,
    ms: Date.now() - t0,
  });
  return ranked;
}
