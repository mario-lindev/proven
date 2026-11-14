"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { TrailStep } from "@/lib/types";
import { Check, EngineBar, EngineDot, TopicChip, engineLabel, splitEngines } from "./engines";
import { domain, fmtMs } from "./http";

type Depth = "quick" | "deep";
// "rank" (a learn step before the memo is written) belongs to reading and has no box of its own.
// "search" covers every search round and the coverage check after each one (deep mode runs 1 to 4 rounds).
type PhaseId = "plan" | "search" | "rank" | "read" | "write" | "verify" | "learn";

const PHASES: Record<PhaseId, string> = {
  plan: "Planning",
  search: "Searching",
  rank: "Ranking",
  read: "Reading pages",
  write: "Writing",
  verify: "Checking",
  learn: "Learning",
};

const ACTIVITY: Record<PhaseId, string> = {
  plan: "Claude is planning the searches",
  search: "Telem is routing each query to its engines",
  rank: "Reading the best pages in full",
  read: "Reading the best pages in full",
  write: "Claude is writing the memo from these sources only",
  verify: "Checking every line against its source",
  learn: "Recording which engines' pages backed a verified line",
};

const ORDER: PhaseId[] = ["plan", "search", "read", "write", "verify", "learn"];

// Deep mode's coverage check after each round: "Round 2: 4 of 6 key questions answered, searching the gaps".
const ROUND = /^Round (\d+):\s*(.*)$/;

// Which phase and search round each step belongs to, in order. A step arrives once it is finished.
// round: the search round a step is part of (1 to 4). searching: the loop is still going after the last step.
export function phaseOf(steps: TrailStep[]): { phases: PhaseId[]; rounds: number[]; round: number; searching: boolean } {
  let round = 1;
  let written = false;
  let searching = false;
  const rounds: number[] = [];
  const phases = steps.map((s): PhaseId => {
    rounds.push(round);
    if (s.kind === "search") {
      searching = true;
      return "search";
    }
    if (s.kind === "llm") {
      const m = ROUND.exec(s.label);
      if (m) {
        // The check closes round N; "searching the gaps" means round N+1 follows, anything else ends the loop.
        const n = Number(m[1]);
        rounds[rounds.length - 1] = n;
        searching = /searching the gaps/i.test(m[2]);
        round = searching ? n + 1 : n;
        return "search";
      }
      // Older servers named the gap check "Find gaps": it opens round 2.
      if (/gap/i.test(s.label)) {
        round = 2;
        searching = true;
        return "search";
      }
      if (/write/i.test(s.label)) {
        written = true;
        searching = false;
        return "write";
      }
      // Verify batches are llm steps too; anything after the memo is written belongs to checking.
      return written ? "verify" : "plan";
    }
    searching = false;
    if (s.kind === "verify") {
      written = true;
      return "verify";
    }
    // A learn step before writing ranks the sources; after it, it records what this memo taught.
    if (s.kind === "learn") return written ? "learn" : "rank";
    // Pages fetched after the memo is written are read for the line-by-line check.
    return written ? "verify" : "read";
  });
  return { phases, rounds, round, searching };
}

export function feedStats(steps: TrailStep[]) {
  const searches = steps.filter((s) => s.kind === "search");
  const engines = new Set<string>();
  const telemEngines = new Set<string>();
  const urls = new Set<string>();
  const sessions = new Set<string>();
  for (const s of searches) {
    for (const e of s.engines ?? []) {
      if (e.error) continue;
      engines.add(e.name);
      if (e.name.toLowerCase() !== "tavily") telemEngines.add(e.name);
    }
    for (const u of s.urls ?? []) urls.add(u);
    if (s.telem_session_id) sessions.add(s.telem_session_id);
  }
  // Wall-clock span of the run: steps overlap (searches run in parallel), so summing ms overstates it.
  let first = Infinity;
  let end = -Infinity;
  for (const s of steps) {
    const at = new Date(s.at).getTime();
    if (isNaN(at)) continue;
    first = Math.min(first, at - s.ms);
    end = Math.max(end, at);
  }
  const spanMs = end > first ? end - first : steps.reduce((a, s) => a + s.ms, 0);
  return { queries: searches.length, engines, telemEngines, urls: urls.size, sessions, spanMs };
}

