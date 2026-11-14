import type { Engine, Source, TrailRecorder, WatchUpdate } from "../types";
import * as telem from "./telem";
import * as tavily from "./tavily";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Provider failed";
const failed = (run: telem.Run) => Boolean(run.error) || ["failed", "error", "cancelled"].includes(run.status ?? "");
function canonical(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || ["gclid", "fbclid"].includes(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString();
  } catch { return; }
}
async function timed<T>(operation: () => Promise<T>) {
  const start = Date.now();
  try { return { ok: true as const, value: await operation(), ms: Date.now() - start }; }
  catch (error) { return { ok: false as const, error: errorMessage(error), ms: Date.now() - start }; }
}

export async function searchAll(queries: string[], trail: TrailRecorder, opts?: { platforms?: boolean }): Promise<Source[]> {
  // Platform-specific intent (site:linkedin.com etc.) is preserved in the original query.
  void opts;
  const clean = [...new Set(queries.map(query => query.trim()).filter(Boolean))];
  if (!clean.length) return [];
  if (clean.length > 10) throw new Error("At most 10 search queries are supported");
  const start = Date.now();
  const [batch, individual] = await Promise.all([
    timed(() => telem.searchBatch(clean)),
    Promise.all(clean.map(query => timed(() => tavily.search(query)))),
  ]);
  const perQuery: Omit<Source, "id">[][] = [];
  let successfulCalls = 0;
  clean.forEach((query, index) => {
    const sources: Omit<Source, "id">[] = [];
    const engines: Engine[] = [];
    if (batch.ok) {
      const runs = batch.value.preprocessor_runs.filter(run => (run.batch_index ?? 0) === index);
      for (const run of runs) {
        const rows = run.output_payload?.results;
        const error = failed(run) ? "Telem engine failed" : !Array.isArray(rows) ? "Telem engine returned no results array" : undefined;
        engines.push({ name: run.preprocessor_name, latency_ms: run.latency_ms ?? batch.ms,
          n_results: error ? 0 : rows!.length, ...(error ? { error } : {}) });
        if (error) continue;
        successfulCalls++;
        for (const row of rows!) sources.push({
          url: row.url, title: row.title ?? row.url, snippet: row.summary ?? "", engine: run.preprocessor_name,
          ...(row.published_at ? { published: row.published_at } : {}),
        });
      }
      if (!runs.length) engines.push({ name: "telem", latency_ms: batch.ms, n_results: 0, error: "No engine runs returned for query" });
    } else engines.push({ name: "telem", latency_ms: batch.ms, n_results: 0, error: batch.error });
    const result = individual[index];
    if (result.ok) {
      successfulCalls++;
      engines.push({ name: "tavily", latency_ms: result.ms, n_results: result.value.length });
      for (const row of result.value) sources.push({
        url: row.url, title: row.title, snippet: row.content, engine: "tavily",
        ...(row.published_date ? { published: row.published_date } : {}),
      });
    } else engines.push({ name: "tavily", latency_ms: result.ms, n_results: 0, error: result.error });
    perQuery.push(sources);
    trail.step({ kind: "search", label: "Search: " + query, query, engines,
      urls: sources.map(source => source.url).filter(url => Boolean(canonical(url))),
      ms: Date.now() - start,
      ...(batch.ok && batch.value.session_id ? { telem_session_id: batch.value.session_id } : {}),
    });
  });
  if (!successfulCalls) throw new Error("All search providers failed; inspect the research trail");
  // Round-robin across queries prevents the first query consuming the entire evidence budget.
  const sources: Source[] = [];
  const seen = new Set<string>();
  const longest = Math.max(...perQuery.map(rows => rows.length));
  for (let rank = 0; rank < longest && sources.length < 20; rank++) {
    for (const rows of perQuery) {
      const source = rows[rank];
      if (!source || sources.length >= 20) continue;
      const url = canonical(source.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      sources.push({ ...source, url, id: "s" + (sources.length + 1) });
    }
  }
  return sources;
}

export async function extract(urls: string[], trail: TrailRecorder): Promise<{ url: string; text: string }[]> {
  const selected = [...new Set(urls.map(canonical).filter((url): url is string => Boolean(url)))].slice(0, 5);
  if (!selected.length) return [];
  const primary = await timed(() => tavily.extractPages(selected));
  const pages = new Map<string, string>();
  if (primary.ok) for (const row of primary.value.results) {
    const url = canonical(row.url);
    if (url && selected.includes(url) && row.raw_content?.trim()) pages.set(url, row.raw_content);
  }
  const missing = selected.filter(url => !pages.has(url));
  trail.step({ kind: "extract", label: "Extract pages with Tavily", urls: selected, ms: primary.ms,
    engines: [{ name: "tavily", latency_ms: primary.ms, n_results: pages.size,
      ...(!primary.ok ? { error: primary.error } : missing.length ? { error: missing.length + " pages have no extracted content" } : {}) }],
  });
  if (missing.length) {
    const fallback = await timed(() => telem.fetchPages(missing));
    const engines: Engine[] = [];
    if (fallback.ok) {
      for (const run of fallback.value.preprocessor_runs) {
        let count = 0;
        for (const row of run.output_payload?.fetched_results ?? []) {
          const url = canonical(row.url);
          if (!failed(run) && !row.error && !["failed", "error"].includes(row.status ?? "") &&
              url && missing.includes(url) && row.content?.trim()) {
            pages.set(url, row.content); count++;
          }
        }
        engines.push({ name: run.preprocessor_name, latency_ms: run.latency_ms ?? fallback.ms,
          n_results: count, ...(!count ? { error: "Telem fetch returned no usable content" } : {}) });
      }
    } else engines.push({ name: "telem", latency_ms: fallback.ms, n_results: 0, error: fallback.error });
    trail.step({ kind: "fetch", label: "Fetch missing pages with Telem", urls: missing, engines, ms: fallback.ms,
      ...(fallback.ok && fallback.value.session_id ? { telem_session_id: fallback.value.session_id } : {}),
    });
  }
  if (!pages.size) throw new Error("No pages could be extracted; inspect the research trail");
  return selected.flatMap(url => pages.has(url) ? [{ url, text: pages.get(url)! }] : []);
}

export async function watch(company: string): Promise<{ monitor_id: string }> {
  if (!company.trim()) throw new Error("Company is required");
  return telem.createMonitor(company.trim());
}

export async function pollWatch(monitor_id: string): Promise<WatchUpdate[]> {
  if (!monitor_id.trim()) throw new Error("Monitor ID is required");
  const data = await telem.pollMonitor(monitor_id);
  const updates: WatchUpdate[] = [];
  const seen = new Set<string>();
  for (const run of data.preprocessor_runs) {
    if (failed(run)) throw new Error("Telem monitor run failed");
    const rows = run.output_payload?.results;
    if (!Array.isArray(rows)) throw new Error("Telem monitor returned an invalid results payload");
    for (const row of rows) {
      const url = canonical(row.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      updates.push({ at: new Date().toISOString(), title: row.title ?? url, url, summary: row.summary ?? "" });
    }
  }
  return updates;
}
