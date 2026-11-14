// OWNER: Aarav. Telem + Tavily search layer (AGENTS.md §7).
// Keep the signatures exactly as they are; the brain calls them.
import type { Engine, Source, TrailRecorder, WatchUpdate } from "../types";
import { normalizeUrl, type Hit } from "./http";
import { parseTelemChanges, telemMonitorChanges, telemTickMonitor, parseTelemPoll, parseTelemSearch, telemCreateMonitor, telemFetch, telemPollMonitor, telemSearch, type TelemQuery, type TelemSearchOptions } from "./telem";
import { parseTavilyExtract, parseTavilySearch, tavilyExtract, tavilySearch } from "./tavily";

export { normalizeUrl };

const MAX_SOURCES = 20;
const MAX_PAGE_CHARS = 8000;

function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

// Per-query hit lists -> Sources. Round-robin across queries so every query is represented,
// first URL wins on duplicates, ids s1..sN, at most `cap`.
export function mergeHits(perQuery: Hit[][], cap = MAX_SOURCES): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const h of interleave(perQuery)) {
    const key = normalizeUrl(h.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `s${out.length + 1}`, ...h });
    if (out.length >= cap) break;
  }
  return out;
}

// Platform search providers (docs: hack.telem.ai/doc/resources/supported-platforms). They are pinnable only:
// auto-routing and the default set never choose them, so they run only when named in providers.include.
// With auto_routing on, Telem's router still picks the best of these for each query.
export const PLATFORM_PROVIDERS = [
  "apify_linkedin",
  "socialdatax_x",
  "fetchlayer_tiktok",
  "socialdatax_youtube",
  "fetchlayer_trustpilot",
  "fetchlayer_producthunt",
  "apify_quora",
  "socialdatax_wechat",
];
const MAX_PLATFORM_QUERIES = 4;
export const wantsPlatforms = (q: string) =>
  /\b(hiring|hires?|jobs?|employees?|headcount|linkedin|talent|layoffs?|reviews?|customers?|sentiment|complain\w*|users?|reddit|tiktok|twitter|youtube|social|community|wechat|china|chinese|overseas)\b/i.test(q);

// Recency: news-style queries get Telem's published_after filter (undated results are still kept).
export const RECENT_DAYS = 365;
export const wantsRecent = (q: string) => /\b(news|latest|recent(ly)?|this (week|month|year)|past (week|month|year)|last (week|month))\b/i.test(q);
export const recentSince = (now = new Date()) => new Date(now.getTime() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);

// One Telem session per trail, so a whole memo (both search rounds and the fetches) is one trajectory in the console.
const g = globalThis as unknown as { __provenTelemSessions?: Map<string, string> };
const telemSessions = (g.__provenTelemSessions ??= new Map<string, string>());

// Opt-in diligence providers (TELEM_DILIGENCE=1). These names are in hack.telem.ai's live GET /v1/preprocessors
// roster but not in the docs, and each is billed, so they are off by default. Each set gets its own batch,
// pinned to those providers; failures land in the trail like the platform batch.
export const DILIGENCE = [
  {
    name: "financials",
    providers: ["sec_edgar", "coresignal_company"],
    wants: (q: string) => /\b(funding|fund(ed|raise\w*)|raised?|series [a-z]|valuation|revenue|financials?|filings?|sec|10-k|10-q|s-1|8-k|ipo|investors?|acquisitions?|acquired|profit\w*|earnings|headcount|employees)\b/i.test(q),
  },
  {
    name: "reddit",
    providers: ["fetchlayer_reddit"],
    wants: (q: string) => /\b(reviews?|customers?|sentiment|complain\w*|users?|reddit|community|opinions?|feedback|churn)\b/i.test(q),
  },
  {
    name: "patents",
    providers: ["patsnap", "uspto_applications"],
    wants: (q: string) => /\b(patents?|intellectual property|ip|inventions?|technology|moat|r&d)\b/i.test(q),
  },
] as const;
const MAX_DILIGENCE_QUERIES = 3;
export const diligenceOn = () => process.env.TELEM_DILIGENCE === "1";

type Group = { name: string; idx: number[]; opts: TelemSearchOptions };
const GENERAL = new Set(["main", "recent"]);

