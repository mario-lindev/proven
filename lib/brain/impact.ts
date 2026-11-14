// OWNER: impact. Event Impact: a public company + an event (reported or "what if") -> whether the event has been
// reported, comparable past events at other public companies and what the stock did afterwards, forum sentiment,
// and a plain summary. Research, not advice: every percentage shown comes from a quote that code found in an
// independent source's text, and nothing here predicts a price.
import type { Source } from "../types";
import { searchAll } from "../search";
import { newTrail } from "../store";
import { askJSON } from "./claude";
import { siteOf } from "./audit";
import { numbersIn, quoteIn } from "./verify";
import { rangeLine, rangeOf } from "./impact-format";

export type ImpactStatus = "reported" | "hypothetical";
export type ImpactMove = { pct: number; quote: string; source_id: string };
export type ImpactAnalogue = {
  company: string;
  ticker: string;
  date: string;            // as the model knows it, e.g. "July 2024"
  what: string;            // one line: what happened
  day1: ImpactMove;        // next-trading-day move; always backed by a verified quote
  month1?: ImpactMove;     // about one month later, only if a source states it
  sources: Source[];       // the sources the quotes came from
};
export type ImpactSentimentItem = { quote: string; tone: "positive" | "negative" | "mixed"; source: Source };
export type ImpactSentiment = { note: string; items: ImpactSentimentItem[] };
export type ImpactRange = { min: number; max: number; median: number; n: number };
export type ImpactSummary = { line: string; similarity: string; differs: string; watch: string[] };
export type ImpactEvent =
  | { type: "start"; company: string; status: ImpactStatus; event_neutral: string; status_note: string; quote?: string; sources: Source[] }
  | { type: "analogue"; index: number; analogue: ImpactAnalogue }
  | { type: "sentiment"; sentiment: ImpactSentiment }
  | { type: "done"; summary: ImpactSummary; range: ImpactRange | null; dropped: number; ms: number }
  | { type: "error"; error: string };

const MAX_CANDIDATES = 8;
const MAX_ANALOGUES = 6;
const PRESS_WIRES = new Set(["prnewswire.com", "businesswire.com", "globenewswire.com", "newswire.com", "accesswire.com", "einpresswire.com"]);

const str = { type: "string" };
const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const planSchema = obj({
  company: str,
  event_neutral: str,
  analogues: { type: "array", items: obj({ company: str, ticker: str, date: str, what: str, domain: str, queries: { type: "array", items: str } }) },
});
const statusSchema = obj({ reported: { type: "boolean" }, note: str, quote: str, quote_source_id: str });
const moveSchema = obj({
  found: { type: "boolean" },
  what: str,
  day1_pct: { type: "number" },
  day1_quote: str,
  day1_source_id: str,
  month1_pct: { type: "number" },
  month1_quote: str,
  month1_source_id: str,
});
const sentimentSchema = obj({
  note: str,
  items: { type: "array", items: obj({ quote: str, source_id: str, tone: { type: "string", enum: ["positive", "negative", "mixed"] } }) },
});
const summarySchema = obj({ similarity: str, differs: str, watch: { type: "array", items: str } });

const fmtSources = (sources: Source[]) =>
  sources.map((s) => `[${s.id}] ${s.title} (${s.url}, via ${s.engine}${s.published ? `, ${s.published.slice(0, 10)}` : ""})\n${s.snippet}`).join("\n\n");
const clean = (q: string) => q.replace(/\s+/g, " ").trim();

// A stated move counts only if the quote is in that source's text and carries the number itself.
// The sign is read from the quote's own words when they are one-sided ("fell 11%" is never a gain).
const DOWN = /\b(fell|falls?|falling|drop(s|ped)?|plung\w+|sank|sinks?|slid|slides?|slump\w*|tumbl\w+|declin\w+|los[te]s?|losing|shed|down|lower|crash\w*|dived?|plummet\w*|wiped)\b/i;
const UP = /\b(rose|rises?|rising|gain(s|ed)?|jump(s|ed)?|surg\w+|climb\w+|rall(y|ied|ies)|soar\w+|up|higher|added|advanc\w+|popped)\b/i;
function verifiedMove(pct: number, quote: string, sourceId: string, sources: Source[], ownDomain: string): ImpactMove | null {
  const s = sources.find((x) => x.id === sourceId);
  if (!s || !Number.isFinite(pct) || quote.length > 320) return null;
  const site = siteOf(s.url);
  if (PRESS_WIRES.has(site) || (!!ownDomain && site === ownDomain)) return null;
  if (!quoteIn(quote, s.snippet)) return null;
  const mag = Math.abs(pct);
  if (!numbersIn(quote).some((n) => Number(n) === mag)) return null;
  const down = DOWN.test(quote);
  const up = UP.test(quote);
  const signed = down && !up ? -mag : up && !down ? mag : pct;
  return { pct: signed, quote: clean(quote), source_id: s.id };
}

type Candidate = { company: string; ticker: string; date: string; what: string; domain: string; queries: string[] };

