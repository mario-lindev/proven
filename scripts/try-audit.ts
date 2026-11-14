// One real Pitch Audit, printed claim by claim as the checks finish.
// Usage: npx tsx --env-file=/path/to/.env.local scripts/try-audit.ts <url | "pitch text">
import { auditPitch } from "../lib/brain/audit";

const arg = process.argv.slice(2).join(" ").trim();
if (!arg) {
  console.error('Usage: scripts/try-audit.ts <url | "pitch text">');
  process.exit(1);
}

const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;

auditPitch(/^https?:\/\//i.test(arg) ? { url: arg } : { text: arg }, (ev) => {
  if (ev.type === "start") {
    console.log(`[${at()}] ${ev.company} (${ev.domain || "no domain"}): ${ev.claims.length} claims`);
    ev.claims.forEach((c) =>
      console.log(`  ${c.index + 1}. [${c.category}] ${c.claim}\n     "${c.sentence}"\n     searches: ${c.queries.join(" | ")}`),
    );
  } else if (ev.type === "claim") {
    const k = ev.check;
    console.log(`\n[${at()}] claim ${ev.index + 1}: ${k.verdict.toUpperCase()} (${(k.ms / 1000).toFixed(1)} s, ${k.n_independent} independent candidates)`);
    console.log(`  ${k.note}`);
    if (k.quote) console.log(`  quote (${k.quote_source_id}): "${k.quote}"`);
    k.sources.forEach((s) => console.log(`  - ${s.id} ${s.independent ? "independent" : "own site"} ${s.engine} ${s.url}`));
  } else if (ev.type === "done") {
    const s = ev.summary;
    console.log(
      `\n[${at()}] ${s.supported + s.contradicted + s.unclear} claims: ${s.supported} hold up, ${s.contradicted} contradicted, ${s.unclear} unclear. Trust score ${ev.trust_score}/100.`,
    );
  }
}).catch((e) => {
  console.error(`FAILED: ${(e as Error).message}`);
  process.exit(1);
});
