// Offline check of the search-layer parsing: npx tsx scripts/check-parse.ts
// Feeds hard-coded sample responses (shapes from docs.telem.ai / docs.tavily.com) through the mappers,
// then runs searchAll / extract / pollWatch against a stubbed fetch. No network, no real keys.
import assert from "node:assert/strict";
import { extract, mergeHits, normalizeUrl, pollWatch, searchAll, watch } from "../lib/search";
import { parseTelemFetch, parseTelemPoll, parseTelemSearch, type TelemSearchResponse } from "../lib/search/telem";
import { parseTavilyExtract, parseTavilySearch, topicFor, type TavilySearchResponse } from "../lib/search/tavily";
import { newTrail, store } from "../lib/store";

let passed = 0;
const ok = (name: string) => {
  passed++;
  console.log(`ok  ${name}`);
};

const telemSample: TelemSearchResponse = {
  session_id: "sess-123",
  routing: [{ providers: ["exa", "brave"] }],
  preprocessor_runs: [
    {
      preprocessor_name: "exa",
      status: "succeeded",
      batch_index: 0,
      query: "Anthropic competitors",
      latency_ms: 812.4,
      error: null,
      output_payload: {
        results: [
          { rank: 2, url: "https://example.com/b", title: "B from exa", summary: "exa summary b" },
          { rank: 1, url: "https://www.Example.com/a/", title: "A from exa", summary: "exa summary a", published_date: "2026-10-01" },
        ],
        warnings: [],
      },
    },
    {
      preprocessor_name: "brave",
      status: "succeeded",
      batch_index: 0,
      query: "Anthropic competitors",
      latency_ms: 301,
      error: null,
      output_payload: {
        results: [
          { rank: 1, url: "https://example.com/a", title: "A again from brave" },
          { rank: 2, url: "https://brave-only.com/x?utm_source=feed", title: "X", summary: "x".repeat(900) },
        ],
        warnings: [],
      },
    },
    {
      preprocessor_name: "linkedin",
      status: "failed",
      batch_index: 1,
      query: "Anthropic funding 2026",
      latency_ms: 50,
      error: { code: "provider_error", message: "rate limited" },
      output_payload: null,
    },
  ],
};

const tavilySample: TavilySearchResponse = {
  query: "Anthropic competitors",
  results: [
    { title: "T1", url: "https://tavily-one.com/p", content: "  tavily   content\n one ", score: 0.9, published_date: "Mon, 10 Nov 2026 12:00:00 GMT" },
    { title: "", url: "https://example.com/b#section", content: "dup of exa b", score: 0.5 },
    { title: "no url", content: "skipped" },
  ],
  response_time: 1.2,
};

// ---- Telem search mapping ----
{
  const p = parseTelemSearch(telemSample, 2);
  assert.equal(p.session_id, "sess-123");
  assert.deepEqual(
    p.perQuery[0].engines,
    [
      { name: "exa", latency_ms: 812, n_results: 2 },
      { name: "brave", latency_ms: 301, n_results: 2 },
    ],
  );
  assert.deepEqual(p.perQuery[1].engines, [{ name: "linkedin", latency_ms: 50, n_results: 0, error: "provider_error: rate limited" }]);
  const q0 = p.perQuery[0].hits;
  assert.equal(q0.length, 4);
  assert.equal(q0[0].title, "A from exa"); // rank 1 first, exa run before brave run
  assert.equal(q0[0].published, "2026-10-01");
  assert.equal(q0[0].engine, "exa");
  assert.equal(q0[1].engine, "brave");
  assert.equal(q0[1].snippet, "");
  assert.ok(q0[3].snippet.length <= 500, "snippet capped at 500");
  ok("parseTelemSearch: engines per batch_index, rank order, error text, snippet cap");
}

// ---- Tavily search mapping ----
{
  const hits = parseTavilySearch(tavilySample);
  assert.equal(hits.length, 2);
  assert.deepEqual(hits[0], {
    url: "https://tavily-one.com/p",
    title: "T1",
    engine: "tavily",
    snippet: "tavily content one",
    published: "Mon, 10 Nov 2026 12:00:00 GMT",
  });
  assert.equal(hits[1].title, "https://example.com/b#section"); // empty title falls back to url
  assert.equal(topicFor("Anthropic funding 2026"), "news");
  assert.equal(topicFor("Anthropic competitors"), "general");
  ok("parseTavilySearch: fields, whitespace, url-less rows dropped, topic choice");
}

