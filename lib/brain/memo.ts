// OWNER: Rishith. Company name -> sourced memo (AGENTS.md §8).
import type { Line, Memo, Source } from "../types";
import { extract, searchAll } from "../search";
import { newId, newTrail, store } from "../store";
import { askJSON } from "./claude";

const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["queries"],
  properties: { queries: { type: "array", items: { type: "string" } } },
};

const lineSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "source_ids"],
  properties: { text: { type: "string" }, source_ids: { type: "array", items: { type: "string" } } },
};

const memoSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "confidence", "summary", "facts", "risks", "open_questions"],
  properties: {
    verdict: { type: "string", enum: ["pursue", "pass", "dig_deeper"] },
    confidence: { type: "number" },
    summary: { type: "string" },
    facts: { type: "array", items: lineSchema },
    risks: { type: "array", items: lineSchema },
    open_questions: { type: "array", items: { type: "string" } },
  },
};

export async function buildMemo(company: string, context?: string): Promise<Memo> {
  const trail = newTrail();

  const plan = await askJSON<{ queries: string[] }>({
    label: "Plan the research",
    trail,
    effort: "low",
    system:
      "You plan web research for investor and vendor diligence. Return 6 to 10 short search queries. " +
      "Cover: what the company does and its traction, funding and investors, direct competitors including stealth and overseas ones, " +
      "hiring signals (LinkedIn), customer sentiment (Reddit, TikTok, reviews), lawsuits, layoffs or security incidents, and news from the last 6 months.",
    user: `Subject: ${company}${context ? `\nContext: ${context}` : ""}`,
    schema: planSchema,
  });

  const sources = await searchAll(plan.queries.slice(0, 10), trail, { platforms: true });
  if (sources.length === 0) throw new Error(`No sources found for "${company}".`);

  let pages: { url: string; text: string }[] = [];
  try {
    pages = await extract(sources.slice(0, 5).map((s) => s.url), trail);
  } catch {
    // Extract is optional; the memo falls back to search snippets.
  }

  const sourceBlock = sources
    .map((s) => {
      const page = pages.find((p) => p.url === s.url);
      const body = page ? page.text.slice(0, 4000) : s.snippet;
      return `[${s.id}] ${s.title} (${s.url}, via ${s.engine}${s.published ? `, ${s.published}` : ""})\n${body}`;
    })
    .join("\n\n");

  const draft = await askJSON<Omit<Memo, "id" | "company" | "sources" | "trail_id" | "created_at">>({
    label: "Write the memo",
    trail,
    system:
      "You write one-page diligence memos for investors and buyers. Use ONLY the sources given. " +
      "Every fact and every risk must cite the ids of the sources that support it in source_ids. " +
      "If you cannot cite a source for a line, leave the line out. Do not guess numbers. " +
      "verdict: pursue (strong, low risk), dig_deeper (promising but open questions), pass (serious risks). " +
      "confidence 0 to 1. summary 2 to 3 sentences. 4 to 8 facts, 2 to 6 risks, 2 to 5 open questions an investor should ask.",
    user: `Subject: ${company}${context ? `\nContext: ${context}` : ""}\n\nSources:\n${sourceBlock}`,
    schema: memoSchema,
  });

  // Hard rule: drop any line whose citations don't exist.
  const ids = new Set(sources.map((s) => s.id));
  const keep = (lines: Line[]) =>
    lines
      .map((l) => ({ ...l, source_ids: l.source_ids.filter((id) => ids.has(id)) }))
      .filter((l) => l.source_ids.length > 0);
  const used = new Set<string>();
  const facts = keep(draft.facts);
  const risks = keep(draft.risks);
  [...facts, ...risks].forEach((l) => l.source_ids.forEach((id) => used.add(id)));

  const memo: Memo = {
    id: newId("memo"),
    company,
    verdict: draft.verdict,
    confidence: Math.max(0, Math.min(1, draft.confidence)),
    summary: draft.summary,
    facts,
    risks,
    open_questions: draft.open_questions,
    sources: sources.filter((s: Source) => used.has(s.id)),
    trail_id: trail.id,
    created_at: new Date().toISOString(),
  };
  store.memos.set(memo.id, memo);
  return memo;
}
