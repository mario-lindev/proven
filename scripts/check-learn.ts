// Offline checks for lib/learn.ts: npx tsx scripts/check-learn.ts
// Synthetic memos only; runs in a temp dir so the real .data/engines.json is never touched.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EngineBoard, Evidence, Line, Memo, Source, TrailRecorder, TrailStep } from "../lib/types";
import fixtureBoard from "../fixtures/engines.json";

let passed = 0;
const ok = (name: string) => {
  passed++;
  console.log(`ok  ${name}`);
};

const recorder = () => {
  const steps: Omit<TrailStep, "at">[] = [];
  const trail: TrailRecorder = { id: "tr_check", step: (s) => steps.push(s) };
  return { trail, steps };
};

const src = (id: string, engine: string, url = `https://${engine}.example.com/${id}`): Source => ({
  id, url, title: `${engine} ${id}`, engine, snippet: "",
});

const line = (source_ids: string[], evidence?: Evidence[]): Line => ({ text: "a line", source_ids, ...(evidence ? { evidence } : {}) });

const memoOf = (sources: Source[], facts: Line[], risks: Line[], verified: boolean): Memo => {
  const used = new Set([...facts, ...risks].flatMap((l) => l.source_ids));
  return {
    id: "memo_check", company: "Acme", verdict: "dig_deeper", confidence: 0.5, summary: "",
    facts, risks, open_questions: [],
    sources: sources.filter((s) => used.has(s.id)),
    trail_id: "tr_check", created_at: new Date().toISOString(),
    ...(verified ? { verification: { checked: facts.length + risks.length, kept: facts.length + risks.length, dropped: 0, ms: 1 } } : {}),
  };
};

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "proven-learn-"));
  process.chdir(dir);
  delete process.env.VERCEL;
  const { getBoard, rankSources, recordMemo, scoreOf, MAX_SHIFT, provenEngines, queryHints, generalize } = await import("../lib/learn");
  const file = join(dir, ".data", "engines.json");
  const g = globalThis as unknown as { __provenEngines?: EngineBoard };

  // 1. Empty board: nothing seeded, ranking leaves the input alone and says so.
  {
    const b = getBoard();
    assert.deepEqual(b.engines, []);
    assert.equal(b.memos, 0);
    const input = [src("s1", "brave"), src("s2", "exa"), src("s3", "tavily")];
    const { trail, steps } = recorder();
    const out = rankSources(input, trail);
    assert.equal(out, input);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].kind, "learn");
    assert.equal(steps[0].label, "Ranked 3 sources by consensus; nothing learned yet");
    assert.equal(existsSync(file), false);
    assert.deepEqual(provenEngines(), []);
    assert.deepEqual(provenEngines("people_profiles"), []);
    assert.deepEqual(queryHints(), []);
    ok("empty board: no engines, rankSources returns input unchanged and records a learn step");
  }

  // 2. Verified memo: scores, partial credit (0.5), max credit per source, URL dedupe.
  const cands = [
    src("s1", "exa"), src("s2", "brave"), src("s3", "exa"), src("s4", "brave"), src("s5", "exa"),
    src("s6", "brave"), src("s7", "exa"), src("s8", "tavily"), src("s9", "tavily"),
    src("s10", "exa", "https://www.exa.example.com/s7/"), // same page as s7 -> counted once
  ];
  {
    const facts = [
      line(["s1", "s3"], [{ source_id: "s1", quote: "q", verdict: "supported" }, { source_id: "s3", quote: "q", verdict: "partial" }]),
      line(["s1", "s5"], [{ source_id: "s1", quote: "q", verdict: "partial" }]), // s1 already supported: stays 1
      line(["s8"], [{ source_id: "s8", quote: "q", verdict: "supported" }]),
    ];
    const risks = [line(["s2"])]; // cited, no quote
    const { trail, steps } = recorder();
    const b = recordMemo(memoOf(cands, facts, risks, true), cands, trail);
    const by = Object.fromEntries(b.engines.map((e) => [e.name, e]));
    assert.equal(b.memos, 1);
    assert.deepEqual(
      { ...by.exa, score: undefined },
      { name: "exa", memos: 1, returned: 4, cited: 3, supported: 1.5, score: undefined },
    );
    assert.deepEqual({ ...by.brave, score: undefined }, { name: "brave", memos: 1, returned: 3, cited: 1, supported: 0, score: undefined });
    assert.deepEqual({ ...by.tavily, score: undefined }, { name: "tavily", memos: 1, returned: 2, cited: 1, supported: 1, score: undefined });
    assert.ok(Math.abs(by.exa.score - 2.5 / 14) < 1e-4);
    assert.ok(Math.abs(by.brave.score - 1 / 13) < 1e-4);
    assert.ok(Math.abs(by.tavily.score - 2 / 12) < 1e-4);
    assert.deepEqual(b.engines.map((e) => e.name), ["exa", "tavily", "brave"]);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].kind, "learn");
    assert.equal(steps[0].label, "Learned from this memo: exa 1.5/3 verified, tavily 1/1 verified, brave 0/1 verified");
    ok("verified memo: returned/cited/supported per engine, partial = 0.5, one credit per source, dedupe by URL, sorted by score");
  }

  // 3. Memo without verification: citation credit only, even if evidence is present.
  {
    const facts = [line(["s3"], [{ source_id: "s3", quote: "q", verdict: "supported" }])];
    const extra = [...cands, src("s11", "you")]; // an engine nobody cited
    const { trail, steps } = recorder();
    const b = recordMemo(memoOf(extra, facts, [], false), extra, trail);
    const by = Object.fromEntries(b.engines.map((e) => [e.name, e]));
    assert.equal(b.memos, 2);
    assert.equal(by.exa.memos, 2);
    assert.equal(by.exa.returned, 8);
    assert.equal(by.exa.cited, 4);
    assert.equal(by.exa.supported, 1.5);
    assert.deepEqual({ ...by.you, score: undefined }, { name: "you", memos: 1, returned: 1, cited: 0, supported: 0, score: undefined });
    assert.equal(steps[0].label, "Learned from this memo (not verified, citations only): exa 1 cited, 3 more engines cited nothing");
    ok("unverified memo: cited counts, no supported credit; uncited engines still count returned and memos");
  }

  // 4. Persistence round-trip: drop memory, the board comes back from .data/engines.json.
  {
    const before = getBoard();
    assert.ok(existsSync(file));
    delete g.__provenEngines;
    assert.deepEqual(getBoard(), before);
    // Another process (warm-cache script) wrote a newer board: it wins over memory.
    const newer: EngineBoard = { ...before, memos: before.memos + 1, updated_at: new Date(Date.now() + 60_000).toISOString() };
    writeFileSync(file, JSON.stringify(newer));
    assert.equal(getBoard().memos, before.memos + 1);
    // Disk lost (e.g. /tmp wiped): memory still has it.
    unlinkSync(file);
    assert.equal(getBoard().memos, before.memos + 1);
    writeFileSync(file, JSON.stringify(before)); // older than memory: memory wins
    assert.equal(getBoard().memos, before.memos + 1);
    writeFileSync(file, JSON.stringify(newer));
    const saved = JSON.parse(readFileSync(file, "utf8")) as EngineBoard;
    assert.equal(saved.engines.length, 4);
    ok("persistence: round-trip through .data/engines.json; newest of disk and memory wins; memory survives a lost file");
  }

  // 5. Ranking with history.
  {
    // Engines the board has never seen all get the prior score -> order unchanged, ids s1..sN.
    const unseen = [src("x9", "parallel"), src("x3", "seltz"), src("x1", "parallel"), src("x7", "ceramic")];
    const { trail, steps } = recorder();
    const out = rankSources(unseen, trail);
    assert.deepEqual(out.map((s) => s.url), unseen.map((s) => s.url));
    assert.deepEqual(out.map((s) => s.id), ["s1", "s2", "s3", "s4"]);
    assert.equal(steps[0].kind, "learn");
    assert.equal(steps[0].label, `Ranked 4 sources with what Proven learned from ${getBoard().memos} memos`);
    ok("ranking: equal scores keep the consensus order and re-id s1..sN");
  }
  {
    // A board where exa is clearly better than brave; interleaved brave/exa candidates.
    const board: EngineBoard = {
      engines: [
        { name: "exa", memos: 5, returned: 40, cited: 20, supported: 18, score: scoreOf({ supported: 18, returned: 40 }) },
        { name: "brave", memos: 5, returned: 40, cited: 6, supported: 1, score: scoreOf({ supported: 1, returned: 40 }) },
      ],
      memos: 5,
      updated_at: new Date(Date.now() + 120_000).toISOString(),
    };
    writeFileSync(file, JSON.stringify(board));
    const list = Array.from({ length: 20 }, (_, i) => src(`s${i + 1}`, i % 2 === 0 ? "brave" : "exa"));
    const a = rankSources(list, recorder().trail);
    const b = rankSources(list, recorder().trail);
    assert.deepEqual(a, b);
    assert.deepEqual(new Set(a.map((s) => s.url)), new Set(list.map((s) => s.url)));
    assert.deepEqual(a.map((s) => s.id), list.map((_, i) => `s${i + 1}`));
    const oldPos = new Map(list.map((s, i) => [s.url, i]));
    a.forEach((s, i) => assert.ok(Math.abs(i - oldPos.get(s.url)!) <= 2 * MAX_SHIFT, `moved too far: ${s.url}`));
    const topExa = (xs: Source[]) => xs.slice(0, 6).filter((s) => s.engine === "exa").length;
    assert.ok(topExa(a) > topExa(list), "exa should gain places in the top 6");
    // Within one engine, consensus order is kept.
    const exaUrls = (xs: Source[]) => xs.filter((s) => s.engine === "exa").map((s) => s.url);
    assert.deepEqual(exaUrls(a), exaUrls(list));
    // Consensus still dominates: a source far down stays far down.
    assert.ok(a.findIndex((s) => s.url === list[19].url) >= 19 - 2 * MAX_SHIFT);
    ok(`ranking: better engine gains places (top-6 exa ${topExa(list)} -> ${topExa(a)}), deterministic, no move > ${2 * MAX_SHIFT}`);
  }

  // 7. The loop: topic x engine memory, steer selection, query hints, efficiency history.
  {
    // An old-shape board (no topics / queries / history) on disk still loads and is extended in place.
    const old: EngineBoard = {
      engines: [{ name: "exa", memos: 1, returned: 4, cited: 1, supported: 1, score: scoreOf({ supported: 1, returned: 4 }) }],
      memos: 1,
      updated_at: new Date(Date.now() + 180_000).toISOString(),
    };
    writeFileSync(file, JSON.stringify(old));
    assert.equal(getBoard().topics, undefined);
    assert.deepEqual(provenEngines(), [], "4 results on record is below the bar");
    assert.deepEqual(queryHints(), []);

    const c = [
      src("s1", "exa", "https://a.com/1"), src("s2", "exa", "https://a.com/2"), src("s3", "brave", "https://b.com/1"),
      src("s4", "apify_linkedin", "https://linkedin.com/in/x"), src("s5", "tavily", "https://t.com/1"), src("s6", "brave", "https://b.com/2"),
    ];
    const facts = [
      line(["s1"], [{ source_id: "s1", quote: "q", verdict: "supported" }]),
      line(["s2"], [{ source_id: "s2", quote: "q", verdict: "partial" }]),
      line(["s4"], [{ source_id: "s4", quote: "q", verdict: "supported" }]),
      line(["s5"], [{ source_id: "s5", quote: "q", verdict: "supported" }]),
    ];
    const risks = [line(["s3"])]; // cited, never verified
    const eng = (name: string, n_results: number) => ({ name, latency_ms: 1, n_results });
    const steps: TrailStep[] = [
      { kind: "search", label: "Search: Acme funding", query: "Acme funding round", topic: "company_research", at: "", ms: 1,
        engines: [eng("exa", 5), eng("exa", 3), eng("brave", 5), eng("tavily", 5), { ...eng("telem_platforms", 0), error: "x" }],
        urls: ["https://a.com/1", "https://www.a.com/2/", "https://b.com/1", "https://t.com/1"] },
      { kind: "search", label: "Search: Acme founders", query: "acme founders background", topic: "people_profiles", at: "", ms: 1,
        engines: [eng("apify_linkedin", 5), eng("brave", 5)], urls: ["https://linkedin.com/in/x", "https://b.com/2"] },
      { kind: "search", label: "Search: Acme lawsuits", query: "Acme lawsuits", at: "", ms: 1, engines: [eng("brave", 5)], urls: ["https://b.com/3"] },
      { kind: "extract", label: "Extract", at: "", ms: 1, urls: ["https://a.com/1", "https://b.com/1", "https://t.com/1"] },
    ];
    const { trail, steps: rec } = recorder();
    const b = recordMemo(memoOf(c, facts, risks, true), c, trail, steps);

    // topic memory: returned per engine (largest batch once), supported credited to the verified source's engine
    const cr = Object.fromEntries(b.topics!.company_research.map((e) => [e.name, e]));
    assert.deepEqual({ ...cr.exa, score: 0 }, { name: "exa", memos: 1, returned: 5, cited: 2, supported: 1.5, score: 0 });
    assert.deepEqual({ ...cr.brave, score: 0 }, { name: "brave", memos: 1, returned: 5, cited: 0, supported: 0, score: 0 });
    assert.deepEqual({ ...cr.tavily, score: 0 }, { name: "tavily", memos: 1, returned: 5, cited: 1, supported: 1, score: 0 });
    assert.equal(cr.telem_platforms, undefined);
    assert.deepEqual(b.topics!.company_research.map((e) => e.name), ["exa", "tavily", "brave"]);
    assert.deepEqual(b.topics!.people_profiles.map((e) => [e.name, e.returned, e.supported]), [["apify_linkedin", 5, 1], ["brave", 5, 0]]);
    assert.deepEqual(Object.keys(b.topics!).sort(), ["company_research", "people_profiles"]);

    // steer selection: per topic, then overall; tavily is never pinnable; unknown topic falls back to the board
    assert.deepEqual(provenEngines("company_research"), ["exa"]);
    assert.deepEqual(provenEngines("people_profiles"), ["apify_linkedin"]);
    assert.deepEqual(provenEngines("{company} founders background"), ["apify_linkedin"], "a query seen before maps to its topic");
    assert.deepEqual(provenEngines(), ["exa"], "exa 6 returned 2.5 verified; linkedin has only 1 result overall; brave proved nothing");
    assert.deepEqual(provenEngines("never_seen_topic"), provenEngines());

    // query memory: company generalized out, only queries with a verified source, best first
    assert.deepEqual(b.queries, [
      { pattern: "{company} funding round", verified: 3, memos: 1, topic: "company_research" },
      { pattern: "{company} founders background", verified: 1, memos: 1, topic: "people_profiles" },
    ]);
    assert.deepEqual(queryHints(), ["{company} funding round", "{company} founders background"]);
    assert.equal(generalize("Is  ACME (Acme) hiring?", "Acme"), "Is {company} ({company}) hiring?");
    assert.equal(generalize("C++ jobs at a.b", "a.b"), "C++ jobs at {company}");

    // efficiency history
    assert.equal(b.history!.length, 1);
    assert.deepEqual({ ...b.history![0], at: "" }, { at: "", company: "Acme", search_calls: 3, verified_lines: 4, sources_read: 3, yield: 1.3333 });
    assert.equal(rec.length, 2);
    assert.equal(rec[1].label, "Efficiency: 4 verified lines from 3 searches (1.3 per search); follow-up searches now steer to exa");

    // persisted with the board; a second memo accumulates; history is capped at 50
    delete g.__provenEngines;
    assert.deepEqual(getBoard().topics, b.topics);
    let last = b;
    for (let i = 0; i < 52; i++) last = recordMemo(memoOf(c, facts, risks, true), c, recorder().trail, steps);
    assert.equal(last.history!.length, 50);
    assert.equal(last.topics!.company_research.find((e) => e.name === "exa")!.returned, 5 * 53);
    assert.equal(last.queries![0].memos, 53);
    // without trail steps the board still learns, the loop memory is left as it was
    const kept = recordMemo(memoOf(c, facts, risks, true), c, recorder().trail);
    assert.deepEqual(kept.history, last.history);
    assert.deepEqual(kept.topics, last.topics);
    ok("loop: old board loads; topic x engine yield, provenEngines per topic and overall, query hints, yield history (capped), persisted");
  }

  // 6. Mock fixture is internally consistent.
  {
    const fx = fixtureBoard as EngineBoard;
    for (const e of fx.engines) {
      assert.ok(Math.abs(e.score - scoreOf(e)) < 1e-3, `fixture score for ${e.name}`);
      assert.ok(e.supported <= e.cited && e.cited <= e.returned);
    }
    assert.deepEqual(fx.engines.map((e) => e.score), [...fx.engines.map((e) => e.score)].sort((x, y) => y - x));
    for (const rows of Object.values(fx.topics ?? {})) for (const e of rows) assert.ok(Math.abs(e.score - scoreOf(e)) < 1e-3, `fixture topic score for ${e.name}`);
    for (const h of fx.history ?? []) assert.ok(Math.abs(h.yield - h.verified_lines / h.search_calls) < 1e-3);
    ok("fixtures/engines.json: scores match the formula, sorted, supported <= cited <= returned");
  }

  console.log(`\n${passed} checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
