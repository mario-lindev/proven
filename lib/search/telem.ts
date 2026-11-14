// Telem REST: search (batch), fetch, monitors. Docs: https://hack.telem.ai/doc
import type { Engine, WatchUpdate } from "../types";
import { clip, errorText, getJSON, needKey, normalizeUrl, postJSON, type Hit } from "./http";

// Hackathon keys work on hack.telem.ai (https://hack.telem.ai/doc). Override with TELEM_BASE_URL.
const BASE = `${(process.env.TELEM_BASE_URL ?? "https://hack.telem.ai/api").replace(/\/+$/, "")}/v1`;

export type TelemResult = {
  rank?: number;            // per provider, 1-based, in that provider's own order (not a cross-provider score)
  url?: string;
  title?: string | null;
  summary?: string | null;
  publish_date?: string | null; // present when requested (fields / extended tier / a date filter); "" or null when unknown
};

export type TelemRun = {
  preprocessor_name?: string;
  status?: string;
  batch_index?: number;
  query?: string;
  latency_ms?: number;
  error?: unknown;
  output_payload?: { results?: TelemResult[]; warnings?: { code?: string; message?: string }[] } | null;
};

export type TelemSearchResponse = {
  session_id?: string;
  interaction_id?: string;
  status?: string; // succeeded | partially_succeeded | failed
  // With auto_routing: one entry per query, in batch order; providers best first. Without it: null.
  routing?: ({ providers?: string[] | null; topic?: string | null; score?: number | null } | null)[] | null;
  pinned_providers?: string[] | null;
  preprocessor_runs?: TelemRun[];
  created_at?: string;
  completed_at?: string;
};

export type TelemFetchedResult = {
  url?: string;
  status?: string;
  error?: unknown;
  provider?: string;
  title?: string;
  canonical_url?: string;
  content?: string | null;
};

export type TelemFetchResponse = {
  session_id?: string;
  preprocessor_runs?: {
    batch_index?: number;
    preprocessor_name?: string;
    status?: string;
    output_payload?: { fetched_results?: TelemFetchedResult[] } | null;
  }[];
};

export type TelemMonitor = { id?: string; session_id?: string; status?: string };

// ---------- pure mapping (exported for scripts/check-parse.ts) ----------

const publishedOf = (r: TelemResult) => r.publish_date || undefined;

export function telemResultToHit(r: TelemResult, engine: string): Hit | null {
  if (!r.url) return null;
  const published = publishedOf(r);
  return {
    url: r.url,
    title: clip(r.title, 300) || r.url,
    engine,
    snippet: clip(r.summary, 500),
    ...(published ? { published } : {}),
  };
}

// Warning codes worth showing in the trail. capability_gap (a provider can't supply a field) is expected noise.
function warningCodes(run: TelemRun): string[] {
  const codes = (run.output_payload?.warnings ?? []).map((w) => w?.code).filter((c): c is string => !!c && c !== "capability_gap");
  return [...new Set(codes)];
}

export type TelemQuery = { engines: Engine[]; hits: Hit[]; routing?: string[]; topic?: string };

// Split one batch search response into per-query engines, routing and hits.
// Per query, a URL several providers found becomes one hit, ordered the way Telem's docs merge results:
// pages more providers found first, then the best per-provider rank, then the router's provider order
// (routing lists providers best first). The hit is credited to the best-routed provider that found it.
export function parseTelemSearch(resp: TelemSearchResponse, nQueries: number): { session_id?: string; perQuery: TelemQuery[] } {
  type Agg = { hit: Hit; providers: Set<string>; bestRank: number; bestRoute: number; first: number };
  const routingOf = (i: number) => {
    const p = resp.routing?.[i]?.providers;
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string" && x.length > 0) : undefined;
  };
  const topicOf = (i: number) => {
    const t = resp.routing?.[i]?.topic;
    return typeof t === "string" && t ? t : undefined;
  };
  const perQuery = Array.from({ length: nQueries }, (_, i) => ({ engines: [] as Engine[], aggs: new Map<string, Agg>(), routing: routingOf(i), topic: topicOf(i) }));
  let order = 0;
  for (const run of resp.preprocessor_runs ?? []) {
    const i = run.batch_index ?? 0;
    if (i < 0 || i >= nQueries) continue;
    const q = perQuery[i];
    const name = run.preprocessor_name || "telem";
    const results = run.output_payload?.results ?? [];
    const err = run.error ? errorText(run.error) : "";
    const warnings = warningCodes(run);
    q.engines.push({
      name,
      latency_ms: Math.round(run.latency_ms ?? 0),
      n_results: results.length,
      ...(err ? { error: err } : {}),
      ...(warnings.length ? { warnings } : {}),
    });
    const route = q.routing?.indexOf(name) ?? -1;
    const routePos = route < 0 ? Number.MAX_SAFE_INTEGER : route;
    results.forEach((r, j) => {
      const h = telemResultToHit(r, name);
      if (!h) return;
      const key = normalizeUrl(h.url);
      const rank = r.rank ?? j + 1;
      const a = q.aggs.get(key);
      if (!a) {
        q.aggs.set(key, { hit: h, providers: new Set([name]), bestRank: rank, bestRoute: routePos, first: order++ });
        return;
      }
      a.providers.add(name);
      a.bestRank = Math.min(a.bestRank, rank);
      if (!a.hit.published && h.published) a.hit = { ...a.hit, published: h.published };
      if (!a.hit.snippet && h.snippet) a.hit = { ...a.hit, snippet: h.snippet };
      if (routePos < a.bestRoute) {
        a.bestRoute = routePos;
        a.hit = { ...a.hit, engine: name };
      }
    });
  }
  return {
    session_id: resp.session_id,
    perQuery: perQuery.map((q) => ({
      engines: q.engines,
      hits: [...q.aggs.values()]
        .sort((a, b) => b.providers.size - a.providers.size || a.bestRank - b.bestRank || a.bestRoute - b.bestRoute || a.first - b.first)
        .map((a) => a.hit),
      ...(q.routing && q.routing.length ? { routing: q.routing } : {}),
      ...(q.topic ? { topic: q.topic } : {}),
    })),
  };
}