export async function searchAll(
  queries: string[],
  trail: TrailRecorder,
  opts?: { platforms?: boolean },
): Promise<Source[]> {
  const qs = queries.map((q) => q.trim()).filter(Boolean);
  if (qs.length === 0) return [];
  const session_id = telemSessions.get(trail.id);

  // Telem search options apply to a whole batch, so queries are split into at most three batch calls:
  // general (auto-routed), recent (auto-routed + published_after) and platforms (auto-routed within the pinned
  // platform providers, only with opts.platforms), plus one per diligence set with TELEM_DILIGENCE=1.
  // Each query is in exactly one of main/recent.
  const all = qs.map((_, i) => i);
  const recentIdx = all.filter((i) => wantsRecent(qs[i]));
  const mainIdx = all.filter((i) => !wantsRecent(qs[i]));
  const platformIdx = opts?.platforms ? all.filter((i) => wantsPlatforms(qs[i])).slice(0, MAX_PLATFORM_QUERIES) : [];
  const since = recentSince();
  const groups: Group[] = [
    { name: "main", idx: mainIdx, opts: { session_id } },
    { name: "recent", idx: recentIdx, opts: { session_id, published_after: since } },
    { name: "platforms", idx: platformIdx, opts: { session_id, providers: PLATFORM_PROVIDERS } },
    ...(diligenceOn()
      ? DILIGENCE.map((d) => ({
          name: d.name,
          idx: all.filter((i) => d.wants(qs[i])).slice(0, MAX_DILIGENCE_QUERIES),
          opts: { session_id, providers: [...d.providers] },
        }))
      : []),
  ].filter((gr) => gr.idx.length > 0);

  const t0 = Date.now();
  const timed = async <T>(p: () => Promise<T>) => {
    const s = Date.now();
    try {
      return { value: await p(), ms: Date.now() - s };
    } catch (err) {
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { ms: Date.now() - s });
    }
  };
  // All Telem batches and Tavily (one call per query) run concurrently.
  const [telemS, tavilyS] = await Promise.all([
    Promise.allSettled(groups.map((gr) => timed(() => telemSearch(gr.idx.map((i) => qs[i]), gr.opts)))),
    Promise.allSettled(qs.map((q) => timed(() => tavilySearch(q)))),
  ]);

  const msOf = (s: PromiseSettledResult<{ ms: number }>) =>
    s.status === "fulfilled" ? s.value.ms : ((s.reason as { ms?: number })?.ms ?? Date.now() - t0);
  const errOf = (s: PromiseSettledResult<unknown>) => (s.status === "rejected" ? (s.reason as Error).message : "");

  // Per group: parsed per-query results (indexed like gr.idx), the session it ran in, and its error.
  const parsed = groups.map((gr, k) => {
    const s = telemS[k];
    if (s.status !== "fulfilled") return { gr, ms: msOf(s), err: errOf(s), perQuery: null as TelemQuery[] | null };
    const p = parseTelemSearch(s.value.value, gr.idx.length);
    return { gr, ms: s.value.ms, err: "", perQuery: p.perQuery, session_id: p.session_id, fallback: s.value.value.fallback };
  });
  const firstSession = parsed.find((p) => p.session_id)?.session_id;
  if (!session_id && firstSession) telemSessions.set(trail.id, firstSession);

  const tavilyErrs = tavilyS.map(errOf);
  const generalFailed = parsed.filter((p) => GENERAL.has(p.gr.name)).every((p) => !p.perQuery);
  if (generalFailed && tavilyErrs.every(Boolean)) {
    const telemErrs = [...new Set(parsed.filter((p) => GENERAL.has(p.gr.name)).map((p) => p.err))].join("; ");
    throw new Error(`All search providers failed. Telem: ${telemErrs}. Tavily: ${[...new Set(tavilyErrs)].join("; ")}`);
  }

  const perQueryHits: Hit[][] = [];
  qs.forEach((q, i) => {
    const engines: Engine[] = [];
    const routing: string[] = [];
    const lists: Hit[][] = [];
    let ms = 0;
    let stepSession: string | undefined;
    let publishedAfter: string | undefined;
    for (const p of parsed) {
      const j = p.gr.idx.indexOf(i);
      if (j < 0) continue;
      ms = Math.max(ms, p.ms);
      const label = GENERAL.has(p.gr.name) ? "telem" : `telem_${p.gr.name}`;
      if (!p.perQuery) {
        engines.push({ name: label, latency_ms: p.ms, n_results: 0, error: p.err });
        continue;
      }
      const r = p.perQuery[j];
      engines.push(...r.engines);
      if (r.engines.length === 0) engines.push({ name: label, latency_ms: p.ms, n_results: 0, error: "no engine runs returned for this query" });
      for (const name of r.routing ?? []) if (!routing.includes(name)) routing.push(name);
      lists.push(r.hits);
      stepSession ??= p.session_id;
      if (p.gr.opts.published_after && !p.fallback) publishedAfter = p.gr.opts.published_after;
    }

    const tv = tavilyS[i];
    const tavilyHits = tv.status === "fulfilled" ? parseTavilySearch(tv.value.value) : [];
    engines.push({
      name: "tavily",
      latency_ms: msOf(tv),
      n_results: tavilyHits.length,
      ...(tavilyErrs[i] ? { error: tavilyErrs[i] } : {}),
    });
    lists.push(tavilyHits);
    ms = Math.max(ms, msOf(tv));

    // Telem's ordered list first, then platform / diligence hits, then Tavily, round-robin so each is represented.
    const hits = interleave(lists);
    perQueryHits.push(hits);
    trail.step({
      kind: "search",
      label: `Search: ${q}`,
      query: q,
      engines,
      ...(routing.length ? { routing } : {}),
      ...(publishedAfter ? { published_after: publishedAfter } : {}),
      urls: [...new Map(hits.map((h) => [normalizeUrl(h.url), h.url])).values()],
      ...(stepSession ? { telem_session_id: stepSession } : {}),
      ms,
    });
  });

  const sources = mergeHits(perQueryHits);
  if (sources.length === 0) {
    const errs = [...parsed.map((p) => p.err), ...tavilyErrs].filter(Boolean);
    if (errs.length) throw new Error(`Search returned no results. Errors: ${[...new Set(errs)].join("; ")}`);
  }
  return sources;
}

