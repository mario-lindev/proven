// Telem REST: search (batch), fetch, monitors. Docs: https://docs.telem.ai/api/
import type { Engine, WatchUpdate } from "../types";
import { clip, errorText, needKey, postJSON, type Hit } from "./http";

// Hackathon keys work on hack.telem.ai (https://hack.telem.ai/doc). Override with TELEM_BASE_URL.
const BASE = `${(process.env.TELEM_BASE_URL ?? "https://hack.telem.ai/api").replace(/\/+$/, "")}/v1`;

export type TelemResult = {
  rank?: number;
  url?: string;
  title?: string;
  summary?: string | null;
  // The docs don't name a date field; accept the common spellings.
  published_date?: string | null;
  published_at?: string | null;
  published?: string | null;
  date?: string | null;
};

export type TelemRun = {
  preprocessor_name?: string;
  status?: string;
  batch_index?: number;
  query?: string;
  latency_ms?: number;
  error?: unknown;
  output_payload?: { results?: TelemResult[]; warnings?: unknown[] } | null;
};

export type TelemSearchResponse = {
  session_id?: string;
  routing?: unknown[] | null;
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

const publishedOf = (r: TelemResult) => r.published_date ?? r.published_at ?? r.published ?? r.date ?? undefined;

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

// Split one batch search response into per-query engines + hits (hits ordered by rank, then run order).
export function parseTelemSearch(
  resp: TelemSearchResponse,
  nQueries: number,
): { session_id?: string; perQuery: { engines: Engine[]; hits: Hit[] }[] } {
  const perQuery = Array.from({ length: nQueries }, () => ({ engines: [] as Engine[], hits: [] as { hit: Hit; rank: number }[] }));
  for (const run of resp.preprocessor_runs ?? []) {
    const i = run.batch_index ?? 0;
    if (i < 0 || i >= nQueries) continue;
    const name = run.preprocessor_name || "telem";
    const results = run.output_payload?.results ?? [];
    const err = run.error ? errorText(run.error) : "";
    perQuery[i].engines.push({
      name,
      latency_ms: Math.round(run.latency_ms ?? 0),
      n_results: results.length,
      ...(err ? { error: err } : {}),
    });
    results.forEach((r, j) => {
      const h = telemResultToHit(r, name);
      if (h) perQuery[i].hits.push({ hit: h, rank: r.rank ?? j + 1 });
    });
  }
  return {
    session_id: resp.session_id,
    perQuery: perQuery.map((q) => ({
      engines: q.engines,
      // stable sort keeps run order for equal ranks
      hits: q.hits.sort((a, b) => a.rank - b.rank).map((x) => x.hit),
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
      out.push({ at: publishedOf(r) ?? at, title: clip(r.title, 300) || r.url, url: r.url, summary: clip(r.summary, 500) });
    }
  }
  return out;
}

// ---------- HTTP ----------

export async function telemSearch(queries: string[]): Promise<TelemSearchResponse> {
  const key = needKey("TELEM_API_KEY");
  return postJSON<TelemSearchResponse>("Telem search", `${BASE}/search`, key, {
    user_input: queries.map((q) => ({ query: q })),
    search: { auto_routing: "accuracy", num_results: 5, tier: "default" },
  });
}

// /v1/fetch takes at most 5 URLs per call, so larger lists are split into parallel calls.
export async function telemFetch(urls: string[]): Promise<{ ok: { url: string; text: string }[]; failed: { url: string; error: string }[] }> {
  const key = needKey("TELEM_API_KEY");
  const chunks: string[][] = [];
  for (let i = 0; i < urls.length; i += 5) chunks.push(urls.slice(i, i + 5));
  const settled = await Promise.allSettled(
    chunks.map((c) =>
      postJSON<TelemFetchResponse>("Telem fetch", `${BASE}/fetch`, key, {
        urls: c,
        options: { tier: "default", content_format: "text" },
      }),
    ),
  );
  const ok: { url: string; text: string }[] = [];
  const failed: { url: string; error: string }[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") {
      const p = parseTelemFetch(s.value);
      ok.push(...p.ok);
      failed.push(...p.failed);
      const seen = new Set([...p.ok, ...p.failed].map((x) => x.url));
      for (const u of chunks[i]) if (!seen.has(u)) failed.push({ url: u, error: "Telem fetch returned no row for this URL" });
    } else {
      for (const u of chunks[i]) failed.push({ url: u, error: (s.reason as Error).message });
    }
  });
  return { ok, failed };
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