export default function ResearchFeed({
  company,
  depth,
  steps,
  startedAt,
  finishedAt,
  failed,
}: {
  company: string;
  depth: Depth;
  steps: TrailStep[];
  startedAt: number;
  finishedAt: number | null;
  failed?: boolean;
}) {
  const running = finishedAt === null && !failed;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [running]);

  const elapsed = ((finishedAt ?? now) - startedAt) / 1000;
  const { phases: stepPhases, rounds: stepRounds, round, searching } = phaseOf(steps);
  const donePhases = new Set(stepPhases);
  // Checking and Learning wait in the bar while a run is going; once it ends they stay only if
  // their steps really happened (older servers and memos have neither).
  const phases = ORDER.filter((p) => (p !== "verify" && p !== "learn") || running || donePhases.has(p));
  const last = stepPhases[stepPhases.length - 1];

  // The phase in progress: a search round stays active while results keep arriving;
  // otherwise the next phase after the last finished one.
  let active: PhaseId | null = null;
  if (running) {
    if (!last) active = "plan";
    else if (last === "search") active = searching ? "search" : "read";
    else if (last === "rank") active = "read";
    else {
      const i = phases.indexOf(last);
      active = i >= 0 && i < phases.length - 1 ? phases[i + 1] : null;
    }
  }

  const stats = feedStats(steps);
  const searchSteps = steps.map((s, i) => ({ s, i, r: stepRounds[i] })).filter((x) => x.s.kind === "search");
  // What the coverage check said after each round, e.g. "4 of 6 key questions answered, searching the gaps".
  const roundNotes = new Map<number, string>();
  for (const s of steps) {
    const m = s.kind === "llm" ? ROUND.exec(s.label) : null;
    if (m) roundNotes.set(Number(m[1]), m[2]);
  }
  const roundNumbers = [...new Set(searchSteps.map((x) => x.r))].sort((a, b) => b - a);
  const multiRound = depth === "deep" || roundNumbers.length > 1;
  const scale = Math.max(1500, ...searchSteps.flatMap((x) => (x.s.engines ?? []).map((e) => e.latency_ms)));
  const extracts = steps.filter((s) => s.kind === "extract" || s.kind === "fetch");
  const llms = steps.filter((s) => s.kind === "llm");

  return (
    <section aria-label="Research progress" className="border border-rule bg-surface">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-rule px-6 py-5 md:px-8">
        <div className="min-w-0">
          <p className="text-graphite">
            {running ? "Researching" : failed ? "Stopped researching" : "Researched"}{" "}
            <span className="text-ink">{depth === "deep" ? "in depth" : "quickly"}</span>
          </p>
          <h2 className="serif mt-1 truncate text-4xl font-semibold tracking-tight">{company}</h2>
        </div>
        <dl className="grid grid-cols-4 gap-x-8 text-right">
          <Stat label="queries" value={stats.queries} />
          <Stat label="engines" value={stats.engines.size} />
          <Stat label="pages found" value={stats.urls} />
          <Stat label="elapsed" value={`${elapsed.toFixed(1)} s`} live={running} />
        </dl>
      </header>

      <ol className="flex border-b border-rule" aria-label="Phases">
        {phases.map((p, i) => {
          const isActive = active === p;
          const isDone = !isActive && (donePhases.has(p) || (!running && !failed));
          return (
            <li
              key={p}
              aria-current={isActive ? "step" : undefined}
              className={`relative min-w-0 flex-auto overflow-hidden border-r border-rule-soft px-4 py-3 last:border-r-0 ${
                isActive ? "bg-cobalt-soft" : ""
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={`tnum flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    isDone
                      ? "bg-ink text-white"
                      : isActive
                        ? "bg-cobalt text-white"
                        : "border border-rule text-faint"
                  }`}
                >
                  {i + 1}
                </span>
                <span className={`truncate ${isActive ? "font-semibold text-cobalt" : isDone ? "text-ink" : "text-faint"}`}>
                  {PHASES[p]}
                  {p === "search" && multiRound && (
                    <span className="tnum font-normal">
                      {isActive ? `, round ${round}` : isDone && donePhases.has(p) ? `, ${round} round${round === 1 ? "" : "s"}` : ""}
                    </span>
                  )}
                </span>
              </div>
              {isActive && (
                <span className="absolute bottom-0 left-0 h-[2px] w-2/5 bg-cobalt sweep" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>

      <div className="px-6 py-5 md:px-8">
        {stats.telemEngines.size > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="text-graphite">Telem routed to</span>
            {[...stats.telemEngines].map((n) => (
              <span key={n} className="flex items-center gap-1.5 font-medium">
                <EngineDot name={n} />
                {engineLabel(n)}
              </span>
            ))}
            <span className="text-graphite">alongside</span>
            <span className="flex items-center gap-1.5 font-medium">
              <EngineDot name="tavily" />
              Tavily
            </span>
          </div>
        )}

        {searchSteps.length === 0 && (
          <p className="pb-4 text-graphite">
            {failed ? "No searches ran." : "Each search will appear here as Telem picks its engines for it."}
          </p>
        )}

        {(llms.length > 0 || extracts.length > 0 || running) && (
          <ul className="mb-5 flex flex-wrap gap-x-8 gap-y-2 text-sm text-graphite">
            {steps
              .map((s, i) => ({ s, p: stepPhases[i] }))
              .filter(({ s }) => s.kind !== "search" && !(s.kind === "llm" && ROUND.test(s.label)))
              .map(({ s, p }, i) => (
                <li key={i} className="row-in flex items-center gap-2">
                  {s.kind === "verify" ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-pursue" />
                  ) : (
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.kind === "learn" ? "bg-cobalt" : "bg-ink"}`} />
                  )}
                  <span className={s.kind === "verify" ? "font-medium text-pursue" : "text-ink"}>{s.label}</span>
                  <span className="tnum">{fmtMs(s.ms)}</span>
                  {s.engines && s.engines.length > 0 && (
                    <span>via {s.engines.map((e) => engineLabel(e.name)).join(" and ")}</span>
                  )}
                  {p === "learn" && (
                    <Link href="/engines" className="font-medium text-cobalt hover:underline">
                      What Proven learned
                    </Link>
                  )}
                </li>
              ))}
            {running && active && (
              <li className="flex items-center gap-2 font-medium text-cobalt">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cobalt" />
                {active === "search" && round > 1 ? `Round ${round}: Telem is searching for what is still open` : ACTIVITY[active]}
              </li>
            )}
          </ul>
        )}

        {searchSteps.length > 0 && (
          <div>
            <div className="hidden grid-cols-[minmax(0,5fr)_minmax(0,7fr)_5.5rem] gap-6 border-b border-rule pb-2 text-sm text-graphite md:grid">
              <span>Query, newest first</span>
              <span>Engines that answered, with latency</span>
              <span className="text-right">Pages</span>
            </div>
            {roundNumbers.map((n) => {
              const rows = searchSteps.filter((x) => x.r === n).reverse();
              const note = roundNotes.get(n);
              return (
                <div key={n}>
                  {multiRound && (
                    <p className="mt-4 flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-graphite">
                      <span className="text-ink">Round {n}</span>
                      <span className="font-normal">{n === 1 ? "the planned searches" : "follow-up searches for what was still open"}</span>
                      <span className="tnum font-normal text-faint">{rows.length} {rows.length === 1 ? "query" : "queries"}</span>
                      {note && <span className="row-in tnum ml-auto text-cobalt">{note[0].toUpperCase() + note.slice(1)}</span>}
                    </p>
                  )}
                  <ol>
                    {rows.map(({ s, i }) => {
                      const { telem, tavily } = splitEngines(s.engines);
                      return (
                        <li
                          key={i}
                          className="row-in grid gap-3 border-b border-rule-soft py-3.5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)_5.5rem] md:gap-6"
                        >
                          <div className="min-w-0">
                            <p className="break-words font-mono text-[0.92rem] leading-snug">{s.query ?? s.label}</p>
                            {(s.topic || (s.routing && s.routing.length > 0)) && (
                              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-cobalt">
                                {s.topic && <TopicChip topic={s.topic} />}
                                {s.routing && s.routing.length > 0 && (
                                  <span>Router chose {s.routing.map(engineLabel).join(", ")}</span>
                                )}
                              </p>
                            )}
                            {s.urls && s.urls.length > 0 && (
                              <p className="mt-1 truncate text-sm text-faint">
                                {[...new Set(s.urls.map(domain))].slice(0, 4).join(", ")}
                              </p>
                            )}
                          </div>
                          <div className="grid min-w-0 grid-cols-2 gap-x-5 gap-y-2 lg:grid-cols-3">
                            {telem.map((e, j) => (
                              <EngineBar key={`t${j}`} e={e} scale={scale} animate />
                            ))}
                            {tavily.map((e, j) => (
                              <EngineBar key={`v${j}`} e={e} scale={scale} animate />
                            ))}
                          </div>
                          <p className="tnum text-right text-lg font-medium">{s.urls?.length ?? 0}</p>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
        )}

        {stats.sessions.size > 0 && (
          <p className="mt-5 text-sm text-faint">
            Telem session{stats.sessions.size > 1 ? "s" : ""}{" "}
            <span className="font-mono">{[...stats.sessions].join(", ")}</span>
          </p>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, live }: { label: string; value: number | string; live?: boolean }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-1.5 text-sm text-graphite">{label}</dt>
      <dd className={`tnum text-3xl font-medium leading-none ${live ? "text-cobalt" : ""}`}>{value}</dd>
    </div>
  );
}
