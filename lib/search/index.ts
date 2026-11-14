// OWNER: Aarav. Telem + Tavily search layer (AGENTS.md §7).
// Keep the signatures exactly as they are; the brain calls them.
import type { Engine, Source, TrailRecorder, WatchUpdate } from "../types";
import type { Hit } from "./http";
import { parseTelemPoll, parseTelemSearch, telemCreateMonitor, telemFetch, telemPollMonitor, telemSearch } from "./telem";
import { parseTavilyExtract, parseTavilySearch, tavilyExtract, tavilySearch } from "./tavily";

const MAX_SOURCES = 20;
const MAX_PAGE_CHARS = 8000;

// Same page, different spelling: lower-case host, no www., no #hash, no utm_* params, no trailing slash.
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^(ref|fbclid|gclid)$/i.test(k)) u.searchParams.delete(k);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch {
    return raw.trim().replace(/\/+$/, "").toLowerCase();
  }
}

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

export async function searchAll(
  queries: string[],
  trail: TrailRecorder,
  opts?: { platforms?: boolean },
): Promise<Source[]> {
  // opts.platforms: Telem auto-routing already picks platform engines (LinkedIn, TikTok...) per query.
  void opts;
  const qs = queries.map((q) => q.trim()).filter(Boolean);
  if (qs.length === 0) return [];

  const t0 = Date.now();
  const timed = async <T>(p: () => Promise<T>) => {
    const s = Date.now();
    try {
      return { value: await p(), ms: Date.now() - s };
    } catch (err) {
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { ms: Date.now() - s });
    }
  };
  // Telem (one batch call) and Tavily (one call per query) all run concurrently.
  const [[telemS], tavilyS] = await Promise.all([
    Promise.allSettled([timed(() => telemSearch(qs))]),
    Promise.allSettled(qs.map((q) => timed(() => tavilySearch(q)))),
  ]);

  const msOf = (s: PromiseSettledResult<{ ms: number }>) =>
    s.status === "fulfilled" ? s.value.ms : ((s.reason as { ms?: number })?.ms ?? Date.now() - t0);
  const errOf = (s: PromiseSettledResult<unknown>) => (s.status === "rejected" ? (s.reason as Error).message : "");

  const telem = telemS.status === "fulfilled" ? parseTelemSearch(telemS.value.value, qs.length) : null;
  const telemErr = errOf(telemS);
  const tavilyErrs = tavilyS.map(errOf);

  if (!telem && tavilyErrs.every(Boolean)) {
    throw new Error(`All search providers failed. Telem: ${telemErr}. Tavily: ${[...new Set(tavilyErrs)].join("; ")}`);
  }

  const perQueryHits: Hit[][] = [];
  qs.forEach((q, i) => {
    const engines: Engine[] = [];
    let telemHits: Hit[] = [];
    if (telem) {
      engines.push(...telem.perQuery[i].engines);
      telemHits = telem.perQuery[i].hits;
      if (telem.perQuery[i].engines.length === 0) engines.push({ name: "telem", latency_ms: msOf(telemS), n_results: 0, error: "no engine runs returned for this query" });
    } else {
      engines.push({ name: "telem", latency_ms: msOf(telemS), n_results: 0, error: telemErr });
    }

    const tv = tavilyS[i];
    const tavilyHits = tv.status === "fulfilled" ? parseTavilySearch(tv.value.value) : [];
    engines.push({
      name: "tavily",
      latency_ms: msOf(tv),
      n_results: tavilyHits.length,
      ...(tavilyErrs[i] ? { error: tavilyErrs[i] } : {}),
    });

    const hits = interleave([telemHits, tavilyHits]);
    perQueryHits.push(hits);
    trail.step({
      kind: "search",
      label: `Search: ${q}`,
      query: q,
      engines,
      urls: [...new Map(hits.map((h) => [normalizeUrl(h.url), h.url])).values()],
      ...(telem?.session_id ? { telem_session_id: telem.session_id } : {}),
      ms: Math.max(msOf(telemS), msOf(tv)),
    });
  });

  const sources = mergeHits(perQueryHits);
  if (sources.length === 0) {
    const errs = [telemErr, ...tavilyErrs].filter(Boolean);
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
  if (missing.length) {
    const s2 = Date.now();
    try {
      const p = await telemFetch(missing);
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
