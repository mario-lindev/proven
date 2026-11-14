// Real-key smoke test: npx tsx --env-file=.env.local scripts/try-search.ts
// Add TELEM_DILIGENCE=1 (env or .env.local) to also try the opt-in sec_edgar / coresignal / reddit / patent batches.
import { diligenceOn, extract, searchAll } from "../lib/search";
import { newTrail, store } from "../lib/store";

async function main() {
  const trail = newTrail();
  // Exercises the Telem batches: general, recent (published_after), platforms (pinned platform providers)
  // and, with TELEM_DILIGENCE=1, the diligence sets ("funding" -> financials, "Reddit" -> reddit, "patents").
  const queries = ["Anthropic competitors", "Anthropic funding 2026", "Anthropic latest news", "Anthropic hiring on LinkedIn"];
  if (diligenceOn()) queries.push("Anthropic customer reviews on Reddit", "Anthropic patents");
  console.log(`TELEM_DILIGENCE ${diligenceOn() ? "on" : "off"}`);
  const sources = await searchAll(queries, trail, { platforms: true });
  console.log(`\n=== ${sources.length} sources ===`);
  for (const s of sources) {
    console.log(`[${s.id}] (${s.engine}) ${s.title}\n    ${s.url}${s.published ? `  ${s.published}` : ""}\n    ${s.snippet.slice(0, 160)}`);
  }

  const urls = sources.slice(0, 2).map((s) => s.url);
  if (urls.length) {
    try {
      const pages = await extract(urls, trail);
      console.log(`\n=== extract: ${pages.length} pages ===`);
      for (const p of pages) console.log(`${p.url}  (${p.text.length} chars)\n    ${p.text.slice(0, 200).replace(/\s+/g, " ")}`);
    } catch (err) {
      console.log(`\nextract failed: ${(err as Error).message}`);
    }
  }

  console.log("\n=== trail ===");
  console.log(JSON.stringify(store.trails.get(trail.id), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
