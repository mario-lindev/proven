"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Memo, MemoEvent, TrailStep } from "@/lib/types";
import ErrorBox from "@/components/ErrorBox";
import MemoView from "@/components/MemoView";
import Landing, { type Numbers } from "@/components/home/Landing";
import ResearchFeed, { feedStats } from "@/components/ResearchFeed";
import { errMsg, fmtMs } from "@/components/http";
import RouteScene, { GEO } from "@/components/ascii/RouteScene";

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

const ENTRIES = [
  { href: "/run", title: "Run everything", note: "audit, memo and watch at once" },
  { href: "/audit", title: "Pitch Audit", note: "check a company's own claims" },
  { href: "/impact", title: "Event Impact", note: "what one event changes" },
  { href: "/live", title: "Live Room", note: "claims checked as they are spoken" },
];


export default function Home() {
  const [company, setCompany] = useState("");
  const [context, setContext] = useState("");
  const [depth, setDepth] = useState<Depth>("deep");
  const [run, setRun] = useState<Run | null>(null);
  const [showFeed, setShowFeed] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const deepLinked = useRef(false);
  const [numbers, setNumbers] = useState<Numbers | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/telem", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ready?: boolean; queries?: number; engines?: unknown[]; proof?: { verified?: number; via_telem?: number } }) => {
        if (!d.ready || !d.queries) return;
        const v = d.proof?.verified ?? 0;
        const base: Numbers = {
          queries: d.queries,
          engines: d.engines?.length ?? 0,
          pct: v > 0 ? Math.round(((d.proof?.via_telem ?? 0) / v) * 100) : null,
          memos: null,
          verified: v > 0 ? Math.round(v) : null,
        };
        setNumbers(base);
        fetch("/api/engines", { cache: "no-store" })
          .then((r) => r.json())
          .then((b: { memos?: number }) => typeof b.memos === "number" && b.memos > 0 && setNumbers({ ...base, memos: b.memos }))
          .catch(() => {});
      })
      .catch(() => {});
  }, []);

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

  // Stop: drop the stream and go back to the form; the typed company stays.
  function stop() {
    abortRef.current?.abort();
    setRun(null);
  }

  function reset() {
    abortRef.current?.abort();
    setRun(null);
    setCompany("");
    setContext("");
  }

  const idle = !run;
  const stats = run ? feedStats(run.steps) : null;

  const form = (
    <form onSubmit={submit} className={`no-print ${idle ? "max-w-[46rem]" : ""}`} aria-label="Research a company">
      <div className={`field flex overflow-hidden ${idle ? "p-1.5 shadow-[0_10px_30px_-18px_#263c5955]" : "p-1"}`}>
        <label htmlFor="company" className="sr-only">
          Company, vendor or market
        </label>
        <input
          id="company"
          ref={inputRef}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company, vendor or market"
          autoFocus={idle}
          autoComplete="off"
          className={`serif min-w-0 flex-1 bg-transparent px-5 outline-none placeholder:text-faint focus-visible:outline-none ${
            idle ? "py-3 text-[1.75rem]" : "py-2 text-[1.35rem]"
          }`}
        />
        <button
          type={running ? "button" : "submit"}
          onClick={running ? stop : undefined}
          disabled={!running && !company.trim()}
          className={`btn btn-primary shrink-0 ${idle ? "px-8 text-lg" : "px-6"}`}
        >
          {running ? "Stop" : "Research"}
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
          className="field min-w-0 flex-1 px-4 py-2.5 outline-none placeholder:text-faint"
        />
        <div role="radiogroup" aria-label="Research depth" className="field flex shrink-0 gap-1 p-1">
          {(["quick", "deep"] as Depth[]).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={depth === d}
              onClick={() => setDepth(d)}
              disabled={running}
              className={`rounded-md px-4 py-1.5 text-left font-medium transition-colors ${depth === d ? "bg-ink text-white" : "text-graphite hover:text-ink"}`}
            >
              {d === "quick" ? "Quick" : "Deep"}
              <span className={`ml-2 text-sm font-normal ${depth === d ? "text-white/70" : "text-faint"}`}>
                {d === "quick" ? "1 round" : "until proven"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {idle && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-sm text-graphite">Try</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => pick(ex)}
              className="serif rounded-lg border border-rule bg-surface px-4 py-1.5 text-[1.05rem] transition-colors hover:border-cobalt hover:text-cobalt"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </form>
  );

  return (
    <div className="space-y-10">
      {idle && (
        <section className="relative -mt-10 pb-4 pt-16">
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2">
            <div className="hero-scene absolute inset-0">
              <RouteScene />
            </div>
            <div className="absolute inset-0 hidden font-mono text-[0.7rem] uppercase tracking-[0.14em] text-graphite lg:block" aria-hidden>
              <span className="absolute -translate-x-1/2" style={{ left: `${GEO.rx * 100}%`, top: `calc(${GEO.ry * 100}% + 72px)` }}>
                Telem routes
              </span>
              <span className="absolute -translate-x-1/2" style={{ left: `${GEO.lanes[1] * 100}%`, top: `calc(${GEO.floor * 100}% + 20px)` }}>
                Proven keeps
              </span>
            </div>
          </div>

          <div className="relative max-w-[46rem]">
            <h1 className="display rise-in max-w-[40rem] text-[4rem] md:text-[4.6rem]">
              A search engine gives you links. <span className="text-cobalt">Proven gives you a verdict.</span>
            </h1>
            <p className="rise-in mt-6 max-w-[38rem] text-[1.15rem] leading-relaxed text-graphite" style={{ animationDelay: "90ms" }}>
              It keeps searching until the questions an investor must answer are answered, then keeps only the lines it can
              quote from the page they came from.
            </p>
            <div className="rise-in mt-9" style={{ animationDelay: "180ms" }}>
              {form}
            </div>

            <nav aria-label="Other ways in" className="rise-in mt-10 grid max-w-[46rem] grid-cols-2 gap-2 sm:grid-cols-4" style={{ animationDelay: "270ms" }}>
              {ENTRIES.map((e) => (
                <Link
                  key={e.href}
                  href={e.href}
                  className="group rounded-lg border border-rule bg-surface px-3.5 py-3 transition-colors hover:border-cobalt"
                >
                  <span className="flex items-center justify-between font-medium text-ink group-hover:text-cobalt">
                    {e.title}
                    <span className="font-mono text-faint transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-cobalt">
                      &rarr;
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[0.8rem] leading-snug text-graphite">{e.note}</span>
                </Link>
              ))}
            </nav>

            {numbers && (
              <p className="tnum mt-6 font-mono text-[0.8rem] text-graphite">
                <span className="text-ink">{numbers.queries}</span> questions routed across{" "}
                <span className="text-ink">{numbers.engines}</span> engines
                {numbers.pct !== null && (
                  <>
                    <span className="mx-2 text-faint">/</span>
                    <span className="text-rust">{numbers.pct}%</span> of verified proof came from engines Telem chose
                  </>
                )}
              </p>
            )}
          </div>
        </section>
      )}

      {!idle && form}

      {idle && (
        <Landing
          numbers={numbers}
          refreshKey={historyKey}
          onStart={() => {
            window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
            inputRef.current?.focus({ preventScroll: true });
          }}
        />
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
