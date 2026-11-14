// One real live check, printed with its verdict and time.
// Usage: npx tsx --env-file=/path/to/.env.local scripts/try-live.ts "We have no competitors." ["Company: what it does"]
import { checkText } from "../lib/brain/live";

const [text, context] = process.argv.slice(2);
if (!text) {
  console.error('Usage: scripts/try-live.ts "claim text" ["context"]');
  process.exit(1);
}

const t0 = Date.now();
checkText(text, context)
  .then((checks) => {
    console.log(`${checks.length} claim(s) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    for (const c of checks) console.log(`- ${c.verdict}: ${c.claim}\n    ${c.note}\n    ${c.sources.length} sources`);
  })
  .catch((e) => {
    console.error(`FAILED: ${(e as Error).message}`);
    process.exit(1);
  });
