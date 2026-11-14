import { DEFAULT_STRATEGY, lastImprove, runImprove, type ImproveEvent, type ImproveResult, type ImproveRow } from "@/lib/brain/improve";
import { fail } from "@/lib/api";
import { isMock } from "@/lib/mock";

export const maxDuration = 300;

// GET -> the last saved run, or { ready: false }.
export async function GET() {
  const r = lastImprove();
  return Response.json(r ? { ready: true, result: r } : { ready: false }, { headers: { "Cache-Control": "no-store" } });
}

// POST -> NDJSON, one ImproveEvent per line. Spends search and model credits, so it is off on the hosted site by default.
export async function POST() {
  if (process.env.VERCEL && process.env.ALLOW_IMPROVE !== "1" && !isMock()) {
    return fail("The loop spends search credits, so it only runs locally. This page shows the last real run.", 403);
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: ImproveEvent) => controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
      try {
        if (isMock()) await mockRun(send);
        else await runImprove(send);
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

// MOCK=1: a made-up run with made-up claims. Nothing here is real and nothing is saved.
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function mockRun(send: (ev: ImproveEvent) => void) {
  const row = (i: number, correct: boolean): ImproveRow => ({
    claim: `Demo claim ${i + 1} about a made-up company.`,
    key: i % 2 === 0,
    verdict: correct ? (i % 2 === 0 ? "supported" : "contradicted") : "unclear",
    correct,
    note: "Demo data. Not a real check.",
    ms: 400,
  });
  const better = "Demo strategy: search for the event and for its opposite, then judge.";
  send({ type: "start", train: 4, test: 2, iterations: 1, default_strategy: DEFAULT_STRATEGY });
  const r0 = [row(0, true), row(1, false), row(2, true), row(3, false)];
  const r1 = [row(0, true), row(1, true), row(2, true), row(3, false)];
  for (const r of r0) (await wait(400), send({ type: "row", phase: "train", iteration: 0, row: r }));
  send({ type: "iteration", n: 0, train_accuracy: 0.5, correct: 2, total: 4, kept: true });
  await wait(600);
  send({ type: "strategy", n: 1, strategy: better });
  for (const r of r1) (await wait(400), send({ type: "row", phase: "train", iteration: 1, row: r }));
  send({ type: "iteration", n: 1, train_accuracy: 0.75, correct: 3, total: 4, kept: true });
  const tb = [row(4, true), row(5, false)];
  const tw = [row(4, true), row(5, true)];
  for (const r of tb) (await wait(400), send({ type: "row", phase: "test", iteration: 2, which: "baseline", row: r }));
  for (const r of tw) (await wait(400), send({ type: "row", phase: "test", iteration: 2, which: "winner", row: r }));
  const result: ImproveResult = {
    at: new Date().toISOString(),
    default_strategy: DEFAULT_STRATEGY,
    winner_strategy: better,
    iterations: [
      { n: 0, strategy: DEFAULT_STRATEGY, train_accuracy: 0.5, rows: r0 },
      { n: 1, strategy: better, train_accuracy: 0.75, rows: r1 },
    ],
    test: { baseline: 0.5, winner: 1, rows_baseline: tb, rows_winner: tw },
    adopted: false,
  };
  send({ type: "done", result });
}