// ---- Merge + dedupe ----
{
  assert.equal(normalizeUrl("https://www.Example.com/a/"), normalizeUrl("https://example.com/a"));
  assert.equal(normalizeUrl("https://brave-only.com/x?utm_source=feed"), "https://brave-only.com/x");
  assert.equal(normalizeUrl("https://example.com/b#section"), "https://example.com/b");
  const p = parseTelemSearch(telemSample, 2);
  const sources = mergeHits([p.perQuery[0].hits, parseTavilySearch(tavilySample)]);
  assert.deepEqual(
    sources.map((s) => [s.id, s.url, s.engine]),
    [
      ["s1", "https://www.Example.com/a/", "exa"],
      ["s2", "https://tavily-one.com/p", "tavily"],
      ["s3", "https://example.com/b#section", "tavily"], // round-robin: tavily list reaches /b before exa does
      ["s4", "https://brave-only.com/x?utm_source=feed", "brave"],
    ],
  );
  const many = mergeHits([Array.from({ length: 30 }, (_, i) => ({ url: `https://m.com/${i}`, title: `${i}`, engine: "exa", snippet: "" }))]);
  assert.equal(many.length, 20);
  assert.equal(many[19].id, "s20");
  ok("mergeHits: dedupe by normalized URL, ids s1..sN, cap 20");
}

// ---- Fetch / extract / poll mapping ----
{
  const f = parseTelemFetch({
    preprocessor_runs: [
      { batch_index: 0, preprocessor_name: "web_fetch", output_payload: { fetched_results: [{ url: "https://a.com", status: "succeeded", error: null, content: "page A" }] } },
      { batch_index: 1, preprocessor_name: "web_fetch", output_payload: { fetched_results: [{ url: "https://b.com", status: "failed", error: { message: "paywall" } }] } },
    ],
  });
  assert.deepEqual(f, { ok: [{ url: "https://a.com", text: "page A" }], failed: [{ url: "https://b.com", error: "paywall" }] });

  const t = parseTavilyExtract({
    results: [{ url: "https://a.com", raw_content: "A text" }],
    failed_results: [{ url: "https://b.com", error: "timeout" }],
  });
  assert.deepEqual(t, { ok: [{ url: "https://a.com", text: "A text" }], failed: [{ url: "https://b.com", error: "timeout" }] });

  const u = parseTelemPoll({ completed_at: "2026-11-14T13:00:00Z", preprocessor_runs: telemSample.preprocessor_runs });
  assert.equal(u.length, 4); // dedupe is by exact URL here; the two spellings of example.com/a stay
  assert.equal(u[0].at, "2026-11-14T13:00:00Z"); // no date on the result -> poll time
  assert.equal(u[1].at, "2026-10-01"); // result's own date wins
  assert.deepEqual(Object.keys(u[0]).sort(), ["at", "summary", "title", "url"]);
  ok("parseTelemFetch / parseTavilyExtract / parseTelemPoll");
}

// ---- End to end with a stubbed fetch ----
type Handler = (url: string, body: unknown) => { status: number; json: unknown };
const realFetch = globalThis.fetch;
const calls: { url: string; body: unknown; auth: string }[] = [];
function stub(h: Handler) {
  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body, auth: new Headers(init?.headers).get("authorization") ?? "" });
    const r = h(url, body);
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

