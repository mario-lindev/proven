// Self-improve loop: score the search strategy against an answer key, rewrite it from its misses,
// keep the best, then test default and winner on claims the improver never saw. The winner is used
// by checkText (lib/brain/live.ts) only if it does at least as well on that held-out set.
import "@/lib/seed";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { newTrail } from "../store";
import { askJSON } from "./claude";
import { BENCHMARK, BENCH_NAMES, type BenchClaim } from "./benchmark";
import { checkText } from "./live";

export const DEFAULT_STRATEGY = "Search for the claim's key fact directly and judge only from what the sources say.";

export type ImproveRow = { claim: string; key: boolean; verdict: string; correct: boolean; note: string; ms: number };
export type ImproveIteration = { n: number; strategy: string; train_accuracy: number; rows: ImproveRow[] };
export type ImproveResult = {
  at: string;
  default_strategy: string;
  winner_strategy: string;
  iterations: ImproveIteration[];
  test: { baseline: number; winner: number; rows_baseline: ImproveRow[]; rows_winner: ImproveRow[] };
  adopted: boolean;
};
export type ImproveEvent =
  | { type: "start"; train: number; test: number; iterations: number; default_strategy: string }
  | { type: "row"; phase: "train" | "test"; iteration: number; which?: "baseline" | "winner"; row: ImproveRow }
  | { type: "iteration"; n: number; train_accuracy: number; correct: number; total: number; kept: boolean }
  | { type: "strategy"; n: number; strategy: string; rejected?: string }
  | { type: "done"; result: ImproveResult }
  | { type: "error"; error: string };

const DIR = process.env.VERCEL ? "/tmp/proven" : join(process.cwd(), ".data");
const FILE = join(DIR, "improve.json");

export function lastImprove(): ImproveResult | undefined {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as ImproveResult;
  } catch {
    return undefined;
  }
}

// The strategy the product uses: the saved winner if it was adopted, else the default.
export function currentStrategy(): string {
  const r = lastImprove();
  return r?.adopted ? r.winner_strategy : DEFAULT_STRATEGY;
}

type Emit = (ev: ImproveEvent) => void;

async function score(strategy: string, set: BenchClaim[], tag: { phase: "train" | "test"; iteration: number; which?: "baseline" | "winner" }, emit: Emit) {
  const rows: ImproveRow[] = new Array(set.length);
  let next = 0;
  const worker = async () => {
    while (next < set.length) {
      const i = next++;
      const b = set[i];
      const t0 = Date.now();
      let verdict = "none";
      let note = "No checkable claim found.";
      try {
        const [c] = await checkText(b.claim, undefined, strategy);
        if (c) [verdict, note] = [c.verdict, c.note];
      } catch (e) {
        verdict = "error";
        note = e instanceof Error ? e.message : String(e);
      }
      const correct = (verdict === "supported" && b.key) || (verdict === "contradicted" && !b.key);
      rows[i] = { claim: b.claim, key: b.key, verdict, correct, note, ms: Date.now() - t0 };
      emit({ type: "row", ...tag, row: rows[i] });
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  return { accuracy: rows.filter((r) => r.correct).length / rows.length, rows };
}

const strategySchema = {
  type: "object",
  additionalProperties: false,
  required: ["strategy"],
  properties: { strategy: { type: "string" } },
};

async function rewrite(best: string, misses: ImproveRow[]): Promise<string> {
  const { strategy } = await askJSON<{ strategy: string }>({
    label: "Rewrite the search strategy",
    trail: newTrail(),
    effort: "low",
    maxTokens: 1000,
    system:
      "You tune a fact-checker. It writes web search queries for a claim, then judges the claim from the search results as " +
      "supported, contradicted or unclear. You get its current strategy and the claims it got wrong. Write a better strategy: " +
      "general guidance on how to search and how to judge, at most 80 words. It must work for claims it has never seen, so do NOT " +
      "mention any specific claim, company, person, product, date or answer. If there are no misses, tighten the wording only.",
    user: `Current strategy: ${best}\n\nMissed claims:\n${
      misses.map((m) => `- "${m.claim}" should be ${m.key ? "supported" : "contradicted"}; got ${m.verdict}. Note: ${m.note}`).join("\n") || "(none)"
    }`,
    schema: strategySchema,
  });
  return strategy.trim();
}

export async function runImprove(emit: Emit, { iterations = 2 }: { iterations?: number } = {}): Promise<ImproveResult> {
  const train = BENCHMARK.filter((b) => b.split === "train");
  const test = BENCHMARK.filter((b) => b.split === "test");
  emit({ type: "start", train: train.length, test: test.length, iterations, default_strategy: DEFAULT_STRATEGY });

  const first = await score(DEFAULT_STRATEGY, train, { phase: "train", iteration: 0 }, emit);
  const its: ImproveIteration[] = [{ n: 0, strategy: DEFAULT_STRATEGY, train_accuracy: first.accuracy, rows: first.rows }];
  emit({ type: "iteration", n: 0, train_accuracy: first.accuracy, correct: first.rows.filter((r) => r.correct).length, total: train.length, kept: true });
  let best = its[0];

  for (let n = 1; n <= iterations; n++) {
    const proposed = await rewrite(best.strategy, best.rows.filter((r) => !r.correct));
    const low = proposed.toLowerCase();
    const leak = BENCH_NAMES.find((name) => new RegExp(`\\b${name}\\b`).test(low));
    const tooLong = proposed.split(/\s+/).length > 80;
    if (!proposed || leak || tooLong) {
      emit({ type: "strategy", n, strategy: proposed, rejected: leak ? `names a benchmark company (${leak})` : tooLong ? "over 80 words" : "empty" });
      continue;
    }
    emit({ type: "strategy", n, strategy: proposed });
    const s = await score(proposed, train, { phase: "train", iteration: n }, emit);
    const it = { n, strategy: proposed, train_accuracy: s.accuracy, rows: s.rows };
    its.push(it);
    const kept = s.accuracy > best.train_accuracy; // ties keep the older
    if (kept) best = it;
    emit({ type: "iteration", n, train_accuracy: s.accuracy, correct: s.rows.filter((r) => r.correct).length, total: train.length, kept });
  }

  const changed = best.strategy !== DEFAULT_STRATEGY;
  const base = await score(DEFAULT_STRATEGY, test, { phase: "test", iteration: its.length, which: "baseline" }, emit);
  const win = changed ? await score(best.strategy, test, { phase: "test", iteration: its.length, which: "winner" }, emit) : base;

  const result: ImproveResult = {
    at: new Date().toISOString(),
    default_strategy: DEFAULT_STRATEGY,
    winner_strategy: best.strategy,
    iterations: its,
    test: { baseline: base.accuracy, winner: win.accuracy, rows_baseline: base.rows, rows_winner: win.rows },
    adopted: changed && win.accuracy >= base.accuracy,
  };
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(result, null, 1));
  } catch {
    // Disk is a convenience; the caller still gets the result.
  }
  emit({ type: "done", result });
  return result;
}
