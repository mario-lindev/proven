// Run real memos for the demo companies before judging so they show up in history (saved to .data/).
// Usage: npx tsx --env-file=.env.local scripts/warm-cache.ts [quick|deep] "Company A" "Company B" ...
import { buildMemo } from "../lib/brain/memo";
import { newTrail } from "../lib/store";

const args = process.argv.slice(2);
const depth = args[0] === "quick" || args[0] === "deep" ? (args.shift() as "quick" | "deep") : "deep";
const companies = args.length ? args : ["Stripe", "Figma", "Rivian"];

if (process.env.MOCK === "1") {
  console.error("MOCK=1 is set; set MOCK=0 to warm the cache with real research.");
  process.exit(1);
}

for (const company of companies) {
  const t0 = Date.now();
  let searches = 0;
  const trail = newTrail((s) => {
    if (s.kind === "search") searches++;
    console.log(`  ${company}: ${s.label} (${s.ms} ms)`);
  });
  try {
    const m = await buildMemo(company, undefined, depth, trail);
    console.log(
      `${company}: ${m.verdict} ${Math.round(m.confidence * 100)}%, ${m.facts.length} facts, ${m.risks.length} risks, ` +
        `${m.sources.length} sources, ${searches} searches, ${((Date.now() - t0) / 1000).toFixed(0)} s -> /memo/${m.id}`,
    );
  } catch (e) {
    console.error(`${company}: FAILED ${(e as Error).message}`);
  }
}
