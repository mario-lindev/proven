// Real-key smoke test: npx tsx --env-file=.env.local scripts/try-search.ts
import { extract, searchAll } from "../lib/search";
import { newTrail, store } from "../lib/store";

async function main() {
  const trail = newTrail();
  const sources = await searchAll(["Anthropic competitors", "Anthropic funding 2026"], trail);
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