async function e2e() {
  process.env.TELEM_API_KEY = "test-telem";
  process.env.TAVILY_API_KEY = "test-tavily";
  const queries = ["Anthropic competitors", "Anthropic funding 2026"];

  // both providers up
  stub((url) => {
    if (url.endsWith("/v1/search")) return { status: 200, json: telemSample };
    if (url.endsWith("api.tavily.com/search")) return { status: 200, json: tavilySample };
    throw new Error(`unexpected ${url}`);
  });
  let trail = newTrail();
  let sources = await searchAll(queries, trail);
  const telemCall = calls.find((c) => c.url === "https://hack.telem.ai/api/v1/search")!;
  assert.deepEqual(telemCall.body, {
    user_input: [{ query: queries[0] }, { query: queries[1] }],
    search: { auto_routing: "accuracy", num_results: 5, tier: "default" },
  });
  assert.equal(telemCall.auth, "Bearer test-telem");
  const tav = calls.filter((c) => c.url === "https://api.tavily.com/search");
  assert.equal(tav.length, 2);
  assert.equal(tav[0].auth, "Bearer test-tavily");
  assert.equal((tav[1].body as { topic: string }).topic, "news");
  assert.ok(sources.length > 0 && sources.every((s, i) => s.id === `s${i + 1}`));
  assert.equal(new Set(sources.map((s) => normalizeUrl(s.url))).size, sources.length);
  let steps = store.trails.get(trail.id)!.steps;
  assert.equal(steps.length, 2);
  assert.equal(steps[0].kind, "search");
  assert.equal(steps[0].query, queries[0]);
  assert.equal(steps[0].telem_session_id, "sess-123");
  assert.deepEqual(steps[0].engines!.map((e) => e.name), ["exa", "brave", "tavily"]);
  assert.deepEqual(steps[1].engines!.map((e) => [e.name, e.error ?? null]), [["linkedin", "provider_error: rate limited"], ["tavily", null]]);
  assert.ok(steps[0].urls!.length >= 4 && typeof steps[0].at === "string" && typeof steps[0].ms === "number");
  ok("searchAll: request bodies, auth headers, merge, one trail step per query");

  // Telem down, Tavily up
  stub((url) => (url.includes("telem") ? { status: 401, json: { detail: "Missing API key" } } : { status: 200, json: tavilySample }));
  trail = newTrail();
  sources = await searchAll(queries, trail);
  assert.ok(sources.length > 0 && sources.every((s) => s.engine === "tavily"));
  steps = store.trails.get(trail.id)!.steps;
  assert.deepEqual(steps[0].engines![0], { name: "telem", latency_ms: steps[0].engines![0].latency_ms, n_results: 0, error: "Telem search HTTP 401: Missing API key" });
  ok("searchAll: Telem fails -> Tavily results + error in trail");

  // both down
  stub((url) => (url.includes("telem") ? { status: 503, json: { detail: { reason: "all_providers_failed" } } } : { status: 432, json: { detail: { error: "plan limit" } } }));
  await assert.rejects(searchAll(queries, newTrail()), (e: Error) => /Telem: Telem search HTTP 503: all_providers_failed/.test(e.message) && /Tavily: Tavily search HTTP 432: plan limit/.test(e.message));
  ok("searchAll: both fail -> throws with both messages");

  // missing key
  delete process.env.TAVILY_API_KEY;
  stub((url) => (url.includes("telem") ? { status: 200, json: telemSample } : { status: 500, json: {} }));
  trail = newTrail();
  sources = await searchAll(queries, trail);
  assert.ok(sources.every((s) => s.engine !== "tavily"));
  assert.match(store.trails.get(trail.id)!.steps[0].engines!.at(-1)!.error!, /TAVILY_API_KEY is not set/);
  process.env.TAVILY_API_KEY = "test-tavily";
  ok("searchAll: missing key named in error");

  // extract: Tavily gets a, fails b; Telem fetch gets b
  stub((url, body) => {
    if (url === "https://api.tavily.com/extract") {
      assert.deepEqual((body as { urls: string[] }).urls, ["https://a.com/", "https://b.com"]);
      return { status: 200, json: { results: [{ url: "https://a.com", raw_content: "A".repeat(9000) }], failed_results: [{ url: "https://b.com", error: "blocked" }] } };
    }
    if (url === "https://hack.telem.ai/api/v1/fetch") {
      assert.deepEqual(body, { urls: ["https://b.com"], options: { tier: "default", content_format: "text" } });
      return { status: 200, json: { session_id: "f1", preprocessor_runs: [{ batch_index: 0, preprocessor_name: "web_fetch", output_payload: { fetched_results: [{ url: "https://b.com", error: null, content: "B text" }] } }] } };
    }
    throw new Error(`unexpected ${url}`);
  });
  trail = newTrail();
  const pages = await extract(["https://a.com/", "https://b.com"], trail);
  assert.deepEqual(pages.map((p) => [p.url, p.text.length]), [["https://a.com/", 8000], ["https://b.com", 6]]);
  const ex = store.trails.get(trail.id)!.steps;
  assert.equal(ex.length, 1);
  assert.equal(ex[0].kind, "extract");
  assert.deepEqual(ex[0].engines!.map((e) => [e.name, e.n_results]), [["tavily", 1], ["telem_fetch", 1]]);
  ok("extract: Tavily first, Telem fetch fallback, 8000-char cap, one trail step");

  // monitors
  stub((url, body) => {
    if (url === "https://hack.telem.ai/api/v1/monitors") {
      assert.deepEqual(body, { query: "News, funding, layoffs, lawsuits or new competitors for Acme", options: { frequency: "1h" }, ttl: "30d" });
      return { status: 201, json: { id: "mon-1", status: "active", session_id: "s" } };
    }
    if (url === "https://hack.telem.ai/api/v1/monitors/mon-1/poll") return { status: 200, json: { completed_at: "2026-11-14T14:00:00Z", preprocessor_runs: telemSample.preprocessor_runs } };
    throw new Error(`unexpected ${url}`);
  });
  assert.deepEqual(await watch("Acme"), { monitor_id: "mon-1" });
  const ups = await pollWatch("mon-1");
  assert.ok(ups.length > 0 && ups.every((u) => u.url && u.title && u.at));
  ok("watch / pollWatch: request body, id, updates");

  globalThis.fetch = realFetch;
}

e2e()
  .then(() => console.log(`\nall ${passed} checks passed`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
