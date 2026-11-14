// OWNER: learner. What Proven learned: which engines' results end up as verified evidence (AGENTS.md PHASE 2).
// An engine earns credit only when one of its results is the source of a verified quote behind a kept memo line.
// Board persists to .data/engines.json (/tmp/proven on Vercel), and is also kept in memory.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EngineBoard, EngineStat, Memo, MemoYield, QueryWin, Source, TrailRecorder, TrailStep } from "./types";
import { normalizeUrl } from "./search/http";
import { store } from "./store";

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

// ---------- the closed loop: topic x engine memory, proof-steered routing, query memory, efficiency ----------

export const MIN_RETURNED = 5;   // an engine needs this many results on record before Proven steers to it
const MAX_PROVEN = 3;
const MAX_QUERIES = 30;
const MAX_HISTORY = 50;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

// Names that are not Telem providers and so cannot be pinned.
const pinnable = (name: string) => name !== "tavily" && name !== "unknown" && name !== "telem" && !name.startsWith("telem_");

function topicFor(board: EngineBoard, topicOrQuery?: string): EngineStat[] | undefined {
  const key = topicOrQuery?.trim().toLowerCase();
  if (!key || !board.topics) return undefined;
  if (board.topics[key]) return board.topics[key];
  // A query: the topic Telem gave the same query pattern in a past memo, if any.
  return board.topics[board.queries?.find((q) => q.topic && q.pattern.toLowerCase() === key)?.topic ?? ""];
}

// Engines that proved out: at least MIN_RETURNED results on record, at least one verified, and a verified-yield
// score above the average of their peers. For a known Telem topic (or a query seen before) the topic's own table
// is used; otherwise the overall board. Empty when there is no history: Proven never steers on a guess.
export function provenEngines(topicOrQuery?: string): string[] {
  const board = load();
  const pool = (topicFor(board, topicOrQuery) ?? board.engines).filter((e) => pinnable(e.name));
  if (pool.length === 0) return [];
  const avg = pool.reduce((t, e) => t + scoreOf(e), 0) / pool.length;
  return sorted(pool.map((e) => ({ ...e, score: scoreOf(e) })))
    .filter((e) => e.returned >= MIN_RETURNED && e.supported > 0 && (pool.length === 1 || e.score > avg))
    .slice(0, MAX_PROVEN)
    .map((e) => e.name);
}