export function parseTelemFetch(resp: TelemFetchResponse): { ok: { url: string; text: string }[]; failed: { url: string; error: string }[] } {
  const ok: { url: string; text: string }[] = [];
  const failed: { url: string; error: string }[] = [];
  for (const run of resp.preprocessor_runs ?? []) {
    for (const f of run.output_payload?.fetched_results ?? []) {
      if (!f.url) continue;
      if (!f.error && f.content && f.content.trim()) ok.push({ url: f.url, text: f.content });
      else failed.push({ url: f.url, error: f.error ? errorText(f.error) : `no content (status ${f.status ?? "unknown"})` });
    }
  }
  return { ok, failed };
}

export function parseTelemPoll(resp: TelemSearchResponse): WatchUpdate[] {
  const at = resp.completed_at ?? resp.created_at ?? new Date().toISOString();
  const seen = new Set<string>();
  const out: WatchUpdate[] = [];
  for (const run of resp.preprocessor_runs ?? []) {
    for (const r of run.output_payload?.results ?? []) {
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      out.push({ at: publishedOf(r) || at, title: clip(r.title, 300) || r.url, url: r.url, summary: clip(r.summary, 500) });
    }
  }
  return out;
}

// ---------- HTTP ----------

// Fields mode instead of a tier: the default tier's fields plus publish_date, at the base price
// (only excerpt / full_content engage paid options). Docs: search-parameters#tier.
export const SEARCH_FIELDS = ["url", "title", "rank", "summary", "publish_date"];

export type TelemSearchOptions = {
  providers?: string[];     // search.providers.include: replaces the default set; auto-routing chooses within it
  published_after?: string; // ISO date: keep results published on or after it (undated results are kept)
  session_id?: string;      // add the call to an earlier Telem session (one memo = one session in the console)
};

export function telemSearchBody(queries: string[], o: TelemSearchOptions = {}) {
  return {
    user_input: queries.map((q) => ({ query: q })),
    search: {
      auto_routing: "accuracy", // the only routing mode; any other value is a 422
      num_results: 5,
      fields: SEARCH_FIELDS,
      ...(o.providers?.length ? { providers: { include: o.providers } } : {}),
      ...(o.published_after ? { published_after: o.published_after } : {}),
    },
    ...(o.session_id ? { session_id: o.session_id } : {}),
  };
}

// The plain body from the docs' own examples, kept as a fallback.
export function telemBasicSearchBody(queries: string[], providers?: string[]) {
  return {
    user_input: queries.map((q) => ({ query: q })),
    search: { auto_routing: "accuracy", num_results: 5, tier: "default", ...(providers?.length ? { providers: { include: providers } } : {}) },
  };
}

// A 400/422 means the body was refused before anything ran (nothing billed). If one of the richer options is
// the cause, retry once with the plain body so the demo still gets results; `fallback` says why.
export async function telemSearch(queries: string[], o: TelemSearchOptions = {}): Promise<TelemSearchResponse & { fallback?: string }> {
  const key = needKey("TELEM_API_KEY");
  try {
    return await postJSON<TelemSearchResponse>("Telem search", `${BASE}/search`, key, telemSearchBody(queries, o));
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status !== 400 && status !== 422) throw err;
    const resp = await postJSON<TelemSearchResponse>("Telem search", `${BASE}/search`, key, telemBasicSearchBody(queries, o.providers));
    return { ...resp, fallback: (err as Error).message };
  }
}

