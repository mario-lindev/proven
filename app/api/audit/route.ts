import { auditPitch, trustScore, type AuditCheck, type AuditClaim, type AuditEvent, type AuditSummary } from "@/lib/brain/audit";
import { fail } from "@/lib/api";
import { isMock } from "@/lib/mock";

export const maxDuration = 300;

type Body = { url?: string; text?: string };

// POST { url? | text? } -> NDJSON, one AuditEvent per line: start, a claim per finished check, then done (or error).
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail("body must be JSON", 400);
  }
  const url = body.url?.trim();
  const text = body.text?.trim();
  if (!url && !text) return fail("url or text is required", 400);

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (ev: AuditEvent) => {
        if (open) controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
      };
      try {
        if (isMock()) await mockAudit(send);
        else await auditPitch(url ? { url } : { text }, send);
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        open = false;
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

// MOCK=1: a made-up company with made-up sources on example.com, streamed with delays. Nothing here is real.
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const src = (id: string, host: string, title: string, engine: string, independent: boolean) => ({
  id,
  url: `https://${host}/acme-robotics`,
  title,
  engine,
  snippet: "Demo data. This source is a fixture.",
  independent,
});

const MOCK_CLAIMS: AuditClaim[] = [
  { index: 0, category: "traction", sentence: "Trusted by more than 500 warehouses worldwide.", claim: "Acme Robotics is used in more than 500 warehouses", queries: ["Acme Robotics warehouses deployed", "Acme Robotics customer count"] },
  { index: 1, category: "uniqueness", sentence: "The only autonomous picking robot built for cold storage.", claim: "Acme Robotics is the only maker of autonomous picking robots for cold storage", queries: ["cold storage picking robot companies", "Acme Robotics competitors"] },
  { index: 2, category: "funding", sentence: "Backed by $40M in Series B funding.", claim: "Acme Robotics raised a $40M Series B", queries: ["Acme Robotics Series B", "Acme Robotics funding"] },
  { index: 3, category: "market", sentence: "Warehouse automation is a $90B market.", claim: "The warehouse automation market is worth $90B", queries: ["warehouse automation market size", "warehouse automation market forecast"] },
];
const MOCK_CHECKS: Omit<AuditCheck, "id" | "trail_id" | "ms" | "n_independent">[] = [
  { index: 2, verdict: "supported", note: "Two trade outlets report the $40M Series B.", quote: "closed a $40 million Series B round", quote_source_id: "s1", sources: [src("s1", "news.example.com", "Acme Robotics closes Series B", "exa", true), src("s2", "acme.example.com", "Acme Robotics press room", "tavily", false)] },
  { index: 1, verdict: "contradicted", note: "Found 2 funded competitors selling cold-storage picking robots.", quote: "one of several vendors now shipping freezer-rated picking arms", quote_source_id: "s1", sources: [src("s1", "trade.example.com", "Cold storage robotics: who is shipping", "brave", true), src("s3", "review.example.com", "Freezer-rated robots compared", "tavily", true)] },
  { index: 0, verdict: "unclear", note: "Only the company's own site gives the 500 figure; no outside count found.", sources: [src("s1", "acme.example.com", "Acme Robotics customers", "tavily", false)] },
  { index: 3, verdict: "contradicted", note: "Analyst estimates found are far lower, around $30B.", quote: "valued at roughly $30 billion this year", quote_source_id: "s2", sources: [src("s2", "research.example.com", "Warehouse automation market report", "perplexity", true)] },
];

async function mockAudit(send: (ev: AuditEvent) => void) {
  await wait(900);
  send({ type: "start", company: "Acme Robotics", domain: "acme.example.com", claims: MOCK_CLAIMS });
  const summary: AuditSummary = { supported: 0, contradicted: 0, unclear: 0 };
  for (const [i, c] of MOCK_CHECKS.entries()) {
    await wait(1100);
    summary[c.verdict]++;
    send({
      type: "claim",
      index: c.index,
      check: { ...c, id: `aud_mock${i}`, trail_id: "", ms: 1100 * (i + 1), n_independent: c.sources.filter((s) => s.independent).length },
    });
  }
  send({ type: "done", summary, trust_score: trustScore(summary), ms: 900 + 1100 * MOCK_CHECKS.length });
}
