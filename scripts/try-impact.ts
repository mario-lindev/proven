// One real Event Impact run, printed as the events stream.
// Usage: npx tsx --env-file=/path/to/.env.local scripts/try-impact.ts "<company>" "<event>"
import { eventImpact } from "../lib/brain/impact";
import { DISCLAIMER, fmtPct } from "../lib/brain/impact-format";

const [company, event] = process.argv.slice(2);
if (!company || !event) {
  console.error('Usage: scripts/try-impact.ts "<company>" "<event>"');
  process.exit(1);
}
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;

eventImpact({ company, event }, (ev) => {
  if (ev.type === "start") {
    console.log(`[${at()}] ${ev.company}: ${ev.status.toUpperCase()} - ${ev.event_neutral}\n  ${ev.status_note}`);
    if (ev.quote) console.log(`  quote: "${ev.quote}"`);
    ev.sources.forEach((s) => console.log(`  - ${s.engine} ${s.url}`));
  } else if (ev.type === "analogue") {
    const a = ev.analogue;
    const src = (id: string) => a.sources.find((s) => s.id === id)?.url;
    console.log(`\n[${at()}] ${a.company} (${a.ticker}), ${a.date}: 1-day ${fmtPct(a.day1.pct)}${a.month1 ? `, 1-month ${fmtPct(a.month1.pct)}` : ""}`);
    console.log(`  ${a.what}\n  "${a.day1.quote}" (${src(a.day1.source_id)})`);
    if (a.month1) console.log(`  "${a.month1.quote}" (${src(a.month1.source_id)})`);
  } else if (ev.type === "sentiment") {
    console.log(`\n[${at()}] sentiment: ${ev.sentiment.note}`);
    ev.sentiment.items.forEach((i) => console.log(`  [${i.tone}] "${i.quote}" (${i.source.engine} ${i.source.url})`));
  } else if (ev.type === "done") {
    console.log(`\n[${at()}] ${ev.summary.line} (${ev.range?.n ?? 0} kept, ${ev.dropped} dropped)`);
    console.log(`  Similar: ${ev.summary.similarity}\n  May differ: ${ev.summary.differs}`);
    ev.summary.watch.forEach((w) => console.log(`  watch: ${w}`));
    console.log(`  ${DISCLAIMER}`);
  }
}).catch((e) => {
  console.error(`FAILED: ${(e as Error).message}`);
  process.exit(1);
});
