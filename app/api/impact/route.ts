import { eventImpact, type ImpactAnalogue, type ImpactEvent } from "@/lib/brain/impact";
import { rangeLine, rangeOf } from "@/lib/brain/impact-format";
import { fail } from "@/lib/api";
import { isMock } from "@/lib/mock";

export const maxDuration = 300;

type Body = { company?: string; event?: string };

// POST { company, event } -> NDJSON, one ImpactEvent per line: start, an analogue per verified past case,
// sentiment, then done (or error).
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail("body must be JSON", 400);
  }
  const company = body.company?.trim();
  const event = body.event?.trim();
  if (!company || !event) return fail("company and event are required", 400);

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (ev: ImpactEvent) => {
        if (open) controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
      };
      try {
        if (isMock()) await mockImpact(send);
        else await eventImpact({ company, event }, send);
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

// MOCK=1: made-up companies, made-up moves and made-up sources on example.com. Nothing here is real.
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const src = (id: string, host: string, title: string, engine: string) => ({
  id,
  url: `https://${host}/demo`,
  title,
  engine,
  snippet: "Demo data. This source is a fixture.",
});
const mockCase = (company: string, ticker: string, date: string, pct: number, month?: number): ImpactAnalogue => ({
  company,
  ticker,
  date,
  what: `Demo fixture: ${company} had a made-up outage on a made-up date.`,
  day1: { pct, quote: `Demo fixture: shares of ${company} ${pct < 0 ? "fell" : "rose"} ${Math.abs(pct)}% the next day`, source_id: "s1" },
  ...(month !== undefined
    ? { month1: { pct: month, quote: `Demo fixture: a month later the stock was ${month < 0 ? "down" : "up"} ${Math.abs(month)}%`, source_id: "s2" } }
    : {}),
  sources: [src("s1", "news.example.com", `${company} shares after the outage (demo)`, "exa"), src("s2", "markets.example.com", `${company}, one month on (demo)`, "tavily")],
});
const MOCK_CASES = [
  mockCase("Demo Airlines", "DEMO1", "March 2021", -4.2, -1.5),
  mockCase("Sample Cloud Co", "DEMO2", "June 2019", -11),
  mockCase("Example Payments", "DEMO3", "October 2022", -2.7, 3.1),
  mockCase("Fixture Telecom", "DEMO4", "January 2020", 0.8),
];

async function mockImpact(send: (ev: ImpactEvent) => void) {
  await wait(900);
  send({
    type: "start",
    company: "Acme Software (demo)",
    status: "hypothetical",
    event_neutral: "A made-up service outage at Acme Software",
    status_note: "Demo data. No source reports this event; it is treated as a hypothetical.",
    sources: [src("s1", "news.example.com", "Acme Software latest (demo)", "brave")],
  });
  for (const [index, analogue] of MOCK_CASES.entries()) {
    await wait(900);
    send({ type: "analogue", index, analogue });
    if (index === 1)
      send({
        type: "sentiment",
        sentiment: {
          note: "Demo data. A small made-up sample, mostly cautious.",
          items: [
            { quote: "Demo fixture: holding through this, outages get forgotten", tone: "positive", source: src("s1", "reddit.example.com", "r/demo thread", "fetchlayer_reddit") },
            { quote: "Demo fixture: second incident this year, not great", tone: "negative", source: src("s2", "x.example.com", "Post by a demo account", "socialdatax_x") },
          ],
        },
      });
  }
  const range = rangeOf(MOCK_CASES.map((c) => c.day1.pct));
  send({
    type: "done",
    range,
    dropped: 2,
    ms: 900 * (MOCK_CASES.length + 1),
    summary: {
      line: rangeLine(range),
      similarity: "Demo data. The made-up cases are all service outages at made-up companies.",
      differs: "Demo data. A real case may differ in size, customer mix and what the market already knew.",
      watch: ["Demo: how long the outage lasts", "Demo: whether customers ask for credits", "Demo: what the company says about the cause"],
    },
  });
}
