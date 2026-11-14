// OWNER: audit. Pitch Audit: a startup's site (or pasted pitch text) -> the checkable claims it makes about itself,
// each checked against web evidence. A quote only counts if it is from a source that is not the company's own
// site and code finds it in that source's text (same check as verify.ts).
import type { Source } from "../types";
import { extract, searchAll } from "../search";
import { rankSources } from "../learn";
import { newId, newTrail } from "../store";
import { askJSON } from "./claude";
import { quoteIn } from "./verify";

export type AuditVerdict = "supported" | "contradicted" | "unclear";
export type AuditClaim = {
  index: number;
  sentence: string;   // the company's own words, found in its text
  claim: string;      // neutral restatement
  category: string;   // traction | customers | funding | uniqueness | market | team | other
  queries: string[];
};
export type AuditSource = Source & { independent: boolean };   // false = the company's own site
export type AuditCheck = {
  id: string;
  index: number;
  verdict: AuditVerdict;
  note: string;
  quote?: string;            // exact words from an independent source, found in its text by code
  quote_source_id?: string;
  sources: AuditSource[];
  n_independent: number;     // independent sources among the candidates read
  trail_id: string;
  ms: number;
};
export type AuditSummary = { supported: number; contradicted: number; unclear: number };
export type AuditEvent =
  | { type: "start"; company: string; domain: string; claims: AuditClaim[] }
  | { type: "claim"; index: number; check: AuditCheck }
  | { type: "done"; summary: AuditSummary; trust_score: number; ms: number }
  | { type: "error"; error: string };

const MAX_CLAIMS = 8;
const CONCURRENCY = 4;
const MAX_TEXT_CHARS = 12000;
// Press-release wires carry the company's own words, so they count as the company's side, not independent.
const PRESS_WIRES = new Set(["prnewswire.com", "businesswire.com", "globenewswire.com", "newswire.com", "accesswire.com", "einpresswire.com"]);
const CATEGORIES = ["traction", "customers", "funding", "uniqueness", "market", "team", "other"];

const claimsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["company", "domain", "claims"],
  properties: {
    company: { type: "string" },
    domain: { type: "string" },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sentence", "claim", "category", "queries"],
        properties: {
          sentence: { type: "string" },
          claim: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
          queries: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const judgeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "note", "source_ids", "quote", "quote_source_id"],
  properties: {
    verdict: { type: "string", enum: ["supported", "contradicted", "unclear"] },
    note: { type: "string" },
    source_ids: { type: "array", items: { type: "string" } },
    quote: { type: "string" },
    quote_source_id: { type: "string" },
  },
};

// "www.app.ramp.com" -> "ramp.com". Good enough to tell the company's own pages from everyone else's.
export function siteOf(url: string): string {
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".");
    const twoPart = /^(co|com|org|net|ac|gov)\.[a-z]{2}$/.test(parts.slice(-2).join("."));
    return parts.slice(twoPart ? -3 : -2).join(".");
  } catch {
    return "";
  }
}

// 100 = every claim held up, 0 = every claim contradicted. An unclear claim counts half.
export function trustScore(s: AuditSummary): number {
  const n = s.supported + s.contradicted + s.unclear;
  return n ? Math.round((100 * (s.supported + 0.5 * s.unclear)) / n) : 0;
}

export async function auditPitch(
  input: { url?: string; text?: string },
  onEvent: (ev: AuditEvent) => void,
): Promise<{ claims: AuditClaim[]; checks: AuditCheck[]; summary: AuditSummary; trust_score: number; ms: number }> {
  const t0 = Date.now();
  const trail = newTrail();
  const url = input.url?.trim();
  let text = input.text?.trim() ?? "";
  if (url) {
    if (!/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(url)) throw new Error("Enter a full website address, e.g. https://ramp.com");
    text = (await extract([url], trail))[0].text;
  }
  if (text.length < 40) throw new Error("Not enough text to audit. Paste a website address or a few sentences of the pitch.");
  text = text.slice(0, MAX_TEXT_CHARS);

  const found = await askJSON<{ company: string; domain: string; claims: Omit<AuditClaim, "index">[] }>({
    label: "Find the company's checkable claims",
    trail,
    effort: "low",
    maxTokens: 4000,
    system:
      "You audit what a startup says about itself. From its website or pitch text, pick the factual claims the company makes " +
      "about itself that an outsider could check on the web: traction numbers (customers, users, revenue, growth), named customers " +
      "or partners, funding and valuation, 'first', 'only', 'leading' or 'no competitors', market size, team credentials. " +
      "Skip opinions, slogans, product feature descriptions and plans.\n" +
      `Return at most ${MAX_CLAIMS}, the most important and most specific first.\n` +
      "- sentence: the company's words, copied character for character from the text (one sentence or clause, under 40 words).\n" +
      "- claim: a neutral one-line restatement that names the company, e.g. 'Acme has more than 25,000 customers'.\n" +
      "- queries: exactly 2 short web searches that would confirm or refute it from sources other than the company " +
      "(for 'only' or 'no competitors', search for competitors).\n" +
      "- company: the company's name. domain: its website domain like acme.com, or \"\" if the text does not say.\n" +
      "Return an empty list if nothing is checkable.",
    user: url ? `Website: ${url}\n\n${text}` : text,
    schema: claimsSchema,
  });

  // Keep only claims whose sentence really is in the company's text.
  const claims: AuditClaim[] = found.claims
    .filter((c) => c.claim.trim() && c.queries.length && quoteIn(c.sentence, text))
    .slice(0, MAX_CLAIMS)
    .map((c, index) => ({ ...c, queries: c.queries.slice(0, 2), index }));
  const own = url ? siteOf(url) : siteOf(found.domain);
  if (claims.length === 0) throw new Error("No checkable factual claims found in that text.");
  onEvent({ type: "start", company: found.company, domain: own, claims });

  const checks: AuditCheck[] = [];
  let next = 0;
  const worker = async () => {
    while (next < claims.length) {
      const c = claims[next++];
      const check = await checkClaim(c, found.company, own);
      checks[c.index] = check;
      onEvent({ type: "claim", index: c.index, check });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, claims.length) }, worker));

  const summary: AuditSummary = { supported: 0, contradicted: 0, unclear: 0 };
  for (const c of checks) summary[c.verdict]++;
  const trust_score = trustScore(summary);
  const ms = Date.now() - t0;
  onEvent({ type: "done", summary, trust_score, ms });
  return { claims, checks, summary, trust_score, ms };
}

