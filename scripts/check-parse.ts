// Offline check of the search-layer parsing: npx tsx scripts/check-parse.ts
// Feeds hard-coded sample responses (shapes from docs.telem.ai / docs.tavily.com) through the mappers,
// then runs searchAll / extract / pollWatch against a stubbed fetch. No network, no real keys.
import assert from "node:assert/strict";
import { DILIGENCE, PLATFORM_PROVIDERS, extract, mergeHits, normalizeUrl, pollWatch, recentSince, runWatch, searchAll, wantsPlatforms, wantsRecent, watch, watchChanges } from "../lib/search";
import { SEARCH_FIELDS, parseTelemFetch, parseTelemPoll, parseTelemSearch, type TelemSearchResponse } from "../lib/search/telem";
import { parseTavilyExtract, parseTavilySearch, topicFor, type TavilySearchResponse } from "../lib/search/tavily";
import { newTrail, store } from "../lib/store";

let passed = 0;
const ok = (name: string) => {
  passed++;
  console.log(`ok  ${name}`);
};

const telemSample: TelemSearchResponse = {
  session_id: "sess-123",
  routing: [{ providers: ["brave", "exa"] }, { providers: ["linkedin"] }],
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
          { rank: 1, url: "https://www.Example.com/a/", title: "A from exa", summary: "exa summary a", publish_date: "2026-10-01" },
        ],
        warnings: [{ code: "count_clamped", message: "clamped" }, { code: "capability_gap", message: "no excerpt" }],
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
          { rank: 2, url: "https://brave-only.com/x?utm_source=feed", title: "X", summary: "x".repeat(900), publish_date: "" },
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
      { name: "exa", latency_ms: 812, n_results: 2, warnings: ["count_clamped"] }, // capability_gap left out
      { name: "brave", latency_ms: 301, n_results: 2 },
    ],
  );
  assert.deepEqual(p.perQuery[1].engines, [{ name: "linkedin", latency_ms: 50, n_results: 0, error: "provider_error: rate limited" }]);
  assert.deepEqual(p.perQuery[0].routing, ["brave", "exa"]);
  assert.deepEqual(p.perQuery[1].routing, ["linkedin"]);
  const q0 = p.perQuery[0].hits;
  // example.com/a found by exa AND brave -> one hit, first (consensus), credited to brave (routed ahead of exa),
  // keeps exa's date + snippet. Then rank 2 ties broken by routing order: brave's X before exa's B.
  assert.deepEqual(q0.map((h) => [h.url, h.engine]), [
    ["https://www.Example.com/a/", "brave"],
    ["https://brave-only.com/x?utm_source=feed", "brave"],
    ["https://example.com/b", "exa"],
  ]);
  assert.equal(q0[0].published, "2026-10-01");
  assert.equal(q0[0].snippet, "exa summary a");
  assert.equal(q0[1].published, undefined, 'publish_date "" means unknown');
  assert.ok(q0[1].snippet.length <= 500, "snippet capped at 500");
  ok("parseTelemSearch: engines + warnings per batch_index, routing per query, consensus/rank/routing order, publish_date");

  const off = parseTelemSearch({ ...telemSample, routing: null }, 2);
  assert.equal(off.perQuery[0].routing, undefined);
  assert.deepEqual(off.perQuery[0].hits.map((h) => h.engine), ["exa", "exa", "brave"]); // no routing: run order credits exa
  const short = parseTelemSearch({ ...telemSample, routing: [{ providers: ["exa"] }] }, 2);
  assert.equal(short.perQuery[1].routing, undefined); // missing entry for a query -> no routing
  ok("parseTelemSearch: routing null / missing entries");
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
      ["s1", "https://www.Example.com/a/", "brave"],
      ["s2", "https://tavily-one.com/p", "tavily"],
      ["s3", "https://brave-only.com/x?utm_source=feed", "brave"],
      ["s4", "https://example.com/b#section", "tavily"], // round-robin: tavily list reaches /b before exa does
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
  assert.equal(u[3].at, "2026-11-14T13:00:00Z"); // publish_date "" -> poll time
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
    search: { auto_routing: "accuracy", num_results: 5, fields: SEARCH_FIELDS },
  });
  assert.equal(calls.filter((c) => c.url.endsWith("/v1/search")).length, 1, "no recent or platform batch for these queries");
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
  assert.deepEqual(steps[0].routing, ["brave", "exa"]);
  assert.deepEqual(steps[1].routing, ["linkedin"]);
  assert.equal(steps[0].published_after, undefined);
  assert.deepEqual(steps[1].engines!.map((e) => [e.name, e.error ?? null]), [["linkedin", "provider_error: rate limited"], ["tavily", null]]);
  assert.ok(steps[0].urls!.length >= 4 && typeof steps[0].at === "string" && typeof steps[0].ms === "number");
  ok("searchAll: request bodies, auth headers, merge, one trail step per query, routing on steps");

  // same trail again: the call joins the Telem session from the first response; extract's fetch joins it too
  stub((url) => {
    if (url.endsWith("/v1/search")) return { status: 200, json: telemSample };
    if (url.endsWith("api.tavily.com/search")) return { status: 200, json: tavilySample };
    if (url.endsWith("api.tavily.com/extract")) return { status: 200, json: { results: [], failed_results: [{ url: "https://z.com", error: "blocked" }] } };
    if (url.endsWith("/v1/fetch")) return { status: 200, json: { session_id: "sess-123", preprocessor_runs: [{ batch_index: 0, output_payload: { fetched_results: [{ url: "https://z.com", content: "Z" }] } }] } };
    throw new Error(`unexpected ${url}`);
  });
  await searchAll(["Anthropic pricing"], trail);
  assert.equal((calls.find((c) => c.url.endsWith("/v1/search"))!.body as { session_id?: string }).session_id, "sess-123");
  await extract(["https://z.com"], trail);
  assert.equal((calls.find((c) => c.url.endsWith("/v1/fetch"))!.body as { session_id?: string }).session_id, "sess-123");
  assert.equal(store.trails.get(trail.id)!.steps.at(-1)!.telem_session_id, "sess-123");
  ok("searchAll / extract: later calls on a trail reuse its Telem session_id");

  // recency + platforms: split into three batch calls, each mapped back to the right query
  assert.ok(wantsRecent("Acme latest news") && !wantsRecent("Acme funding 2026"));
  assert.ok(wantsPlatforms("Acme hiring on LinkedIn") && !wantsPlatforms("Acme pricing"));
  const qs3 = ["Acme pricing", "Acme latest news", "Acme hiring on LinkedIn"];
  const run = (name: string, batch_index: number, url: string) => ({
    preprocessor_name: name, status: "succeeded", batch_index, latency_ms: 10, error: null,
    output_payload: { results: [{ rank: 1, url, title: name, summary: name, publish_date: "2026-11-01" }], warnings: [] },
  });
  stub((url, body) => {
    if (url.endsWith("api.tavily.com/search")) return { status: 200, json: { results: [] } };
    const b = body as { user_input: { query: string }[]; search: { published_after?: string; providers?: { include: string[] } } };
    const q = b.user_input.map((u) => u.query);
    if (b.search.providers) {
      assert.deepEqual(b.search.providers.include, PLATFORM_PROVIDERS);
      assert.deepEqual(q, ["Acme hiring on LinkedIn"]);
      return { status: 200, json: { session_id: "p1", routing: [{ providers: ["apify_linkedin", "socialdatax_x"] }], preprocessor_runs: [run("apify_linkedin", 0, "https://linkedin.com/posts/acme-hiring")] } };
    }
    if (b.search.published_after) {
      assert.equal(b.search.published_after, recentSince());
      assert.deepEqual(q, ["Acme latest news"]);
      return { status: 200, json: { session_id: "r1", routing: [{ providers: ["exa"] }], preprocessor_runs: [run("exa", 0, "https://news.com/acme")] } };
    }
    assert.deepEqual(q, ["Acme pricing", "Acme hiring on LinkedIn"]);
    return { status: 200, json: { session_id: "m1", routing: [{ providers: ["brave"] }, { providers: ["exa"] }], preprocessor_runs: [run("brave", 0, "https://acme.com/pricing"), run("exa", 1, "https://acme.com/careers")] } };
  });
  trail = newTrail();
  sources = await searchAll(qs3, trail, { platforms: true });
  assert.equal(calls.filter((c) => c.url.endsWith("/v1/search")).length, 3);
  steps = store.trails.get(trail.id)!.steps;
  assert.deepEqual(steps.map((s) => s.query), qs3);
  assert.deepEqual(steps[0].routing, ["brave"]);
  assert.deepEqual(steps[1].routing, ["exa"]);
  assert.equal(steps[1].published_after, recentSince());
  assert.equal(steps[0].published_after, undefined);
  assert.deepEqual(steps[2].routing, ["exa", "apify_linkedin", "socialdatax_x"]);
  assert.deepEqual(steps[2].engines!.map((e) => e.name), ["exa", "apify_linkedin", "tavily"]);
  assert.ok(sources.some((s) => s.engine === "apify_linkedin" && s.url === "https://linkedin.com/posts/acme-hiring"));
  assert.equal(sources.find((s) => s.url === "https://news.com/acme")!.published, "2026-11-01");
  ok("searchAll: recency batch (published_after) and platform batch (pinned platform providers), routing per query");

  // without opts.platforms: no platform batch
  trail = newTrail();
  stub((url, body) => {
    if (url.endsWith("api.tavily.com/search")) return { status: 200, json: { results: [] } };
    assert.equal((body as { search: { providers?: unknown } }).search.providers, undefined);
    return { status: 200, json: { preprocessor_runs: [] } };
  });
  await searchAll(["Acme hiring on LinkedIn"], trail).catch(() => []);
  assert.equal(calls.filter((c) => c.url.endsWith("/v1/search")).length, 1);
  ok("searchAll: platform batch only with opts.platforms");

  // a 422 on the rich body retries once with the docs' plain body; the step then claims no date filter
  stub((url, body) => {
    if (url.endsWith("api.tavily.com/search")) return { status: 200, json: { results: [] } };
    const b = body as { search: { fields?: string[]; tier?: string } };
    if (b.search.fields) return { status: 422, json: { detail: [{ loc: ["body", "search", "fields"], msg: "bad" }] } };
    assert.equal(b.search.tier, "default");
    return { status: 200, json: { routing: [{ providers: ["exa"] }], preprocessor_runs: [run("exa", 0, "https://news.com/acme")] } };
  });
  trail = newTrail();
  sources = await searchAll(["Acme latest news"], trail);
  assert.equal(calls.filter((c) => c.url.endsWith("/v1/search")).length, 2);
  assert.equal(sources[0].url, "https://news.com/acme");
  steps = store.trails.get(trail.id)!.steps;
  assert.equal(steps[0].published_after, undefined);
  assert.deepEqual(steps[0].routing, ["exa"]);
  ok("telemSearch: 400/422 -> one retry with the plain body");

  // platform batch fails -> its error is on the step, general results still come back
  stub((url, body) => {
    if (url.endsWith("api.tavily.com/search")) return { status: 200, json: { results: [] } };
    if ((body as { search: { providers?: unknown } }).search.providers) return { status: 402, json: { detail: "out of credit" } };
    return { status: 200, json: { preprocessor_runs: [run("exa", 0, "https://acme.com/careers")] } };
  });
  trail = newTrail();
  sources = await searchAll(["Acme hiring on LinkedIn"], trail, { platforms: true });
  assert.equal(sources.length, 1);
  assert.deepEqual(store.trails.get(trail.id)!.steps[0].engines!.find((e) => e.name === "telem_platforms")!.error, "Telem search HTTP 402: out of credit");
  ok("searchAll: platform batch failure is recorded, not fatal");

  // diligence batches: off by default; with TELEM_DILIGENCE=1 each provider set gets its own pinned batch
  const dq = ["Acme funding and investors", "Acme customer reviews on Reddit", "Acme patents", "Acme pricing"];
  const dStub = (failReddit: boolean) =>
    stub((url, body) => {
      if (url.endsWith("api.tavily.com/search")) return { status: 200, json: { results: [] } };
      const b = body as { session_id?: string; user_input: { query: string }[]; search: { providers?: { include: string[] } } };
      const inc = b.search.providers?.include.join(",") ?? "";
      const q = b.user_input.map((u) => u.query);
      if (inc === "sec_edgar,coresignal_company") {
        assert.deepEqual(q, ["Acme funding and investors"]);
        return { status: 200, json: { session_id: "d1", routing: [{ providers: ["sec_edgar"] }], preprocessor_runs: [run("sec_edgar", 0, "https://sec.gov/acme-s1")] } };
      }
      if (inc === "fetchlayer_reddit") {
        assert.deepEqual(q, ["Acme customer reviews on Reddit"]);
        if (failReddit) return { status: 400, json: { detail: "unknown search.providers entries: fetchlayer_reddit" } };
        return { status: 200, json: { preprocessor_runs: [run("fetchlayer_reddit", 0, "https://reddit.com/r/acme/1")] } };
      }
      if (inc === "patsnap,uspto_applications") {
        assert.deepEqual(q, ["Acme patents"]);
        return { status: 200, json: { preprocessor_runs: [run("uspto_applications", 0, "https://uspto.gov/acme-1")] } };
      }
      if (inc) return { status: 200, json: { preprocessor_runs: [] } }; // platform batch
      return { status: 200, json: { session_id: "m2", preprocessor_runs: dq.map((_, i) => run("exa", i, `https://acme.com/${i}`)) } };
    });

  delete process.env.TELEM_DILIGENCE;
  dStub(false);
  await searchAll(dq, newTrail());
  assert.equal(calls.filter((c) => c.url.endsWith("/v1/search")).length, 1, "no diligence batches unless TELEM_DILIGENCE=1");

  process.env.TELEM_DILIGENCE = "1";
  assert.deepEqual(DILIGENCE.map((d) => d.name), ["financials", "reddit", "patents"]);
  dStub(false);
  trail = newTrail();
  sources = await searchAll(dq, trail);
  assert.equal(calls.filter((c) => c.url.endsWith("/v1/search")).length, 4);
  steps = store.trails.get(trail.id)!.steps;
  assert.deepEqual(steps[0].engines!.map((e) => e.name), ["exa", "sec_edgar", "tavily"]);
  assert.deepEqual(steps[0].routing, ["sec_edgar"]);
  assert.deepEqual(steps[1].engines!.map((e) => e.name), ["exa", "fetchlayer_reddit", "tavily"]);
  assert.deepEqual(steps[2].engines!.map((e) => e.name), ["exa", "uspto_applications", "tavily"]);
  assert.deepEqual(steps[3].engines!.map((e) => e.name), ["exa", "tavily"]);
  for (const u of ["https://sec.gov/acme-s1", "https://reddit.com/r/acme/1", "https://uspto.gov/acme-1"]) assert.ok(sources.some((s) => s.url === u), u);
  assert.equal(sources.find((s) => s.url === "https://sec.gov/acme-s1")!.engine, "sec_edgar");

  // later calls on the same trail send its Telem session to the diligence batches too
  dStub(false);
  await searchAll(["Acme revenue"], trail);
  const fin = calls.find((c) => (c.body as { search?: { providers?: { include: string[] } } }).search?.providers?.include[0] === "sec_edgar")!;
  assert.ok(["m2", "d1"].includes((fin.body as { session_id?: string }).session_id ?? ""), "diligence batch joins the trail's Telem session");

  // a refused diligence provider (400 twice: rich body, then the plain fallback) is recorded, not fatal
  dStub(true);
  trail = newTrail();
  sources = await searchAll(dq, trail);
  steps = store.trails.get(trail.id)!.steps;
  assert.match(steps[1].engines!.find((e) => e.name === "telem_reddit")!.error!, /HTTP 400: unknown search.providers entries/);
  assert.ok(sources.some((s) => s.url === "https://sec.gov/acme-s1") && !sources.some((s) => s.url.includes("reddit.com")));
  delete process.env.TELEM_DILIGENCE;
  ok("searchAll: TELEM_DILIGENCE=1 adds pinned sec_edgar/coresignal, reddit and patent batches; soft failure; session");

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

  // monitor agent: run now (409 tick_in_progress is fine) + changes since cursor
  let ticks = 0;
  stub((url) => {
    if (url === "https://hack.telem.ai/api/v1/monitors/mon-1/agent/ticks") {
      ticks++;
      return ticks === 1 ? { status: 202, json: { job_id: "j1" } } : { status: 409, json: { error: { code: "tick_in_progress", message: "already running" } } };
    }
    if (url === "https://hack.telem.ai/api/v1/monitors/mon-1/agent/changes?cursor=3") {
      return {
        status: 200,
        json: {
          changes: [
            { seq: 4, kind: "run", at: "2026-11-14T14:01:00Z" },
            { seq: 5, kind: "entity_added", subject: { entity_id: "e1", name: "Rival C" }, after: { quote: "Rival C launched a picking robot", url: "https://news.example/rival-c" }, at: "2026-11-14T14:02:00Z" },
            { seq: 6, kind: "value_changed", subject: { name: "Headcount" }, before: { value: "120" }, after: { value: "108" } },
          ],
          next_cursor: 6,
        },
      };
    }
    throw new Error(`unexpected ${url}`);
  });
  assert.deepEqual(await runWatch("mon-1"), { already_running: false });
  assert.deepEqual(await runWatch("mon-1"), { already_running: true });
  const ch = await watchChanges("mon-1", 3);
  assert.equal(ch.cursor, 6);
  assert.equal(ch.updates.length, 1); // run is bookkeeping; the value change has no url
  assert.equal(ch.updates[0].title, "New: Rival C");
  assert.equal(ch.updates[0].summary, "Rival C launched a picking robot");
  assert.equal(ch.updates[0].url, "https://news.example/rival-c");
  ok("monitor agent: run now (+409 in progress), changes since cursor");

  globalThis.fetch = realFetch;
}

e2e()
  .then(() => console.log(`\nall ${passed} checks passed`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
