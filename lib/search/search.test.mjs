import assert from "node:assert/strict";
import { test, after } from "node:test";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { readFileSync } from "node:fs";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
      return next(specifier + ".ts", context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts")) return { format: "module", source: stripTypeScriptTypes(readFileSync(new URL(url), "utf8")), shortCircuit: true };
    return next(url, context);
  },
});
const { searchAll, extract, watch, pollWatch } = await import("./index.ts");
const originalFetch = globalThis.fetch;
const originalKeys = [process.env.TELEM_API_KEY, process.env.TAVILY_API_KEY];
process.env.TELEM_API_KEY = "test-telem";
process.env.TAVILY_API_KEY = "test-tavily";
after(() => {
  globalThis.fetch = originalFetch;
  ["TELEM_API_KEY", "TAVILY_API_KEY"].forEach((key, index) => {
    if (originalKeys[index] === undefined) delete process.env[key];
    else process.env[key] = originalKeys[index];
  });
});
const json = value => new Response(JSON.stringify(value));
const recorder = () => ({ id: "test", steps: [], step(value) { this.steps.push(value); } });
const run = (rows, index = 0) => ({
  preprocessor_name: "brave", batch_index: index, status: "succeeded", latency_ms: 4,
  output_payload: { results: rows },
});

test("batch search deduplicates URLs and records one trail per query", async () => {
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return url.includes("telem") ? json({ session_id: "session", preprocessor_runs: [
      run([{ url: "https://example.com/?utm_source=test", title: "Company" }]),
      run([{ url: "https://other.com/", title: "Other" }], 1),
    ] }) : json({ results: [{ url: "https://example.com/#about", title: "Duplicate", content: "Evidence" }] });
  };
  const trail = recorder();
  const sources = await searchAll(["funding", "competitors"], trail);
  assert.equal(requests.filter(row => row.url.includes("telem")).length, 1);
  assert.equal(requests.length, 3);
  assert.equal(sources.length, 2);
  assert.deepEqual(sources.map(row => row.id), ["s1", "s2"]);
  assert.equal(trail.steps.length, 2);
  assert.equal(trail.steps[0].telem_session_id, "session");
  assert.equal(trail.steps[0].engines[0].name, "brave");
});

test("partial provider failure preserves evidence and an explicit error", async () => {
  globalThis.fetch = async url => url.includes("telem") ? new Response("", { status: 503 }) :
    json({ results: [{ url: "https://example.com/", title: "Result", content: "Evidence" }] });
  const trail = recorder();
  assert.equal((await searchAll(["funding"], trail)).length, 1);
  assert.match(trail.steps[0].engines[0].error, /503/);
});

test("total failure throws after recording trail", async () => {
  globalThis.fetch = async () => new Response("", { status: 401 });
  const trail = recorder();
  await assert.rejects(searchAll(["funding"], trail), /All search providers failed/);
  assert.equal(trail.steps.length, 1);
});

test("failed extraction falls back only for missing pages", async () => {
  const requested = [];
  globalThis.fetch = async (url, init) => {
    requested.push(JSON.parse(init.body));
    if (url.includes("tavily")) return json({ results: [{ url: "https://a.com/", raw_content: "A" }],
      failed_results: [{ url: "https://b.com/", error: "unavailable" }] });
    return json({ preprocessor_runs: [{ preprocessor_name: "web_fetch", output_payload: {
      fetched_results: [{ url: "https://b.com/", content: "B", status: "succeeded" }],
    } }] });
  };
  const trail = recorder();
  const pages = await extract(["https://a.com/", "https://b.com/"], trail);
  assert.deepEqual(pages.map(row => row.text), ["A", "B"]);
  assert.deepEqual(requested[1].urls, ["https://b.com/"]);
  assert.equal(trail.steps[1].kind, "fetch");
});

test("monitor uses provider ID and maps poll evidence", async () => {
  globalThis.fetch = async url => url.endsWith("/poll")
    ? json({ preprocessor_runs: [run([{ url: "https://example.com/news", title: "Funding", summary: "New round" }])] })
    : json({ id: "real-monitor" });
  assert.deepEqual(await watch("Example"), { monitor_id: "real-monitor" });
  const updates = await pollWatch("real-monitor");
  assert.equal(updates[0].summary, "New round");
  assert.equal(updates[0].title, "Funding");
});

test("empty queries spend no requests and unsafe URLs are filtered", async () => {
  globalThis.fetch = async () => { throw new Error("must not be called"); };
  assert.deepEqual(await searchAll([" "], recorder()), []);
  assert.deepEqual(await extract(["javascript:alert(1)"], recorder()), []);
});

test("all failed extractions throw instead of returning fabricated text", async () => {
  globalThis.fetch = async () => new Response("", { status: 503 });
  const trail = recorder();
  await assert.rejects(extract(["https://example.com/"], trail), /No pages could be extracted/);
  assert.equal(trail.steps.length, 2);
});
