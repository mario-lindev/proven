"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EngineBoard, EngineStat, MemoYield } from "@/lib/types";
import ErrorBox from "@/components/ErrorBox";
import { StreamBand } from "@/components/flow/Ascii";
import PageHeader from "@/components/flow/PageHeader";
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
      <PageHeader title="What Proven learned" lede="An engine earns credit only when its page backs a verified line.">
        <StreamBand mode="merge" streams={5} phase={state.kind === "ok" ? "done" : "idle"} label="Many engines narrowing to the few that prove out" className="h-28" />
      </PageHeader>

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

      <section aria-label="Engine leaderboard" className="overflow-hidden rounded-[8px] border border-rule bg-surface">
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

      <Loop board={board} />

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

// The closed loop: what the proof taught Proven about where to search next, and whether research is getting cheaper.
function Loop({ board }: { board: EngineBoard }) {
  const history = board.history ?? [];
  const topics = Object.entries(board.topics ?? {})
    .map(([topic, rows]) => ({ topic, rows: [...rows].sort((a, b) => b.score - a.score), returned: rows.reduce((t, e) => t + e.returned, 0) }))
    .sort((a, b) => b.returned - a.returned);
  const hints = board.hints ?? [];

  return (
    <>
      <section aria-label="Verified lines per search" className="overflow-hidden rounded-[8px] border border-rule bg-surface px-6 py-5">
        <h2 className="serif text-[1.9rem] font-semibold">Verified lines per search, memo by memo</h2>
        <p className="mt-1 max-w-[46rem] text-graphite">
          Each memo&rsquo;s kept, quote-backed lines divided by the searches it ran. If the loop works, this climbs: the
          same number of searches proves more.
        </p>
        {history.length === 0 ? (
          <p className="mt-4 text-graphite">No memo has been measured yet. The next memo adds the first point.</p>
        ) : (
          <>
            <YieldChart history={history} />
            {history.length < 3 && (
              <p className="mt-3 text-sm text-graphite">
                {history.length} {history.length === 1 ? "memo" : "memos"} measured so far. A trend isn&rsquo;t meaningful
                until there are at least 3.
              </p>
            )}
          </>
        )}
      </section>

      <section aria-label="What proves out, by kind of question" className="overflow-hidden rounded-[8px] border border-rule bg-surface">
        <div className="border-b border-rule px-6 py-5">
          <h2 className="serif text-[1.9rem] font-semibold">Which engines prove out, by kind of question</h2>
          <p className="mt-1 max-w-[46rem] text-graphite">
            Telem labels every query with a topic. Proven remembers, per topic, whose results ended up backing a verified
            line, and pins follow-up searches to the engines that proved out.
          </p>
        </div>
        {topics.length === 0 ? (
          <p className="px-6 py-5 text-graphite">No topics learned yet. They appear after a memo whose searches Telem routed.</p>
        ) : (
          <ul>
            {topics.map(({ topic, rows }) => {
              const proven = provenOf(rows);
              return (
                <li key={topic} className="grid gap-3 border-b border-rule-soft px-6 py-4 last:border-b-0 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-6">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[0.95rem] font-semibold">{topic}</p>
                    <p className="mt-1 text-sm leading-snug text-graphite">
                      {proven.length
                        ? `${proven.map((e) => engineLabel(e.name)).join(" and ")} ${proven.length === 1 ? "proves" : "prove"} out`
                        : "No engine has proved out yet"}
                    </p>
                  </div>
                  <ul className="tnum flex flex-wrap gap-x-6 gap-y-2">
                    {rows.map((e) => (
                      <li key={e.name} className="flex items-center gap-2 text-sm" title={`${num(e.supported)} verified of ${num(e.returned)} returned`}>
                        <EngineDot name={e.name} size={8} />
                        <span className={proven.includes(e) ? "font-semibold" : "text-graphite"}>{engineLabel(e.name)}</span>
                        <span className={proven.includes(e) ? "font-medium text-pursue" : "text-graphite"}>
                          {num(e.supported)}/{num(e.returned)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Queries that worked" className="max-w-[52rem] rounded-[8px] border border-rule bg-surface px-6 py-5">
        <h2 className="serif text-[1.9rem] font-semibold">Queries that led to proof</h2>
        <p className="mt-1 text-graphite">
          Search shapes that returned a source a verified line quotes. The research planner is shown these before it
          writes the next memo&rsquo;s queries.
        </p>
        {hints.length === 0 ? (
          <p className="mt-4 text-graphite">None yet. A query is remembered once one of its results backs a verified line.</p>
        ) : (
          <ol className="mt-4 grid gap-2">
            {hints.map((h, i) => (
              <li key={h} className="flex items-baseline gap-3">
                <span className="tnum w-5 text-right text-sm text-graphite">{i + 1}</span>
                <span className="font-mono text-[0.95rem]">{h}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

// Same bar as lib/learn.ts provenEngines: 5+ results on record, at least one verified, score above the topic's average.
function provenOf(rows: EngineStat[]): EngineStat[] {
  const pool = rows.filter((e) => !isTavily(e.name) && e.name !== "unknown");
  const avg = pool.reduce((t, e) => t + e.score, 0) / (pool.length || 1);
  return pool.filter((e) => e.returned >= 5 && e.supported > 0 && (pool.length === 1 || e.score > avg)).slice(0, 3);
}

function YieldChart({ history }: { history: MemoYield[] }) {
  const W = 760;
  const H = 220;
  const pad = { l: 44, r: 16, t: 16, b: 44 };
  const max = Math.max(1, ...history.map((h) => h.yield));
  const top = Math.ceil(max * 2) / 2;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const slot = iw / history.length;
  const bw = Math.min(46, slot * 0.6);
  const x = (i: number) => pad.l + slot * (i + 0.5);
  const y = (v: number) => pad.t + ih - (v / top) * ih;
  const labelEvery = Math.ceil(history.length / 10);
  const short = (s: string) => (s.length > 10 ? `${s.slice(0, 9)}…` : s);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Verified lines per search for ${history.length} memos, oldest first: ${history.map((h) => `${h.company} ${h.yield.toFixed(2)}`).join(", ")}`}
      className="tnum mt-4 w-full max-w-[52rem]"
    >
      {[0, top / 2, top].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="text-rule-soft" stroke="currentColor" />
          <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="12" className="text-graphite" fill="currentColor">
            {v.toFixed(1)}
          </text>
        </g>
      ))}
      {history.map((h, i) => (
        <g key={`${h.at}-${i}`}>
          <title>{`${h.company}: ${h.verified_lines} verified lines from ${h.search_calls} searches, ${h.sources_read} pages read`}</title>
          <rect x={x(i) - bw / 2} y={y(h.yield)} width={bw} height={Math.max(0, y(0) - y(h.yield))} className="text-cobalt-soft" fill="currentColor" />
          {i % labelEvery === 0 && (
            <text x={x(i)} y={H - pad.b + 18} textAnchor="middle" fontSize="12" className="text-graphite" fill="currentColor">
              {short(h.company)}
            </text>
          )}
          {history.length <= 12 && (
            <text x={x(i)} y={y(h.yield) - 8} textAnchor="middle" fontSize="12" fontWeight="600" className="text-ink" fill="currentColor">
              {h.yield.toFixed(2)}
            </text>
          )}
        </g>
      ))}
      {history.length > 1 && (
        <polyline
          points={history.map((h, i) => `${x(i)},${y(h.yield)}`).join(" ")}
          fill="none"
          strokeWidth="2"
          className="text-cobalt"
          stroke="currentColor"
        />
      )}
      {history.map((h, i) => (
        <circle key={i} cx={x(i)} cy={y(h.yield)} r="3.5" className="text-cobalt" fill="currentColor" />
      ))}
      <text x={pad.l} y={H - 6} fontSize="12" className="text-graphite" fill="currentColor">
        oldest memo
      </text>
      <text x={W - pad.r} y={H - 6} textAnchor="end" fontSize="12" className="text-graphite" fill="currentColor">
        newest
      </text>
    </svg>
  );
}

function Row({ e, rank, maxReturned, maxScore }: { e: EngineStat; rank: number; maxReturned: number; maxScore: number }) {
  const w = (n: number) => `${Math.max(n > 0 ? 1.5 : 0, (n / maxReturned) * 100)}%`;
  return (
    <li className="grid items-center gap-3 border-b border-rule-soft px-6 py-4 last:border-b-0 md:grid-cols-[2.5rem_minmax(0,12rem)_minmax(0,1fr)_6.5rem_6rem] md:gap-6">
      <span className="tnum font-mono text-xl text-faint">{rank}</span>
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
        <span className="font-mono text-xl font-medium">{pct(e.supported, e.returned)}</span>
        <span className="block text-sm text-graphite">of results</span>
      </p>
      <div className="tnum text-right">
        <p className="font-mono text-xl font-semibold">{e.score.toFixed(2)}</p>
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
      <dd className="font-mono text-[2.2rem] font-medium leading-none">{value}</dd>
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
    <div className="max-w-[44rem] rounded-[8px] border border-rule bg-surface px-7 py-6">
      <h2 className="serif text-[1.9rem] font-semibold">{title}</h2>
      <p className="mt-2 leading-relaxed text-graphite">{children}</p>
      <Link href="/" className="mt-5 inline-block rounded-[8px] bg-ink px-5 py-2.5 font-semibold text-white hover:bg-cobalt">
        Research a company
      </Link>
    </div>
  );
}
