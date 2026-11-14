"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  context: string;
  trailId: string | null;
  steps: TrailStep[];
  startedAt: number;
  finishedAt: number | null;
  memo: Memo | null;
  error: string | null;
};

const EXAMPLES = ["Stripe", "Figma", "Rivian", "Duolingo"];

const PIPELINE = [
  { action: "Plan the research", detail: "Claude turns your question into targeted searches." },
  { action: "Route and retrieve", detail: "Telem routes queries. Tavily finds and reads pages." },
  { action: "Inspect the evidence", detail: "Open a citation to see the search that found it." },
];

export default function Home() {
  const [company, setCompany] = useState("");
  const [context, setContext] = useState("");
  const [depth, setDepth] = useState<Depth>("deep");
  const [run, setRun] = useState<Run | null>(null);
  const [showFeed, setShowFeed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const companyRef = useRef<HTMLInputElement>(null);
  const runStatusRef = useRef<HTMLParagraphElement>(null);

  const running = !!run && !run.memo && !run.error;

  const research = useCallback(async (name: string, d: Depth, ctx: string) => {
    const target = name.trim();
    if (!target) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setShowFeed(false);
    setRun({ company: target, depth: d, context: ctx, trailId: null, steps: [], startedAt: Date.now(), finishedAt: null, memo: null, error: null });
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
      handle(buf + dec.decode());
      if (!finished) fail("The connection closed before the memo was written. Try again.");
    } catch (e) {
      if (ac.signal.aborted) return;
      fail(errMsg(e) === "Failed to fetch" ? "Couldn't reach the Proven server. Check that it is running." : errMsg(e));
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const name = url.searchParams.get("company")?.trim();
    const requestedDepth: Depth = url.searchParams.get("depth") === "quick" ? "quick" : "deep";
    if (url.searchParams.has("depth")) setDepth(requestedDepth);
    if (name) setCompany(name);

    const timer = name && url.searchParams.get("go") === "1" ? setTimeout(() => {
      url.searchParams.delete("go");
      window.history.replaceState(null, "", url);
      void research(name, requestedDepth, "");
    }, 0) : undefined;

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [research]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!running) research(company, depth, context);
  }

  function pick(name: string) {
    setCompany(name);
    research(name, depth, context);
  }

  function reset(keepDraft = false) {
    abortRef.current?.abort();
    setRun(null);
    if (!keepDraft) {
      setCompany("");
      setContext("");
    }
    companyRef.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (running) runStatusRef.current?.focus({ preventScroll: true });
  }, [running]);

  const idle = !run;
  const stats = run ? feedStats(run.steps) : null;

  return (
    <div className="space-y-8 sm:space-y-10">
      {idle && (
        <header className="research-hero grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <h1 className="max-w-[19ch] text-balance text-[clamp(2.2rem,5.2vw,4.5rem)] font-medium leading-[1.03] tracking-[-0.04em]">
              Know what is true before you commit.
            </h1>
            <p className="mt-5 max-w-[51ch] text-pretty text-base leading-relaxed text-graphite sm:text-lg">
              Research a startup, vendor or market. Get a decision memo that shows the evidence behind every finding.
            </p>
          </div>
          <ol className="research-pipeline hidden lg:grid" aria-label="How research works">
            {PIPELINE.map(({ action, detail }) => (
              <li key={action} className="relative py-3 pl-6">
                <h2 className="text-sm font-medium text-ink">{action}</h2>
                <p className="mt-1 text-[0.8rem] leading-relaxed text-graphite">{detail}</p>
              </li>
            ))}
          </ol>
        </header>
      )}

      <section className="workspace-panel no-print overflow-hidden" aria-labelledby="workspace-title">
        <div className="flex min-h-12 items-center gap-2.5 rounded-t-[inherit] border-b border-rule bg-raised px-4 sm:px-5">
          <svg aria-hidden="true" className="size-4 text-cobalt" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h16v14H4zM4 9h16m-11 4h6m-6 3h4" />
          </svg>
          <h2 id="workspace-title" className="text-sm font-medium">{idle ? "Research workspace" : "Research request"}</h2>
          {running && (
            <button type="button" onClick={() => reset(true)} className="action-secondary ml-auto min-h-8 px-2.5 text-xs">
              Stop viewing run
            </button>
          )}
        </div>
        <div className={idle ? "grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.58fr)]" : undefined}>
          <form onSubmit={submit} className="research-form min-w-0" aria-label="Research a company">
            <label htmlFor="company" className="block text-sm font-semibold">
              Company, vendor or market
            </label>
            <div className="research-input mt-2">
              <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                id="company"
                ref={companyRef}
                readOnly={running}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Stripe"
                autoComplete="off"
                className="workspace-input w-full min-w-0 pr-3 pl-10"
              />
              <button type="submit" disabled={!company.trim() || running} className="action-primary whitespace-nowrap px-4 sm:px-6">
                {running ? "Researching…" : "Research"}
                {!running && <span className="ml-2 hidden text-white/75 sm:inline" aria-hidden="true">→</span>}
              </button>
            </div>

            <div className="mt-4 grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <label htmlFor="context" className="mb-2 block text-sm font-semibold">
                  Context <span className="font-normal text-graphite">(optional)</span>
                </label>
                <input
                  id="context"
                  readOnly={running}
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="e.g. Vendor contract"
                  className="workspace-input w-full px-3"
                />
              </div>
              <fieldset className="min-w-0" disabled={running}>
                <legend className="mb-2 text-sm font-semibold">Research depth</legend>
                <div className="grid grid-cols-2 gap-1 rounded-md border border-rule bg-paper p-0.5">
                  {(["quick", "deep"] as Depth[]).map((d) => (
                    <label key={d} className="relative cursor-pointer">
                      <input
                        className="peer sr-only"
                        type="radio"
                        name="depth"
                        value={d}
                        checked={depth === d}
                        onChange={() => setDepth(d)}
                      />
                      <span className="flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md px-2.5 text-sm font-medium text-graphite peer-checked:bg-cobalt-soft peer-checked:text-cobalt peer-focus-visible:outline-2 peer-focus-visible:outline-cobalt peer-disabled:cursor-default">
                        {d === "quick" ? "Quick" : "Deep"}
                        <span className="hidden font-normal text-graphite sm:inline">{d === "quick" ? "1 round" : "2 rounds"}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            {idle && (
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-rule-soft pt-4">
                <span className="mr-1 text-sm text-graphite">Try</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => pick(ex)}
                    className="rounded-md border border-rule px-2.5 py-1.5 text-sm font-medium transition-colors hover:border-cobalt hover:bg-cobalt-soft hover:text-cobalt"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </form>

          {idle && <RecentMemos />}
        </div>
      </section>

      <p className="sr-only" ref={runStatusRef} tabIndex={-1} role="status">
        {running ? `Research started for ${run.company}.` : run?.memo ? `Memo ready for ${run.company}.` : ""}
      </p>

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
            <ErrorBox message={run.error} onRetry={() => research(run.company, run.depth, run.context)} />
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
                <button type="button" onClick={() => setShowFeed((s) => !s)} aria-expanded={showFeed} className="text-sm font-medium text-cobalt hover:underline">
                  {showFeed ? "Hide the research feed" : "Show the research feed"}
                </button>
                <button type="button" onClick={() => reset()} className="action-secondary px-3 text-sm">
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