// /v1/fetch takes at most 5 URLs per call, so larger lists are split into parallel calls.
export async function telemFetch(
  urls: string[],
  session_id?: string,
): Promise<{ ok: { url: string; text: string }[]; failed: { url: string; error: string }[]; session_id?: string }> {
  const key = needKey("TELEM_API_KEY");
  const chunks: string[][] = [];
  for (let i = 0; i < urls.length; i += 5) chunks.push(urls.slice(i, i + 5));
  const settled = await Promise.allSettled(
    chunks.map((c) =>
      postJSON<TelemFetchResponse>("Telem fetch", `${BASE}/fetch`, key, {
        urls: c,
        options: { tier: "default", content_format: "text" },
        ...(session_id ? { session_id } : {}),
      }),
    ),
  );
  const ok: { url: string; text: string }[] = [];
  const failed: { url: string; error: string }[] = [];
  let sid: string | undefined;
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") {
      sid ??= s.value.session_id;
      const p = parseTelemFetch(s.value);
      ok.push(...p.ok);
      failed.push(...p.failed);
      const seen = new Set([...p.ok, ...p.failed].map((x) => x.url));
      for (const u of chunks[i]) if (!seen.has(u)) failed.push({ url: u, error: "Telem fetch returned no row for this URL" });
    } else {
      for (const u of chunks[i]) failed.push({ url: u, error: (s.reason as Error).message });
    }
  });
  return { ok, failed, ...(sid ? { session_id: sid } : {}) };
}

export async function telemCreateMonitor(query: string): Promise<TelemMonitor> {
  const key = needKey("TELEM_API_KEY");
  return postJSON<TelemMonitor>("Telem create monitor", `${BASE}/monitors`, key, {
    query,
    options: { frequency: "1h" },
    ttl: "30d",
  });
}

export async function telemPollMonitor(monitorId: string): Promise<TelemSearchResponse> {
  const key = needKey("TELEM_API_KEY");
  return postJSON<TelemSearchResponse>("Telem poll monitor", `${BASE}/monitors/${encodeURIComponent(monitorId)}/poll`, key, {});
}

// ---------- monitor agent (docs: Monitors; /poll is the legacy read) ----------

export type TelemChange = {
  seq?: number;
  kind?: string; // entity_added, value_changed, fact_status_changed, alert, run, plan_changed
  subject?: { entity_id?: string; name?: string } | null;
  before?: unknown;
  after?: unknown; // carries the quote and url
  at?: string;
};
export type TelemChangesPage = { changes?: TelemChange[]; items?: TelemChange[]; next_cursor?: number | null; watermark?: number };

const KIND_LABEL: Record<string, string> = {
  entity_added: "New",
  value_changed: "Changed",
  fact_status_changed: "Status changed",
  alert: "Alert",
};

function pick(o: unknown, keys: string[]): string {
  if (!o || typeof o !== "object") return "";
  for (const k of keys) {
    const v = (o as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

// Agent changes -> WatchUpdates. Skips bookkeeping kinds (run, plan_changed) and changes with no source url.
export function parseTelemChanges(page: TelemChangesPage): { updates: WatchUpdate[]; next_cursor?: number } {
  const updates: WatchUpdate[] = [];
  for (const c of page.changes ?? page.items ?? []) {
    if (!c.kind || c.kind === "run" || c.kind === "plan_changed") continue;
    const url = pick(c.after, ["url", "source_url"]) || pick(c.before, ["url", "source_url"]);
    if (!url) continue;
    const name = c.subject?.name?.trim();
    const value = typeof c.after === "string" ? c.after : pick(c.after, ["value", "name", "title", "text"]);
    const quote = pick(c.after, ["quote", "evidence", "summary", "snippet"]);
    updates.push({
      at: c.at ?? new Date().toISOString(),
      title: clip([KIND_LABEL[c.kind] ?? c.kind, name || value].filter(Boolean).join(": "), 300),
      url,
      summary: clip(quote || value, 500),
    });
  }
  const next = page.next_cursor ?? page.watermark;
  return { updates, ...(typeof next === "number" ? { next_cursor: next } : {}) };
}

// Run the monitor's agent now, outside its schedule (202). 409 tick_in_progress means one is already running.
export async function telemTickMonitor(monitorId: string): Promise<{ job_id?: string; already_running?: boolean }> {
  const key = needKey("TELEM_API_KEY");
  try {
    return await postJSON<{ job_id?: string }>("Telem run monitor", `${BASE}/monitors/${encodeURIComponent(monitorId)}/agent/ticks`, key, {});
  } catch (err) {
    if ((err as { status?: number }).status === 409 && /tick_in_progress/.test((err as Error).message)) return { already_running: true };
    throw err;
  }
}

export async function telemMonitorChanges(monitorId: string, cursor?: number): Promise<TelemChangesPage> {
  const key = needKey("TELEM_API_KEY");
  const q = typeof cursor === "number" ? `?cursor=${cursor}` : "";
  return getJSON<TelemChangesPage>("Telem monitor changes", `${BASE}/monitors/${encodeURIComponent(monitorId)}/agent/changes${q}`, key);
}
