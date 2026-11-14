// OWNER: Rishith. Company name -> sourced memo (AGENTS.md §8).
import type { Contradiction, Line, Memo, Round, Source, TrailRecorder } from "../types";
import { extract, normalizeUrl, searchAll } from "../search";
import { rankSources, recordMemo } from "../learn";
import { newId, newTrail, saveMemo } from "../store";
import { askJSON } from "./claude";
import { verifyLines } from "./verify";
import { isOwn, researchUntilProven } from "./loop";

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

const idList = { type: "array", items: { type: "string" } };
const contradictionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["claim", "claim_source_ids", "reality", "reality_source_ids", "severity"],
  properties: {
    claim: { type: "string" },
    claim_source_ids: idList,
    reality: { type: "string" },
    reality_source_ids: idList,
    severity: { type: "string", enum: ["high", "medium", "low"] },
  },
};

const memoSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "confidence", "summary", "facts", "risks", "open_questions", "contradictions"],
  properties: {
    verdict: { type: "string", enum: ["pursue", "pass", "dig_deeper"] },
    confidence: { type: "number" },
    summary: { type: "string" },
    facts: { type: "array", items: lineSchema },
    risks: { type: "array", items: lineSchema },
    open_questions: { type: "array", items: { type: "string" } },
    contradictions: { type: "array", items: contradictionSchema },
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

  // Deep: keep researching until the investor-critical questions are answered (or the time budget runs out).
  let rounds: Round[] | undefined;
  let ownDomains: string[] = [];
  let ownUrls = new Set<string>();
  if (deep) ({ sources, rounds, ownDomains, ownUrls } = await researchUntilProven(company, plan.queries, sources, trail));

  sources = rankSources(sources, trail).map((s) => ({
    ...s,
    own: ownUrls.has(s.url) || isOwn(s.url, company, ownDomains),
  }));

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
      return `[${s.id}] ${s.own ? "COMPANY'S OWN" : "INDEPENDENT"}: ${s.title} (${s.url}, via ${s.engine}${s.published ? `, ${s.published}` : ""})\n${body}`;
    })
    .join("\n\n");

  const draft = await askJSON<Omit<Memo, "id" | "company" | "sources" | "trail_id" | "created_at"> & { contradictions: Contradiction[] }>({
    label: "Write the memo",
    trail,
    system:
      "You write one-page diligence memos for investors and buyers. Use ONLY the sources given. " +
      "Every fact and every risk must cite the ids of the sources that support it in source_ids. " +
      "If you cannot cite a source for a line, leave the line out. Do not guess numbers. " +
      "verdict, decided by this rubric and not by caution: pursue = strong traction that independent sources back (revenue, customers, " +
      "funding from known investors, or growth) and no high-severity risk or contradiction; pass = a high-severity contradiction, or a serious " +
      "legal or financial risk (fraud, insolvency or running out of cash, a regulator's action, a lawsuit that threatens the business); " +
      "dig_deeper = everything else. Do not pick dig_deeper when the rubric gives pursue or pass. " +
      "confidence 0 to 1. summary 2 to 3 sentences; it only restates facts and risks that are in your lists (no number, name or event that is " +
      "not in a fact or risk line), and its last sentence gives the reason for the verdict. " +
      "Each fact and risk is one plain statement about the company. Never write source ids (s3, s11) inside the text of a line, the summary or a " +
      "contradiction; ids go in source_ids only. Never write notes about your own process or the sources as a set (what you compared, " +
      "disregarded, could not find or left out). Saying who reported something is fine (\"reported independently by Reuters\"). " +
      `${deep ? "6 to 12 facts, 3 to 8 risks, 3 to 6" : "4 to 8 facts, 2 to 6 risks, 2 to 5"} open questions an investor should ask. ` +
      "Name competitors explicitly when sources show them. Prefer independent sources over the company's own claims and say so when a fact is only self-reported. " +
      "contradictions (0 to 5): each source is marked COMPANY'S OWN (its site, or a press release it issued) or INDEPENDENT. " +
      "List the places where what the company says about itself conflicts with what independent sources say, or where independent sources " +
      "covering the same point do not bear it out. claim: what the company says, citing the sources where it says it (its own, or an independent " +
      "source quoting it). reality: what independent sources say, citing at least one INDEPENDENT source. " +
      "severity high (changes the investment case), medium, or low. Only list a contradiction the sources clearly show; " +
      "an empty list is the right answer when there is none. Never invent one.",
    user: `Subject: ${company}${context ? `\nContext: ${context}` : ""}\n\nSources:\n${sourceBlock}`,
    schema: memoSchema,
  });

  // Hard rule: drop any line whose citations don't exist.
  const ids = new Set(sources.map((s) => s.id));
  // Raw source ids ("s3", "(s3, s11)") don't belong in the text; ids are lowercase, so "S3" (Amazon) is left alone.
  const noIds = (t: string) =>
    t
      .replace(/\s*[[(]\s*s\d+(?:\s*(?:,|and|&)\s*s\d+)*\s*[\])]/g, "")
      .replace(/\bs\d+\b(?:\s*(?:,|and|&)\s*s\d+\b)*/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([.,;:])/g, "$1")
      .trim();
  const keep = (lines: Line[]) =>
    lines
      .map((l) => ({ ...l, text: noIds(l.text), source_ids: l.source_ids.filter((id) => ids.has(id)) }))
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

  // Same hard rule for contradictions: both sides must cite sources that exist, and the reality side an independent one.
  // A contradiction whose two sides cite exactly the same sources is dropped: one source is not arguing with itself.
  const sameSet = (a: string[], b: string[]) => new Set(a).size === new Set(b).size && a.every((id) => b.includes(id));
  const independent = new Set(sources.filter((s) => !s.own).map((s) => s.id));
  const contradictions = (draft.contradictions ?? [])
    .map((c) => ({
      ...c,
      claim: noIds(c.claim),
      reality: noIds(c.reality),
      claim_source_ids: c.claim_source_ids.filter((id) => ids.has(id)),
      reality_source_ids: c.reality_source_ids.filter((id) => ids.has(id)),
    }))
    .filter(
      (c) =>
        c.claim_source_ids.length > 0 &&
        c.reality_source_ids.some((id) => independent.has(id)) &&
        !sameSet(c.claim_source_ids, c.reality_source_ids),
    )
    .slice(0, 5);

  const used = new Set<string>();
  [...facts, ...risks].forEach((l) => l.source_ids.forEach((id) => used.add(id)));
  contradictions.forEach((c) => [...c.claim_source_ids, ...c.reality_source_ids].forEach((id) => used.add(id)));

  const memo: Memo = {
    id: newId("memo"),
    company,
    verdict: draft.verdict,
    confidence: Math.max(0, Math.min(1, draft.confidence)),
    summary: noIds(draft.summary),
    facts,
    risks,
    open_questions: draft.open_questions,
    sources: sources.filter((s: Source) => used.has(s.id)),
    trail_id: trail.id,
    created_at: new Date().toISOString(),
    ...(verification ? { verification } : {}),
    ...(rounds ? { rounds } : {}),
    contradictions,
  };
  recordMemo(memo, sources, trail);
  saveMemo(memo);
  return memo;
}