// One claim: search, judge against the sources, keep a quote only if it is in an independent source's text.
// A failed check comes back as "unclear" with the error in the note, so one bad search does not sink the audit.
async function checkClaim(c: AuditClaim, company: string, own: string): Promise<AuditCheck> {
  const t0 = Date.now();
  const trail = newTrail();
  const base = { id: newId("aud"), index: c.index, trail_id: trail.id };
  try {
    const ranked = rankSources(await searchAll(c.queries, trail), trail);
    const isOwn = (s: Source) => (!!own && siteOf(s.url) === own) || PRESS_WIRES.has(siteOf(s.url));
    // Independent sources first, so the company's own pages cannot crowd them out.
    const sources: AuditSource[] = [...ranked.filter((s) => !isOwn(s)), ...ranked.filter(isOwn)]
      .slice(0, 10)
      .map((s) => ({ ...s, independent: !isOwn(s) }));
    const judged = await askJSON<{ verdict: AuditVerdict; note: string; source_ids: string[]; quote: string; quote_source_id: string }>({
      label: `Judge: ${c.claim}`,
      trail,
      effort: "low",
      maxTokens: 1500,
      system:
        `You check a claim ${company || "a company"} makes about itself, using the sources only. Each source is tagged INDEPENDENT or OWN SITE (the company's site or its press release).` +
        "The company repeating its own claim is not evidence.\n" +
        "supported = independent sources back it (names, numbers and dates match or exceed the claim); " +
        "contradicted = independent sources show it is false or overstated (e.g. a different number, or funded competitors exist for an 'only' claim); " +
        "unclear = independent sources do not settle it (say so if only the company's own site says it).\n" +
        "note: one short line readable on a projector, naming the key evidence and who says it. Cite source ids.\n" +
        "quote: the few words (under 30) from one INDEPENDENT source's text that best back your verdict, copied exactly; " +
        'quote_source_id: its id. Use "" for both if no independent source text does.',
      user: `Claim: ${c.claim}\nThe company's words: "${c.sentence}"\n\nSources:\n${sources
        .map((s) => `[${s.id}] ${s.independent ? "INDEPENDENT" : "OWN SITE"} ${s.title} (${s.url}, via ${s.engine})\n${s.snippet}`)
        .join("\n\n")}`,
      schema: judgeSchema,
    });
    const ids = new Set(judged.source_ids);
    const qs = sources.find((s) => s.id === judged.quote_source_id);
    const quoted = !!qs && qs.independent && judged.quote.length <= 300 && quoteIn(judged.quote, qs.snippet);
    if (quoted) ids.add(qs.id);
    const cited = sources.filter((s) => ids.has(s.id));
    // A verdict other than "unclear" needs at least one independent source behind it.
    const unbacked = judged.verdict !== "unclear" && !cited.some((s) => s.independent);
    return {
      ...base,
      verdict: unbacked ? "unclear" : judged.verdict,
      note: unbacked ? `No independent source backs this. ${judged.note}` : judged.note,
      ...(quoted ? { quote: judged.quote.replace(/\s+/g, " ").trim(), quote_source_id: qs.id } : {}),
      sources: cited,
      n_independent: sources.filter((s) => s.independent).length,
      ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      ...base,
      verdict: "unclear",
      note: `Could not check this claim: ${e instanceof Error ? e.message : String(e)}`,
      sources: [],
      n_independent: 0,
      ms: Date.now() - t0,
    };
  }
}
