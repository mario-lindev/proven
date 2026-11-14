"use client";

import { useEffect, useRef, useState } from "react";
import type { Memo, MemoEvent, TrailStep } from "@/lib/types";
import ErrorBox from "@/components/ErrorBox";
import MemoView from "@/components/MemoView";
import RecentMemos from "@/components/RecentMemos";
import ResearchFeed, { feedStats } from "@/components/ResearchFeed";
import { errMsg, fmtMs } from "@/components/http";

type Depth = "quick" | "deep";

type Run = {
  company: string;
  depth: Depth;
  trailId: string | null;
  steps: TrailStep[];
  startedAt: number;
  finishedAt: number | null;
  memo: Memo | null;
  error: string | null;
};

const EXAMPLES = ["Stripe", "Figma", "Rivian", "Duolingo"];

export default function Home() {
  const [company, setCompany] = useState("");
  const [context, setContext] = useState("");
  const [depth, setDepth] = useState<Depth>("deep");
  const [run, setRun] = useState<Run | null>(null);
  const [showFeed, setShowFeed] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const deepLinked = useRef(false);

  const running = !!run && !run.memo && !run.error;

  async function research(name: string, d: Depth, ctx: string) {
    const target = name.trim();
    if (!target) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setShowFeed(false);
    setRun({ company: target, depth: d, trailId: null, steps: [], startedAt: Date.now(), finishedAt: null, memo: null, error: null });
    const patch = (f: (r: Run) => Run) => setRun((r) => (r && !ac.signal.aborted ? f(r) : r));
    const fail = (error: string) => patch((r) => ({ ...r, error, finishedAt: Date.now() }));

    try {
      const res = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: target, context: ctx.trim() || undefined, depth: d, stream: true }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        let msg = `The server answered ${res.status}.`;
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch {}
        return fail(msg);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let finished = false;
      const handle = (line: string) => {
        if (!line.trim()) return;
        let ev: MemoEvent;
        try {
          ev = JSON.parse(line) as MemoEvent;
        } catch {
          return;
        }
        if (ev.type === "start") patch((r) => ({ ...r, trailId: ev.trail_id }));
        else if (ev.type === "step") patch((r) => ({ ...r, steps: [...r.steps, ev.step] }));
        else if (ev.type === "memo") {
          finished = true;
          patch((r) => ({ ...r, memo: ev.memo, finishedAt: Date.now() }));
          setHistoryKey((k) => k + 1);
        } else if (ev.type === "error") {
          finished = true;
          fail(ev.error);
        }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          handle(buf.slice(0, i));
          buf = buf.slice(i + 1);
        }
      }
      handle(buf);
      if (!finished) fail("The connection closed before the memo was written. Try again.");
    } catch (e) {
      if (ac.signal.aborted) return;
      fail(errMsg(e) === "Failed to fetch" ? "Couldn't reach the Proven server. Check that it is running." : errMsg(e));
    }
  }

  // Deep link from the Chrome extension: /?company=X&depth=quick|deep&go=1
  useEffect(() => {
    if (deepLinked.current) return;
    deepLinked.current = true;
    const q = new URLSearchParams(window.location.search);
    const c = q.get("company")?.trim();
    const d: Depth = q.get("depth") === "quick" ? "quick" : "deep";
    if (q.get("depth")) setDepth(d);
    if (c) {
      setCompany(c);
      if (q.get("go") === "1") research(c, d, "");
    }
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!running) research(company, depth, context);
  }

  function pick(name: string) {
    setCompany(name);
    research(name, depth, context);
  }

  function reset() {
    abortRef.current?.abort();
    setRun(null);
    setCompany("");
    setContext("");
  }

  const idle = !run;
  const stats = run ? feedStats(run.steps) : null;

  return (
    <div className="space-y-10">
      {idle && (
        <div className="max-w-[52rem] pt-6">
          <h1 className="serif text-[3.6rem] font-semibold leading-[1.04] tracking-tight md:text-[4.4rem]">
            Know what is true before you commit.
          </h1>
          <p className="mt-5 max-w-[40rem] text-[1.2rem] leading-relaxed text-graphite">
            Name a startup, vendor or market. Telem routes each search to the engines that fit it, Tavily reads the
            pages, and Claude writes a one-page memo where every line cites its source.
          </p>
        </div>
      )}

      <form onSubmit={submit} className={`no-print ${idle ? "max-w-[52rem]" : ""}`} aria-label="Research a company">
        <div className={`flex border-2 bg-surface transition-colors focus-within:border-cobalt ${idle ? "border-ink" : "border-rule"}`}>
          <label htmlFor="company" className="sr-only">
            Company, vendor or market
          </label>
          <input
            id="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company, vendor or market"
            autoFocus={idle}
            autoComplete="off"
            className={`serif min-w-0 flex-1 bg-transparent px-5 outline-none placeholder:text-faint focus-visible:outline-none ${
              idle ? "py-4 text-[1.9rem]" : "py-2.5 text-[1.4rem]"
            }`}
          />
          <button
            type="submit"
            disabled={!company.trim() || running}
            className={`shrink-0 bg-ink font-semibold text-white hover:bg-cobalt disabled:bg-faint ${idle ? "px-9 text-xl" : "px-6 text-lg"}`}
          >
            {running ? "Researching" : "Research"}
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label htmlFor="context" className="sr-only">
            Context, optional
          </label>
          <input
            id="context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Context, optional: what you are deciding, e.g. a Series B or a vendor contract"
            className="min-w-0 flex-1 border border-rule bg-surface px-4 py-2.5 outline-none placeholder:text-faint focus:border-cobalt"
          />
          <div role="radiogroup" aria-label="Research depth" className="flex shrink-0 border border-rule bg-surface p-1">
            {(["quick", "deep"] as Depth[]).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={depth === d}
                onClick={() => setDepth(d)}
                disabled={running}
                className={`px-4 py-1.5 text-left font-medium ${depth === d ? "bg-ink text-white" : "text-graphite hover:text-ink"}`}
              >
                {d === "quick" ? "Quick" : "Deep"}
                <span className={`ml-2 text-sm font-normal ${depth === d ? "text-white/70" : "text-faint"}`}>
                  {d === "quick" ? "1 round" : "2 rounds"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {idle && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-graphite">Try</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => pick(ex)}
                className="serif border border-rule bg-surface px-4 py-1.5 text-[1.05rem] hover:border-ink"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </form>

      {idle && (
        <div className="grid gap-12 border-t border-rule pt-10 lg:grid-cols-[minmax(0,1fr)_26rem]">
          <ol className="grid gap-8 sm:grid-cols-3">
            {[
              ["Plan", "Claude breaks the question into searches: funding, rivals, hiring, lawsuits, sentiment."],
              ["Route", "Telem sends each query to the engines best suited to it, including LinkedIn, X and Trustpilot."],
              ["Prove", "The memo keeps only lines with a source. Open the trail to see every search behind it."],
            ].map(([t, d], i) => (
              <li key={t}>
                <p className="tnum text-sm text-graphite">Step {i + 1}</p>
                <h3 className="serif mt-1 text-2xl font-semibold">{t}</h3>
                <p className="mt-2 leading-relaxed text-graphite">{d}</p>
              </li>
            ))}
          </ol>
          <RecentMemos refreshKey={historyKey} />
        </div>
      )}

      {run && (
        <>
          {(!run.memo || showFeed) && (
            <ResearchFeed
              company={run.company}
              depth={run.depth}
              steps={run.steps}
              startedAt={run.startedAt}
              finishedAt={run.finishedAt}
              failed={!!run.error}
            />
          )}

          {run.error && (
            <ErrorBox message={run.error} onRetry={() => research(run.company, run.depth, context)} />
          )}

          {run.memo && stats && (
            <div className="no-print flex flex-wrap items-center justify-between gap-4 border-y border-rule py-3 text-graphite">
              <p>
                Researched in{" "}
                <span className="tnum font-medium text-ink">{fmtMs((run.finishedAt ?? Date.now()) - run.startedAt)}</span>:{" "}
                <span className="tnum font-medium text-ink">{stats.queries}</span> queries,{" "}
                <span className="tnum font-medium text-ink">{stats.engines.size}</span> engines,{" "}
                <span className="tnum font-medium text-ink">{stats.urls}</span> pages found.
              </p>
              <div className="flex gap-4">
                <button type="button" onClick={() => setShowFeed((s) => !s)} className="font-medium text-cobalt hover:underline">
                  {showFeed ? "Hide the research feed" : "Show the research feed"}
                </button>
                <button type="button" onClick={reset} className="font-medium text-ink hover:underline">
                  New research
                </button>
              </div>
            </div>
          )}

          {run.memo && (
            <MemoView
              key={run.memo.id}
              memo={run.memo}
              trail={run.trailId ? { id: run.trailId, steps: run.steps } : null}
            />
          )}
        </>
      )}
    </div>
  );
}
