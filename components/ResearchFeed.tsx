"use client";

import { useEffect, useState } from "react";
import type { TrailStep } from "@/lib/types";
import { EngineBar, EngineDot, engineLabel, splitEngines } from "./engines";
import { domain, fmtMs } from "./http";

type Depth = "quick" | "deep";
type PhaseId = "plan" | "search1" | "gaps" | "search2" | "read" | "write";

const PHASES: Record<PhaseId, string> = {
  plan: "Planning",
  search1: "Searching",
  gaps: "Finding gaps",
  search2: "Searching again",
  read: "Reading pages",
  write: "Writing",
};

const ORDER: Record<Depth, PhaseId[]> = {
  quick: ["plan", "search1", "read", "write"],
  deep: ["plan", "search1", "gaps", "search2", "read", "write"],
};

// Which phase each step belongs to, in order. A step arrives once it is finished.
export function phaseOf(steps: TrailStep[]): PhaseId[] {
  let round = 1;
  return steps.map((s) => {
    if (s.kind === "llm") {
      const l = s.label.toLowerCase();
      if (l.includes("gap")) {
        round = 2;
        return "gaps";
      }
      if (l.includes("write")) return "write";
      return "plan";
    }
    if (s.kind === "search") return round === 2 ? "search2" : "search1";
    return "read";
  });
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
  return { queries: searches.length, engines, telemEngines, urls: urls.size, sessions };
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
  const phases = ORDER[depth];
  const stepPhases = phaseOf(steps);
  const donePhases = new Set(stepPhases);
  const last = stepPhases[stepPhases.length - 1];

  // The phase in progress: a search round stays active while results keep arriving;
  // otherwise the next phase after the last finished one.
  let active: PhaseId | null = null;
  if (running) {
    if (!last) active = "plan";
    else if (last === "search1" || last === "search2") active = last;
    else {
      const i = phases.indexOf(last);
      active = phases[Math.min(i + 1, phases.length - 1)];
      if (last === "write") active = null;
    }
  }

  const stats = feedStats(steps);
  const searchSteps = steps.map((s, i) => ({ s, i, p: stepPhases[i] })).filter((x) => x.s.kind === "search");
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
              className={`relative flex-1 overflow-hidden border-r border-rule-soft px-4 py-3 last:border-r-0 ${
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
          <div className="py-6 text-graphite">
            <p className="flex items-center gap-2 text-lg">
              <span className="pulse-dot h-2 w-2 rounded-full bg-cobalt" />
              {failed ? "No searches ran." : "Planning the searches for this company."}
            </p>
            <p className="mt-1">Each search will appear here as Telem picks its engines.</p>
          </div>
        )}

        {searchSteps.length > 0 && (
          <div>
            <div className="hidden grid-cols-[minmax(0,5fr)_minmax(0,7fr)_5.5rem] gap-6 border-b border-rule pb-2 text-sm text-graphite md:grid">
              <span>Query</span>
              <span>Engines that answered, with latency</span>
              <span className="text-right">Pages</span>
            </div>
            <ol>
              {searchSteps.map(({ s, i, p }, k) => {
                const prev = searchSteps[k - 1];
                const { telem, tavily } = splitEngines(s.engines);
                return (
                  <li key={i} className="row-in">
                    {p === "search2" && prev?.p === "search1" && (
                      <p className="mt-4 border-t border-dashed border-rule pt-3 text-sm font-medium text-graphite">
                        Follow-up searches for the gaps
                      </p>
                    )}
                    <div className="grid gap-3 border-b border-rule-soft py-3.5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)_5.5rem] md:gap-6">
                      <div className="min-w-0">
                        <p className="break-words font-mono text-[0.92rem] leading-snug">{s.query ?? s.label}</p>
                        {s.routing && s.routing.length > 0 && (
                          <p className="mt-1 text-sm text-cobalt">Router chose {s.routing.map(engineLabel).join(", ")}</p>
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
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {(extracts.length > 0 || llms.length > 0) && (
          <ul className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm text-graphite">
            {steps
              .filter((s) => s.kind !== "search")
              .map((s, i) => (
                <li key={i} className="row-in flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink" />
                  <span className="text-ink">{s.label}</span>
                  <span className="tnum">{fmtMs(s.ms)}</span>
                  {s.engines && s.engines.length > 0 && (
                    <span>via {s.engines.map((e) => engineLabel(e.name)).join(" and ")}</span>
                  )}
                </li>
              ))}
            {running && active === "write" && (
              <li className="flex items-center gap-2 text-cobalt">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cobalt" />
                Claude is writing the memo from these sources only
              </li>
            )}
            {running && active === "read" && (
              <li className="flex items-center gap-2 text-cobalt">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cobalt" />
                Reading the best pages in full
              </li>
            )}
          </ul>
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
