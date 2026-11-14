// What Telem did for Proven, counted from the real research trails saved on this server.
import "@/lib/seed";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getBoard } from "@/lib/learn";
import { isMock } from "@/lib/mock";
import type { Trail } from "@/lib/types";

export const dynamic = "force-dynamic";

const DIR = process.env.VERCEL ? "/tmp/proven" : join(process.cwd(), ".data");
const isDirect = (name: string) => name === "tavily"; // our own Tavily calls; everything else ran through Telem
const isBatch = (name: string) => name === "telem" || name.startsWith("telem_"); // a failed batch, not an engine

export async function GET() {
  if (isMock()) return NextResponse.json({ ready: false, reason: "demo data" });
  const engines = new Map<string, { runs: number; results: number; ms: number; errors: number }>();
  const topics = new Map<string, { queries: number; engines: Map<string, number> }>();
  const sessions = new Set<string>();
  let trails = 0, queries = 0, runs = 0, results = 0, steered = 0, dated = 0, maxEngines = 0;
  let files: string[] = [];
  try {
    files = readdirSync(join(DIR, "trails"));
  } catch {
    // no trails yet
  }
  for (const f of files) {
    let t: Trail;
    try {
      t = JSON.parse(readFileSync(join(DIR, "trails", f), "utf8")) as Trail;
    } catch {
      continue;
    }
    const steps = t.steps.filter((s) => s.kind === "search" && !(s.urls ?? []).some((x) => x.includes("example.com")));
    if (steps.length === 0) continue;
    trails++;
    const inTrail = new Set<string>();
    for (const s of steps) {
      queries++;
      if (s.telem_session_id) sessions.add(s.telem_session_id);
      if (s.steered?.length) steered++;
      if (s.published_after) dated++;
      const topic = s.topic ?? "unlabelled";
      const tp = topics.get(topic) ?? { queries: 0, engines: new Map<string, number>() };
      tp.queries++;
      for (const e of s.engines ?? []) {
        if (isDirect(e.name) || isBatch(e.name)) continue;
        const st = engines.get(e.name) ?? { runs: 0, results: 0, ms: 0, errors: 0 };
        st.runs++;
        st.results += e.n_results;
        st.ms += e.latency_ms;
        if (e.error) st.errors++;
        engines.set(e.name, st);
        runs++;
        results += e.n_results;
        inTrail.add(e.name);
        tp.engines.set(e.name, (tp.engines.get(e.name) ?? 0) + 1);
      }
      topics.set(topic, tp);
    }
    maxEngines = Math.max(maxEngines, inTrail.size);
  }
  const board = getBoard();
  const verifiedAll = board.engines.reduce((a, e) => a + e.supported, 0);
  const verifiedTelem = board.engines.filter((e) => !isDirect(e.name)).reduce((a, e) => a + e.supported, 0);
  return NextResponse.json({
    ready: queries > 0,
    reason: queries > 0 ? undefined : "no research has run on this server yet",
    trails, queries, runs, results, steered, dated,
    sessions: sessions.size,
    max_engines_in_one_run: maxEngines,
    engines: [...engines.entries()]
      .map(([name, s]) => ({ name, runs: s.runs, results: s.results, avg_ms: Math.round(s.ms / s.runs), errors: s.errors }))
      .sort((a, b) => b.runs - a.runs),
    topics: [...topics.entries()]
      .map(([topic, t]) => ({
        topic,
        queries: t.queries,
        engines: [...t.engines.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, runs: n })),
      }))
      .sort((a, b) => b.queries - a.queries),
    proof: { verified: verifiedAll, via_telem: verifiedTelem, memos: board.memos },
  });
}
