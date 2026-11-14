// One real self-improve run (about 40 to 50 live checks). Saves .data/improve.json.
// Usage: npx tsx --env-file=/path/to/.env.local scripts/try-improve.ts
import { runImprove } from "../lib/brain/improve";

runImprove((ev) => {
  if (ev.type === "row") console.log(`  ${ev.phase}${ev.which ? ` ${ev.which}` : ` ${ev.iteration}`} ${ev.row.correct ? "right" : "WRONG"} [${ev.row.verdict}] ${ev.row.claim}`);
  else if (ev.type === "iteration") console.log(`iteration ${ev.n}: ${ev.correct}/${ev.total} on train${ev.kept ? " (kept)" : ""}`);
  else if (ev.type === "strategy") console.log(`strategy ${ev.n}${ev.rejected ? ` REJECTED (${ev.rejected})` : ""}: ${ev.strategy}`);
})
  .then((r) => {
    console.log(`\ntest: baseline ${r.test.baseline.toFixed(2)}, winner ${r.test.winner.toFixed(2)}; adopted: ${r.adopted}`);
    console.log(`winner: ${r.winner_strategy}`);
  })
  .catch((e) => {
    console.error(`FAILED: ${(e as Error).message}`);
    process.exit(1);
  });
