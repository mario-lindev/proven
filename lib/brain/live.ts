// OWNER: Rishith. Live Room: a bit of transcript -> checked claims (AGENTS.md §8).
import type { ClaimCheck } from "../types";
import { searchAll } from "../search";
import { newId, newTrail } from "../store";
import { askJSON } from "./claude";

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
  required: ["verdict", "note", "source_ids"],
  properties: {
    verdict: { type: "string", enum: ["supported", "contradicted", "unclear"] },
    note: { type: "string" },
    source_ids: { type: "array", items: { type: "string" } },
  },
};

// Don't re-check the same claim within 90 s (overlapping transcript windows send it twice).
// Expires so a rehearsal doesn't block the real demo.
const seen = new Map<string, number>();
const SEEN_MS = 90_000;

export async function checkText(text: string): Promise<ClaimCheck[]> {
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
      "Return an empty list if there is nothing checkable. At most 2 claims.",
    user: text,
    schema: claimsSchema,
  });

  const now = Date.now();
  const fresh = claims.filter((c) => now - (seen.get(c.claim.toLowerCase()) ?? 0) > SEEN_MS).slice(0, 2);
  fresh.forEach((c) => seen.set(c.claim.toLowerCase(), now));

  return Promise.all(
    fresh.map(async (c) => {
      const trail = newTrail();
      const sources = (await searchAll(c.queries.slice(0, 3), trail)).slice(0, 10);
      const judged = await askJSON<{ verdict: ClaimCheck["verdict"]; note: string; source_ids: string[] }>({
        label: `Judge: ${c.claim}`,
        trail,
        effort: "low",
        maxTokens: 1500,
        system:
          "Judge a spoken claim against the sources only. supported = sources back it; contradicted = sources show it is false " +
          "(e.g. funded competitors exist); unclear = not enough evidence. note: one short line a judge can read on a projector, " +
          "naming the key evidence (e.g. 'Found 3 funded competitors: A, B, C'). Cite source ids.",
        user: `Claim: ${c.claim}\n\nSources:\n${sources
          .map((s) => `[${s.id}] ${s.title} (${s.url}, via ${s.engine})\n${s.snippet}`)
          .join("\n\n")}`,
        schema: judgeSchema,
      });
      const ids = new Set(judged.source_ids);
      return {
        id: newId("chk"),
        claim: c.claim,
        verdict: judged.verdict,
        note: judged.note,
        sources: sources.filter((s) => ids.has(s.id)),
        trail_id: trail.id,
      } satisfies ClaimCheck;
    }),
  );
}
