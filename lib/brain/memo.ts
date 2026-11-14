// OWNER: Rishith. Company name -> sourced memo (AGENTS.md §8).
import type { Line, Memo, Source, TrailRecorder } from "../types";
import { extract, normalizeUrl, searchAll } from "../search";
import { rankSources, recordMemo } from "../learn";
import { newId, newTrail, saveMemo } from "../store";
import { askJSON } from "./claude";
import { verifyLines } from "./verify";

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

export type Depth = "quick" | "deep";

// Verify pass: pages read while the memo is written (so it costs no time), and cited pages read after, at most.
const MORE_PAGES = 16;
const CITED_PAGES = 10;
// Resolve with `fallback` if `p` takes longer than `ms` (extract can take up to 40 s when a site hangs).
const within = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms).unref?.())]);

// Pass a trail to watch progress (newTrail(onStep)); otherwise a new one is made.
export async function buildMemo(
  company: string,
  context?: string,
  depth: Depth = "deep",
  trail: TrailRecorder = newTrail(),
): Promise<Memo> {
  const deep = depth === "deep";

  const plan = await askJSON<{ queries: string[] }>({
    label: "Plan the research",
    trail,
    effort: "low",
    system:
      `You plan web research for investor and vendor diligence. Return ${deep ? "10 to 14" : "6 to 8"} short search queries. ` +
      "Cover: what the company does and its traction, funding and investors, direct competitors including stealth and overseas ones, " +
      "hiring signals (LinkedIn), customer sentiment (Reddit, TikTok, reviews), lawsuits, layoffs or security incidents, and news from the last 6 months." +
      (deep ? " Also cover: founders and team background, pricing and business model, market size, key customers or partners, and regulatory risk." : ""),
    user: `Subject: ${company}${context ? `\nContext: ${context}` : ""}`,
    schema: planSchema,
  });

  let sources = await searchAll(plan.queries.slice(0, deep ? 14 : 8), trail, { platforms: true });
  if (sources.length === 0) throw new Error(`No sources found for "${company}".`);

  if (deep) {
    // Round 2: look at what we found, search again for the gaps.
    const gaps = await askJSON<{ queries: string[] }>({
      label: "Find the gaps and follow up",
      trail,
      effort: "low",
      system:
        "You review first-round diligence search results. Name what an investor still can't answer " +
        "(e.g. no revenue signal, no competitor named, unclear funding, claims only from the company itself) " +
        "and return 4 to 6 new search queries that would fill those gaps. Prefer independent sources over the company's own site.",
      user: `Subject: ${company}\n\nFound so far:\n${sources.map((s) => `- ${s.title} (${s.url})`).join("\n")}`,
      schema: planSchema,
    });
    const more = await searchAll(gaps.queries.slice(0, 6), trail, { platforms: true }).catch(() => [] as Source[]);
    const seen = new Set(sources.map((s) => s.url));
    const added = more.filter((s) => !seen.has(s.url));
    sources = [...sources, ...added].slice(0, 30).map((s, i) => ({ ...s, id: `s${i + 1}` }));
  }

  sources = rankSources(sources, trail);

  let pages: { url: string; text: string }[] = [];
  const firstUrls = sources.slice(0, deep ? 8 : 4).map((s) => s.url);
  try {
    pages = await extract(firstUrls, trail);
  } catch {
    // Extract is optional; the memo falls back to search snippets.
  }
  // For the verify pass: read more pages now, while Claude writes the memo.
  const moreUrls = sources.map((s) => s.url).filter((u) => !firstUrls.includes(u)).slice(0, MORE_PAGES);
  const morePages = moreUrls.length ? extract(moreUrls, trail).catch(() => [] as typeof pages) : Promise.resolve([]);

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
      `confidence 0 to 1. summary 2 to 3 sentences. ${deep ? "6 to 12 facts, 3 to 8 risks, 3 to 6" : "4 to 8 facts, 2 to 6 risks, 2 to 5"} open questions an investor should ask. ` +
      "Name competitors explicitly when sources show them. Prefer independent sources over the company's own claims and say so when a fact is only self-reported.",
    user: `Subject: ${company}${context ? `\nContext: ${context}` : ""}\n\nSources:\n${sourceBlock}`,
    schema: memoSchema,
  });

  // Hard rule: drop any line whose citations don't exist.
  const ids = new Set(sources.map((s) => s.id));
  const keep = (lines: Line[]) =>
    lines
      .map((l) => ({ ...l, source_ids: l.source_ids.filter((id) => ids.has(id)) }))
      .filter((l) => l.source_ids.length > 0);
  let facts = keep(draft.facts);
  let risks = keep(draft.risks);

  // Verify every line against the text of the sources it cites; a line with no quote found in them is dropped.
  // If the verify pass fails, the memo is kept as written, with no `verification` (the trail step says why).
  let verification: Memo["verification"];
  const tried = new Set([...firstUrls, ...moreUrls]);
  const cited = new Set([...facts, ...risks].flatMap((l) => l.source_ids));
  const citedUrls = sources.filter((s) => cited.has(s.id) && !tried.has(s.url)).map((s) => s.url).slice(0, CITED_PAGES);
  const [more, citedPages] = await Promise.all([
    within(morePages, 8000, []),
    citedUrls.length ? within(extract(citedUrls, trail).catch(() => []), 10000, []) : [],
  ]);
  const known = new Set(pages.map((p) => normalizeUrl(p.url)));
  for (const p of [...more, ...citedPages]) if (!known.has(normalizeUrl(p.url))) pages.push(p);
  try {
    const v = await verifyLines([...facts, ...risks], sources, pages, trail);
    const ok = (l: Line) => (l.evidence?.length ?? 0) > 0;
    facts = v.lines.slice(0, facts.length).filter(ok);
    risks = v.lines.slice(v.lines.length - risks.length).filter(ok);
    verification = { checked: v.checked, kept: v.kept, dropped: v.dropped, ms: v.ms };
  } catch {
    // Recorded in the trail by verifyLines.
  }

  const used = new Set<string>();
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
    ...(verification ? { verification } : {}),
  };
  recordMemo(memo, sources, trail);
  saveMemo(memo);
  return memo;
}
