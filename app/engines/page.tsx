"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EngineBoard, EngineStat } from "@/lib/types";
import ErrorBox from "@/components/ErrorBox";
import { EngineDot, engineLabel, isTavily } from "@/components/engines";
import { fmtTime, timeAgo } from "@/components/http";

type State =
  | { kind: "loading" }
  | { kind: "off" } // this server has no /api/engines yet
  | { kind: "error"; message: string }
  | { kind: "ok"; board: EngineBoard };

// Counts can be fractional: a line backed by two sources splits its credit.
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");

export default function EnginesPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    fetch("/api/engines", { cache: "no-store" })
      .then(async (res) => {
        if (!live) return;
        if (res.status === 404) return setState({ kind: "off" });
        const data = (await res.json().catch(() => null)) as (EngineBoard & { error?: string }) | null;
        if (!live) return;
        if (!res.ok || !data || data.error || !Array.isArray(data.engines))
          return setState({ kind: "error", message: data?.error ?? `The server answered ${res.status}.` });
        setState({ kind: "ok", board: data });
      })
      .catch(() => live && setState({ kind: "error", message: "Couldn't reach the Proven server. Check that it is running." }));
    return () => {
      live = false;
    };
  }, [attempt]);

  return (
    <div className="space-y-10">
      <header className="max-w-[48rem]">
        <h1 className="serif text-[3.2rem] font-semibold leading-[1.04] tracking-tight">What Proven learned</h1>
        <p className="mt-4 text-[1.2rem] leading-relaxed text-graphite">
          An engine earns credit only when its page backs a verified line.
        </p>
      </header>

      {state.kind === "loading" && (
        <div aria-busy="true" aria-label="Loading what Proven learned" className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-rule-soft" />
          ))}
        </div>
      )}

      {state.kind === "error" && <ErrorBox message={state.message} onRetry={() => setAttempt((a) => a + 1)} />}

      {state.kind === "off" && (
        <Empty title="Learning isn't on for this server yet">
          This server doesn&rsquo;t answer <span className="font-mono text-[0.95em]">/api/engines</span>. Memos still cite
          and verify their sources; the engine board appears once learning is switched on.
        </Empty>
      )}

      {state.kind === "ok" && (state.board.memos === 0 || state.board.engines.length === 0) && (
        <Empty title="Nothing learned yet">
          Proven learns after each memo: for every engine it counts the results it returned, how many a memo cited, and how
          many backed a verified line. Write a memo to start the board.
        </Empty>
      )}

      {state.kind === "ok" && state.board.memos > 0 && state.board.engines.length > 0 && <Board board={state.board} />}
    </div>
  );
}

function Board({ board }: { board: EngineBoard }) {
  const engines = [...board.engines].sort((a, b) => b.score - a.score);
  const maxReturned = Math.max(1, ...engines.map((e) => e.returned));
  const maxScore = Math.max(...engines.map((e) => e.score), 0.0001);
  const total = engines.reduce(
    (t, e) => ({ returned: t.returned + e.returned, cited: t.cited + e.cited, supported: t.supported + e.supported }),
    { returned: 0, cited: 0, supported: 0 },
  );

  return (
    <>
      <dl className="tnum grid max-w-[48rem] grid-cols-2 gap-6 border-y border-rule py-5 sm:grid-cols-4">
        <BigStat label={board.memos === 1 ? "memo learned from" : "memos learned from"} value={board.memos} />
        <BigStat label="engines scored" value={engines.length} />
        <BigStat label="results backed a verified line" value={`${num(total.supported)} of ${num(total.returned)}`} />
        <BigStat
          label="updated"
          value={board.updated_at ? timeAgo(board.updated_at) : "–"}
          title={board.updated_at ? fmtTime(board.updated_at) : undefined}
        />
      </dl>

      <section aria-label="Engine leaderboard" className="border border-rule bg-surface">
        <div className="hidden grid-cols-[2.5rem_minmax(0,12rem)_minmax(0,1fr)_6.5rem_6rem] gap-6 border-b border-rule px-6 py-3 text-sm text-graphite md:grid">
          <span>Rank</span>
          <span>Engine</span>
          <span>Returned, then cited by a memo, then backed a verified line</span>
          <span className="text-right">Verified yield</span>
          <span className="text-right">Score</span>
        </div>
        <ol>
          {engines.map((e, i) => (
            <Row key={e.name} e={e} rank={i + 1} maxReturned={maxReturned} maxScore={maxScore} />
          ))}
        </ol>
      </section>

      <div className="grid max-w-[52rem] gap-3 text-graphite">
        <p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Legend className="bg-faint/45" label="returned: results that became candidate sources" />
          <Legend className="bg-cobalt" label="cited by a memo line" />
          <Legend className="bg-pursue" label="backed by an exact quote the verify pass found" />
        </p>
        <p className="leading-relaxed">
          Score is (verified + 1) / (returned + 10): the share of an engine&rsquo;s results that ended up proving a line,
          smoothed so one lucky memo can&rsquo;t top the board. Before reading pages, Proven ranks candidate sources by this
          score and by how many engines agree on them.
        </p>
        <p>
          <Link href="/" className="font-medium text-cobalt hover:underline">
            Research a company
          </Link>{" "}
          to add a memo to the board.
        </p>
      </div>
    </>
  );
}