export async function eventImpact(
  input: { company: string; event: string },
  onEvent: (ev: ImpactEvent) => void,
): Promise<{ analogues: ImpactAnalogue[]; dropped: number; range: ImpactRange | null; summary: ImpactSummary; ms: number }> {
  const t0 = Date.now();
  const trail = newTrail();
  const company = input.company.trim();
  const event = input.event.trim();
  if (!company || !event) throw new Error("Enter a company and an event.");

  // Sentiment runs alongside everything else; a failure there must not sink the run.
  const sentimentP = sampleSentiment(company, onEvent).catch(() => {
    onEvent({ type: "sentiment", sentiment: { note: "Forum and social search did not return usable posts.", items: [] } });
  });

  const [plan, news] = await Promise.all([
    askJSON<{ company: string; event_neutral: string; analogues: Candidate[] }>({
      label: "Plan: neutral event and comparable past events",
      trail,
      effort: "low",
      maxTokens: 3000,
      system:
        "You help an investor research how stocks reacted to past events. This is research, not advice: never predict a price or recommend a trade.\n" +
        "Given a public company (name or ticker) and an event that may be real or a 'what if':\n" +
        "- company: the company's usual name.\n" +
        "- event_neutral: the event restated neutrally in under 15 words, naming the company but no individual person. " +
        "If it alleges wrongdoing by a person, describe the category only, e.g. 'allegation of executive misconduct at Acme'.\n" +
        `- analogues: ${MAX_CANDIDATES} real, well documented past events of the same kind at OTHER publicly traded companies, where the news press reported the ` +
        "next-day share price move. Prefer famous cases with wide coverage and a mix of outcomes. For each: company, ticker, date (month and year), " +
        "what (one neutral line, no individual's name unless it is the plain public record of a role change), domain (the company's website domain), and exactly 2 short web " +
        "searches that would find news stating how much the shares moved the next day and over the following month, e.g. 'Equifax shares fell day after breach disclosure September 2017'.",
      user: `Company: ${company}\nEvent: ${event}`,
      schema: planSchema,
    }),
    searchAll([`${company} ${event} latest news`, `${company} ${event}`], trail),
  ]);

  const name = plan.company || company;
  const newsSources = news.slice(0, 10);
  const st = await askJSON<{ reported: boolean; note: string; quote: string; quote_source_id: string }>({
    label: "Has the event been reported?",
    trail,
    effort: "low",
    maxTokens: 1200,
    system:
      "Decide from the sources only whether this event has actually happened and been reported about this company. " +
      "reported = true only if a source's text states that this event happened at this company; speculation, rumours, " +
      "the same event at another company, or your own memory do not count.\n" +
      "note: one short line saying what the sources do or do not report, with dates if given. No predictions.\n" +
      'quote: under 30 words copied exactly from one source\'s text that states the event happened; quote_source_id: its id. Use "" for both if none does.',
    user: `Company: ${name}\nEvent: ${plan.event_neutral}\n(as the user typed it: ${event})\n\nSources:\n${fmtSources(newsSources)}`,
    schema: statusSchema,
  });
  const qs = newsSources.find((s) => s.id === st.quote_source_id);
  const reported = st.reported && !!qs && quoteIn(st.quote, qs.snippet);
  onEvent({
    type: "start",
    company: name,
    status: reported ? "reported" : "hypothetical",
    event_neutral: plan.event_neutral,
    status_note: reported ? st.note : `No source read reports this event at ${name}. It is treated as a hypothetical.`,
    ...(reported ? { quote: clean(st.quote) } : {}),
    sources: reported && qs ? [qs, ...newsSources.filter((s) => s.id !== qs.id).slice(0, 3)] : newsSources.slice(0, 4),
  });

  const self = name.toLowerCase();
  const candidates = plan.analogues
    .filter((c) => c.company.trim() && c.queries.length && c.company.toLowerCase() !== self)
    .slice(0, MAX_CANDIDATES);
  const analogues: ImpactAnalogue[] = [];
  let dropped = 0;
  await Promise.all(
    candidates.map(async (c) => {
      const a = await checkAnalogue(c).catch(() => null);
      if (!a || analogues.length >= MAX_ANALOGUES) {
        if (!a) dropped++;
        return;
      }
      analogues.push(a);
      onEvent({ type: "analogue", index: analogues.length - 1, analogue: a });
    }),
  );

  const range = rangeOf(analogues.map((a) => a.day1.pct));
  let extra = { similarity: "", differs: "", watch: [] as string[] };
  if (analogues.length) {
    extra = await askJSON<typeof extra>({
      label: "Summarize how comparable the past cases are",
      trail,
      effort: "low",
      maxTokens: 1500,
      system:
        "You write the closing notes of a research brief on how stocks reacted to past events. Rules: research, not advice. " +
        "No buy, sell or hold view, no price target, no prediction, never the word 'will' about a price. " +
        "Do not write any number, percentage or price: the verified figures are shown separately.\n" +
        "- similarity: 1 to 2 sentences on how alike the past cases are to this event and to each other.\n" +
        "- differs: 1 to 2 sentences on why this company's case may differ (size, business mix, what was already known, market conditions).\n" +
        "- watch: 3 short items an investor could watch to judge the situation (facts to look for, not actions to take).\n" +
        (reported ? "" : "The event is HYPOTHETICAL: write about it conditionally and never as something that happened."),
      user: `Company: ${name}\nEvent (${reported ? "reported" : "hypothetical"}): ${plan.event_neutral}\n\nPast cases:\n${analogues
        .map((a) => `- ${a.company}, ${a.date}: ${a.what} Next day: ${a.day1.pct}%.`)
        .join("\n")}`,
      schema: summarySchema,
    }).catch(() => extra);
  }
  // Belt and braces: the notes carry no figures of their own.
  const noFigures = (s: string) => (/\d\s*%|\$\s*\d/.test(s) ? "" : s.trim());
  const summary: ImpactSummary = {
    line: rangeLine(range),
    similarity: noFigures(extra.similarity),
    differs: noFigures(extra.differs),
    watch: extra.watch.map(noFigures).filter(Boolean).slice(0, 4),
  };
  await sentimentP;
  const ms = Date.now() - t0;
  onEvent({ type: "done", summary, range, dropped, ms });
  return { analogues, dropped, range, summary, ms };
}

