// Tavily REST: search + extract. Docs: https://docs.tavily.com/documentation/api-reference/endpoint/search , /extract
import { clip, needKey, postJSON, type Hit } from "./http";

const BASE = "https://api.tavily.com";

export type TavilySearchResponse = {
  query?: string;
  results?: { title?: string; url?: string; content?: string; score?: number; published_date?: string | null }[];
  response_time?: number;
  request_id?: string;
};

export type TavilyExtractResponse = {
  results?: { url?: string; raw_content?: string | null }[];
  failed_results?: { url?: string; error?: string }[];
};

// ---------- pure mapping (exported for scripts/check-parse.ts) ----------

export function parseTavilySearch(resp: TavilySearchResponse): Hit[] {
  const out: Hit[] = [];
  for (const r of resp.results ?? []) {
    if (!r.url) continue;
    out.push({
      url: r.url,
      title: clip(r.title, 300) || r.url,
      engine: "tavily",
      snippet: clip(r.content, 500),
      ...(r.published_date ? { published: r.published_date } : {}),
    });
  }
  return out;
}

export function parseTavilyExtract(resp: TavilyExtractResponse): { ok: { url: string; text: string }[]; failed: { url: string; error: string }[] } {
  const ok: { url: string; text: string }[] = [];
  const failed: { url: string; error: string }[] = [];
  for (const r of resp.results ?? []) {
    if (!r.url) continue;
    if (r.raw_content && r.raw_content.trim()) ok.push({ url: r.url, text: r.raw_content });
    else failed.push({ url: r.url, error: "empty content" });
  }
  for (const f of resp.failed_results ?? []) if (f.url) failed.push({ url: f.url, error: f.error || "failed" });
  return { ok, failed };
}

// News topic for time-sensitive queries, general otherwise.
export const topicFor = (q: string) =>
  /\b(news|funding|raised|raise|layoffs?|lawsuits?|sued|acquir\w*|recent|latest|this (week|month|year)|20\d\d)\b/i.test(q) ? "news" : "general";

// ---------- HTTP ----------

export async function tavilySearch(query: string): Promise<TavilySearchResponse> {
  const key = needKey("TAVILY_API_KEY");
  return postJSON<TavilySearchResponse>("Tavily search", `${BASE}/search`, key, {
    query,
    topic: topicFor(query),
    max_results: 5,
    search_depth: "basic",
    include_published_date: true,
  });
}

export async function tavilyExtract(urls: string[]): Promise<TavilyExtractResponse> {
  const key = needKey("TAVILY_API_KEY");
  return postJSON<TavilyExtractResponse>("Tavily extract", `${BASE}/extract`, key, {
    urls: urls.slice(0, 20), // API limit: 1 to 20 URLs
    extract_depth: "basic",
    format: "text",
    timeout: 15,
  });
}