function Row({ e, rank, maxReturned, maxScore }: { e: EngineStat; rank: number; maxReturned: number; maxScore: number }) {
  const w = (n: number) => `${Math.max(n > 0 ? 1.5 : 0, (n / maxReturned) * 100)}%`;
  return (
    <li className="grid items-center gap-3 border-b border-rule-soft px-6 py-4 last:border-b-0 md:grid-cols-[2.5rem_minmax(0,12rem)_minmax(0,1fr)_6.5rem_6rem] md:gap-6">
      <span className="tnum text-2xl font-medium text-graphite">{rank}</span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-lg font-semibold">
          <EngineDot name={e.name} size={10} />
          <span className="truncate">{engineLabel(e.name)}</span>
        </p>
        <p className="mt-0.5 text-sm text-graphite">
          {isTavily(e.name) ? "Tavily search" : "routed by Telem"}, {e.memos} {e.memos === 1 ? "memo" : "memos"}
        </p>
      </div>
      <div className="tnum grid min-w-0 gap-1.5" aria-label={`${num(e.returned)} returned, ${num(e.cited)} cited, ${num(e.supported)} verified`}>
        {[
          ["returned", e.returned, "bg-faint/45"],
          ["cited", e.cited, "bg-cobalt"],
          ["verified", e.supported, "bg-pursue"],
        ].map(([label, n, color]) => (
          <div key={label as string} className="grid grid-cols-[4.5rem_minmax(0,1fr)_3rem] items-center gap-3 text-sm">
            <span className="text-graphite">{label}</span>
            <div className="h-[7px] bg-rule-soft">
              <div className={`bar-in h-full ${color}`} style={{ width: w(n as number) }} />
            </div>
            <span className="text-right font-medium">{num(n as number)}</span>
          </div>
        ))}
      </div>
      <p className="tnum text-right">
        <span className="text-xl font-medium">{pct(e.supported, e.returned)}</span>
        <span className="block text-sm text-graphite">of results</span>
      </p>
      <div className="tnum text-right">
        <p className="text-xl font-semibold">{e.score.toFixed(2)}</p>
        <div className="ml-auto mt-1.5 h-[3px] w-full max-w-[5rem] bg-rule-soft">
          <div className="h-full bg-ink" style={{ width: `${(e.score / maxScore) * 100}%` }} />
        </div>
      </div>
    </li>
  );
}

function BigStat({ label, value, title }: { label: string; value: number | string; title?: string }) {
  return (
    <div className="flex flex-col-reverse" title={title}>
      <dt className="mt-1.5 text-sm text-graphite">{label}</dt>
      <dd className="text-3xl font-medium leading-none">{value}</dd>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className={`inline-block h-[7px] w-4 ${className}`} />
      {label}
    </span>
  );
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="max-w-[44rem] border border-rule bg-surface px-7 py-6">
      <h2 className="serif text-2xl font-semibold">{title}</h2>
      <p className="mt-2 leading-relaxed text-graphite">{children}</p>
      <Link href="/" className="mt-5 inline-block bg-ink px-5 py-2.5 font-semibold text-white hover:bg-cobalt">
        Research a company
      </Link>
    </div>
  );
}