// One past event: search, read the stated moves, keep it only if the next-day move has a verified quote.
async function checkAnalogue(c: Candidate): Promise<ImpactAnalogue | null> {
  const trail = newTrail();
  const sources = (await searchAll(c.queries.slice(0, 2), trail)).slice(0, 10);
  if (sources.length === 0) return null;
  const j = await askJSON<{
    found: boolean; what: string; day1_pct: number; day1_quote: string; day1_source_id: string;
    month1_pct: number; month1_quote: string; month1_source_id: string;
  }>({
    label: `Stock move: ${c.company}, ${c.date}`,
    trail,
    effort: "low",
    maxTokens: 1200,
    system:
      "From the sources only, find how the company's share price moved after the event. Do not use your memory for any number.\n" +
      "- day1: the move on the first trading day after the news (or the same day if the news broke during trading; after-hours or premarket moves do not count unless no other is given). " +
      "day1_pct: the percentage as a signed number (negative for a fall); day1_quote: the sentence or clause (under 40 words) copied exactly from one source's text " +
      "that states that percentage with its number; day1_source_id: its id.\n" +
      "- month1: the move over roughly the following month (three to six weeks), same three fields. Use 0 and \"\" if no source states it.\n" +
      "- what: one neutral line on what happened, with the date.\n" +
      "- found: false if no source text states the next-day percentage for THIS company and THIS event (then use 0 and \"\").\n" +
      "The quote must contain the percentage number itself and be about this company's shares, not an index or a peer.",
    user: `Company: ${c.company} (${c.ticker})\nEvent: ${c.what} (${c.date})\n\nSources:\n${fmtSources(sources)}`,
    schema: moveSchema,
  });
  if (!j.found) return null;
  const own = siteOf(c.domain);
  const day1 = verifiedMove(j.day1_pct, j.day1_quote, j.day1_source_id, sources, own);
  if (!day1) return null;
  const month1 = j.month1_quote ? verifiedMove(j.month1_pct, j.month1_quote, j.month1_source_id, sources, own) : null;
  const ids = new Set([day1.source_id, month1?.source_id]);
  return {
    company: c.company,
    ticker: c.ticker,
    date: c.date,
    what: j.what || c.what,
    day1,
    ...(month1 ? { month1 } : {}),
    sources: sources.filter((s) => ids.has(s.id)),
  };
}

// Investor forum and social posts about the company (Telem's platform engines: Reddit, X and others).
async function sampleSentiment(company: string, onEvent: (ev: ImpactEvent) => void) {
  const trail = newTrail();
  const sources = (
    await searchAll([`${company} stock reddit investors sentiment`, `${company} shares twitter sentiment`], trail, { platforms: true })
  ).slice(0, 14);
  const j = await askJSON<{ note: string; items: { quote: string; source_id: string; tone: "positive" | "negative" | "mixed" }[] }>({
    label: `Forum sentiment: ${company}`,
    trail,
    effort: "low",
    maxTokens: 1500,
    system:
      "Sample what investors on forums and social platforms (Reddit, X, YouTube, review sites) are saying about this company's stock, from the sources only. " +
      "Prefer forum and social sources over news articles.\n" +
      "- items: up to 5 short quotes (under 30 words each) copied exactly from a source's text, each with its source id and tone toward the company (positive, negative or mixed).\n" +
      "- note: one line describing the overall mood in the sampled posts and how thin the sample is. No numbers, no prediction, no advice.",
    user: `Company: ${company}\n\nSources:\n${fmtSources(sources)}`,
    schema: sentimentSchema,
  });
  const items: ImpactSentimentItem[] = [];
  for (const it of j.items) {
    const s = sources.find((x) => x.id === it.source_id);
    if (s && it.quote.length <= 300 && quoteIn(it.quote, s.snippet)) items.push({ quote: clean(it.quote), tone: it.tone, source: s });
  }
  onEvent({ type: "sentiment", sentiment: { note: items.length ? j.note : "No forum or social post with a quotable line was found.", items: items.slice(0, 5) } });
}