export async function extract(urls: string[], trail: TrailRecorder): Promise<{ url: string; text: string }[]> {
  const list = [...new Set(urls.filter(Boolean))];
  if (list.length === 0) return [];
  const t0 = Date.now();
  const got = new Map<string, string>();
  const errors = new Map<string, string>();
  const engines: Engine[] = [];

  // 1. Tavily extract
  const s1 = Date.now();
  try {
    const p = parseTavilyExtract(await tavilyExtract(list));
    for (const r of p.ok) got.set(r.url, r.text);
    for (const f of p.failed) errors.set(f.url, `tavily: ${f.error}`);
    engines.push({ name: "tavily", latency_ms: Date.now() - s1, n_results: p.ok.length, ...(p.failed.length ? { error: `${p.failed.length} URL(s) failed` } : {}) });
  } catch (err) {
    engines.push({ name: "tavily", latency_ms: Date.now() - s1, n_results: 0, error: (err as Error).message });
    for (const u of list) errors.set(u, `tavily: ${(err as Error).message}`);
  }

  // Tavily may echo a URL in a slightly different form; match by normalized URL.
  const gotNorm = new Map([...got].map(([u, t]) => [normalizeUrl(u), t]));
  const missing = list.filter((u) => !gotNorm.has(normalizeUrl(u)));

  // 2. Telem fetch for whatever Tavily missed
  let fetchSession: string | undefined;
  if (missing.length) {
    const s2 = Date.now();
    try {
      const p = await telemFetch(missing, telemSessions.get(trail.id));
      if (p.session_id) {
        fetchSession = p.session_id;
        if (!telemSessions.has(trail.id)) telemSessions.set(trail.id, p.session_id);
      }
      for (const r of p.ok) gotNorm.set(normalizeUrl(r.url), r.text);
      for (const f of p.failed) errors.set(f.url, `${errors.get(f.url) ?? ""}; telem: ${f.error}`.replace(/^; /, ""));
      engines.push({ name: "telem_fetch", latency_ms: Date.now() - s2, n_results: p.ok.length, ...(p.failed.length ? { error: `${p.failed.length} URL(s) failed` } : {}) });
    } catch (err) {
      engines.push({ name: "telem_fetch", latency_ms: Date.now() - s2, n_results: 0, error: (err as Error).message });
    }
  }

  const out = list
    .filter((u) => gotNorm.has(normalizeUrl(u)))
    .map((u) => ({ url: u, text: gotNorm.get(normalizeUrl(u))!.slice(0, MAX_PAGE_CHARS) }));

  trail.step({
    kind: "extract",
    label: `Extract ${out.length} of ${list.length} pages`,
    engines,
    urls: out.map((o) => o.url),
    ...(fetchSession ? { telem_session_id: fetchSession } : {}),
    ms: Date.now() - t0,
  });

  if (out.length === 0) {
    throw new Error(`Extract failed for every URL. ${[...errors].map(([u, e]) => `${u}: ${e}`).join(" | ")}`);
  }
  return out;
}

export async function watch(company: string): Promise<{ monitor_id: string }> {
  const m = await telemCreateMonitor(`News, funding, layoffs, lawsuits or new competitors for ${company}`);
  if (!m.id) throw new Error("Telem create monitor returned no id.");
  return { monitor_id: m.id };
}

export async function pollWatch(monitor_id: string): Promise<WatchUpdate[]> {
  return parseTelemPoll(await telemPollMonitor(monitor_id));
}

// Run the watch's Telem agent now instead of waiting for its hourly schedule.
export async function runWatch(monitor_id: string): Promise<{ already_running: boolean }> {
  const r = await telemTickMonitor(monitor_id);
  return { already_running: !!r.already_running };
}

// What the monitor's agent found since `cursor` (each with a quote and source url).
export async function watchChanges(monitor_id: string, cursor?: number): Promise<{ updates: WatchUpdate[]; cursor?: number }> {
  const p = parseTelemChanges(await telemMonitorChanges(monitor_id, cursor));
  return { updates: p.updates, cursor: p.next_cursor ?? cursor };
}
