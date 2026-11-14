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
  const { getBoard, rankSources, recordMemo, scoreOf, MAX_SHIFT } = await import("../lib/learn");
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

  // 6. Mock fixture is internally consistent.
  {
    const fx = fixtureBoard as EngineBoard;
    for (const e of fx.engines) {
      assert.ok(Math.abs(e.score - scoreOf(e)) < 1e-3, `fixture score for ${e.name}`);
      assert.ok(e.supported <= e.cited && e.cited <= e.returned);
    }
    assert.deepEqual(fx.engines.map((e) => e.score), [...fx.engines.map((e) => e.score)].sort((x, y) => y - x));
    ok("fixtures/engines.json: scores match the formula, sorted, supported <= cited <= returned");
  }

  console.log(`\n${passed} checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
