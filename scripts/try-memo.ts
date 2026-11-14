// One real quick memo with the verify pass, printed line by line with its evidence quotes.
// Usage: npx tsx --env-file=/path/to/.env.local scripts/try-memo.ts "Company" [quick|deep]
// VERIFY_DEBUG=1 also prints quotes that were not found in their source and the dropped lines.
import { buildMemo } from "../lib/brain/memo";
import { newTrail } from "../lib/store";
import type { Line } from "../lib/types";

const company = process.argv[2];
const depth = process.argv[3] === "deep" ? "deep" : "quick";
if (!company) {
  console.error('Usage: scripts/try-memo.ts "Company" [quick|deep]');
  process.exit(1);
}

const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
const trail = newTrail((s) => {
  if (s.kind !== "search") console.log(`  [${at()}] ${s.kind}: ${s.label} (${s.ms} ms)`);
});

async function main() {
  const m = await buildMemo(company, undefined, depth, trail);
  const src = new Map(m.sources.map((s) => [s.id, s]));
  const show = (title: string, lines: Line[]) => {
    console.log(`\n${title}`);
    for (const l of lines) {
      console.log(`- ${l.text} [${l.source_ids.join(", ")}]`);
      for (const e of l.evidence ?? []) console.log(`    ${e.verdict} ${e.source_id} (${src.get(e.source_id)?.engine}): "${e.quote}"`);
    }
  };

  console.log(`\n${m.company}: ${m.verdict} ${Math.round(m.confidence * 100)}% in ${at()}`);
  console.log(m.summary);
  show("Facts", m.facts);
  show("Risks", m.risks);
  if (m.rounds) {
    console.log("\nRounds");
    for (const r of m.rounds) {
      console.log(`- Round ${r.round}: ${r.queries.length} queries, ${r.new_sources} new sources, coverage ${r.coverage.toFixed(2)}, ${r.open.length} open`);
      for (const q of r.open) console.log(`    open: ${q}`);
    }
  }
  console.log(`\nClaims vs. reality (${m.contradictions?.length ?? 0})`);
  const tag = (ids: string[]) => ids.map((id) => `${id}${src.get(id)?.own ? " own" : ""}`).join(", ");
  for (const c of m.contradictions ?? []) {
    console.log(`- [${c.severity}] The company says: ${c.claim} [${tag(c.claim_source_ids)}]`);
    console.log(`    Independent sources say: ${c.reality} [${tag(c.reality_source_ids)}]`);
  }
  console.log(`Own sources cited: ${m.sources.filter((s) => s.own).map((s) => s.url).join(", ") || "none"}`);
  const v = m.verification;
  console.log(
    v
      ? `\nVerification: checked ${v.checked}, kept ${v.kept}, dropped ${v.dropped}, ${v.ms} ms`
      : "\nVerification: none (verify pass failed, see trail)",
  );
  console.log(`${m.sources.length} sources still cited. Memo /memo/${m.id}`);
}

main().catch((e) => {
  console.error(`FAILED: ${(e as Error).message}`);
  process.exit(1);
});