// What worked before, for the planner prompt: query shapes that led to verified sources, best first.
export function queryHints(n = 5): string[] {
  return (load().queries ?? []).slice(0, n).map((q) => q.pattern);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const generalize = (query: string, company: string) =>
  (company.trim() ? query.replace(new RegExp(escapeRe(company.trim()), "gi"), "{company}") : query).replace(/\s+/g, " ").trim().slice(0, 100);

// Pure: fold one memo's trail into the loop memory. `credit` maps a normalized URL to its verified credit (1 or 0.5).
export function learnFromTrail(
  board: EngineBoard,
  memo: Memo,
  steps: Pick<TrailStep, "kind" | "query" | "engines" | "topic" | "urls">[],
  credit: Map<string, number>,
): Pick<EngineBoard, "topics" | "queries" | "history"> {
  const searches = steps.filter((s) => s.kind === "search");
  const engineByUrl = new Map(memo.sources.map((s) => [normalizeUrl(s.url), engineOf(s)]));

  const topics: Record<string, EngineStat[]> = Object.fromEntries(
    Object.entries(board.topics ?? {}).map(([t, es]) => [t, es.map((e) => ({ ...e }))]),
  );
  const wins = new Map((board.queries ?? []).map((q) => [q.pattern, { ...q }]));
  const touched = new Set<string>(); // topic|engine pairs this memo already counted in `memos`

  for (const st of searches) {
    const verifiedUrls = [...new Set((st.urls ?? []).map(normalizeUrl))].filter((u) => (credit.get(u) ?? 0) > 0);
    if (st.topic) {
      const rows = (topics[st.topic] ??= []);
      const row = (name: string) => {
        let e = rows.find((r) => r.name === name);
        if (!e) rows.push((e = { name, memos: 0, returned: 0, cited: 0, supported: 0, score: 0 }));
        if (!touched.has(`${st.topic}|${name}`)) {
          touched.add(`${st.topic}|${name}`);
          e.memos++;
        }
        return e;
      };
      // An engine can answer one query in two batches (general + steered): count its larger result set once.
      const returned = new Map<string, number>();
      for (const e of st.engines ?? []) if (e.n_results > 0) returned.set(e.name, Math.max(returned.get(e.name) ?? 0, e.n_results));
      for (const [name, n] of returned) row(name).returned += n;
      for (const u of verifiedUrls) {
        const e = row(engineByUrl.get(u) ?? "unknown");
        e.cited++;
        e.supported += credit.get(u)!;
      }
    }
    if (st.query && verifiedUrls.length) {
      const pattern = generalize(st.query, memo.company);
      const w: QueryWin = wins.get(pattern) ?? { pattern, verified: 0, memos: 0 };
      w.verified += verifiedUrls.length;
      w.memos++;
      if (st.topic) w.topic = st.topic;
      wins.set(pattern, w);
    }
  }
  for (const [t, rows] of Object.entries(topics)) topics[t] = sorted(rows.map((e) => ({ ...e, score: round4(scoreOf(e)) })));

  const queries: QueryWin[] = [...wins.values()]
    .sort((a, b) => b.verified - a.verified || b.memos - a.memos || a.pattern.localeCompare(b.pattern))
    .slice(0, MAX_QUERIES);

  const history = [...(board.history ?? [])];
  if (searches.length) {
    const verified_lines = memo.verification
      ? [...memo.facts, ...memo.risks].filter((l) => (l.evidence ?? []).some((e) => e.verdict === "supported" || e.verdict === "partial")).length
      : 0;
    const read = new Set(steps.filter((s) => s.kind === "extract").flatMap((s) => (s.urls ?? []).map(normalizeUrl)));
    const row: MemoYield = {
      at: memo.created_at || new Date().toISOString(),
      company: memo.company,
      search_calls: searches.length,
      verified_lines,
      sources_read: read.size,
      yield: round4(verified_lines / searches.length),
    };
    history.push(row);
  }
  return { topics, queries, history: history.slice(-MAX_HISTORY) };
}

const engineOf = (s: Source) => s.engine || "unknown";
const fmt = (n: number) => String(Math.round(n * 10) / 10);

// candidates: every source found before the memo was written (cited or not).
// Credit per candidate: cited if any kept fact/risk cites it; supported = 1 if a kept line's evidence quotes it
// with verdict "supported", 0.5 if only "partial". A memo without `verification` gives citation credit only.
// steps: the memo's trail steps; by default read from the store by trail.id, so callers need not pass them.
export function recordMemo(
  memo: Memo,
  candidates: Source[],
  trail: TrailRecorder,
  steps: TrailStep[] = store.trails.get(trail.id)?.steps ?? [],
): EngineBoard {
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
  const loop = learnFromTrail(board, memo, steps, credit);
  const next: EngineBoard = {
    engines: sorted([...byName.values()]),
    memos: board.memos + 1,
    updated_at: new Date().toISOString(),
    ...(Object.keys(loop.topics ?? {}).length ? { topics: loop.topics } : {}),
    ...(loop.queries?.length ? { queries: loop.queries } : {}),
    ...(loop.history?.length ? { history: loop.history } : {}),
  };
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
  const last = steps.some((s) => s.kind === "search") ? loop.history?.at(-1) : undefined;
  if (last) {
    const proven = provenEngines();
    trail.step({
      kind: "learn",
      label:
        `Efficiency: ${last.verified_lines} verified line${last.verified_lines === 1 ? "" : "s"} from ${last.search_calls} search${last.search_calls === 1 ? "" : "es"} ` +
        `(${fmt(last.yield)} per search)` +
        (proven.length ? `; follow-up searches now steer to ${proven.join(", ")}` : ""),
      ms: 0,
    });
  }
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
