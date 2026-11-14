// OWNER: Rishith. Live Room: a bit of transcript -> checked claims (AGENTS.md §8).
import type { ClaimCheck } from "../types";
import { searchAll } from "../search";
import { rankSources } from "../learn";
import { newId, newTrail } from "../store";
import { askJSON } from "./claude";
import { quoteIn } from "./verify";
import { currentStrategy } from "./improve";

const claimsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["claims"],
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "queries"],
        properties: { claim: { type: "string" }, queries: { type: "array", items: { type: "string" } } },
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

// Don't re-check the same claim within 90 s (overlapping transcript windows send it twice).
// Expires so a rehearsal doesn't block the real demo.
const seen = new Map<string, number>();
const SEEN_MS = 90_000;

// `context`: who is pitching and what they do (e.g. "Proven: checks investor pitch claims live"). Optional.
// `strategy`: search and judging guidance; defaults to the one the self-improve loop saved (lib/brain/improve.ts).
export async function checkText(text: string, context?: string, strategy?: string): Promise<ClaimCheck[]> {
  const follow = ` Search strategy to follow: ${strategy ?? currentStrategy()}`;
  const ctx = context?.trim().slice(0, 600);
  const about = ctx ? `Company being pitched: ${ctx}\n\n` : "";
  const pickTrail = newTrail();
  const { claims } = await askJSON<{ claims: { claim: string; queries: string[] }[] }>({
    label: "Find checkable claims",
    trail: pickTrail,
    effort: "low",
    maxTokens: 2000,
    system:
      "You listen to startup pitches. From the text, pull out factual claims that the web can check: market size, growth, " +
      "customers, funding, 'no competitors', 'first to', rankings, partnerships. Skip opinions, plans and feelings. " +
      "For each claim give 2 to 3 short search queries that would confirm or refute it (for 'no competitors', search for competitors). " +
      "Return an empty list if there is nothing checkable. At most 2 claims. " +
      "'We', 'our' and 'us' mean the company being pitched. If it is given, write the claim and the queries about that company and its market " +
      "(name what it does in the queries). If it is not given and the text does not name the company or product, " +
      "still return the claim and write queries that test it as a general claim about startups or the market named in the text." +
      follow,
    user: `${about}Text: ${text}`,
    schema: claimsSchema,
  });

  const now = Date.now();
  // An explicit strategy is a benchmark run, which re-checks the same claim on purpose.
  const fresh = claims.filter((c) => strategy !== undefined || now - (seen.get(c.claim.toLowerCase()) ?? 0) > SEEN_MS).slice(0, 2);
  fresh.forEach((c) => seen.set(c.claim.toLowerCase(), now));

  return Promise.all(
    fresh.map(async (c) => {
      const trail = newTrail();
      const sources = rankSources(await searchAll(c.queries.slice(0, 3), trail), trail).slice(0, 10);
      const judged = await askJSON<{
        verdict: ClaimCheck["verdict"];
        note: string;
        source_ids: string[];
        quote: string;
        quote_source_id: string;
      }>({
        label: `Judge: ${c.claim}`,
        trail,
        effort: "low",
        maxTokens: 1500,
        system:
          "Judge a spoken claim against the sources only. supported = sources back it; contradicted = sources show it is false " +
          "(e.g. funded competitors exist); unclear = not enough evidence. note: one short line a judge can read on a projector, " +
          "naming the key evidence (e.g. 'Found 3 funded competitors: A, B, C'). Cite source ids. " +
          "quote: the few words (under 20) from one source's text that best back your verdict, copied exactly; quote_source_id: its id. " +
          'Use "" for both if no source text does. ' +
          "Never answer unclear only because the company is not named. If no company or product is identified, judge the claim as a " +
          "general statement about the market: an absolute claim such as 'no competitors' or 'first to' is contradicted when the sources " +
          "show that such claims are almost never true or that competitors exist in the market described; say in the note that it was judged as a general claim." +
          follow,
        user: `${about}Claim: ${c.claim}\n\nSources:\n${sources
          .map((s) => `[${s.id}] ${s.title} (${s.url}, via ${s.engine})\n${s.snippet}`)
          .join("\n\n")}`,
        schema: judgeSchema,
      });
      const ids = new Set(judged.source_ids);
      // Add the quote to the note only if it really is in that source's text.
      const qs = sources.find((s) => s.id === judged.quote_source_id);
      const quoted = qs && judged.quote.length <= 200 && quoteIn(judged.quote, qs.snippet);
      if (quoted) ids.add(qs.id);
      return {
        id: newId("chk"),
        claim: c.claim,
        verdict: judged.verdict,
        note: quoted ? `${judged.note.trim().replace(/[.;,]*$/, ".")} Source says: "${judged.quote.replace(/\s+/g, " ").trim()}"` : judged.note,
        sources: sources.filter((s) => ids.has(s.id)),
        trail_id: trail.id,
      } satisfies ClaimCheck;
    }),
  );
}
