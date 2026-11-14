import type { Memo } from "@/lib/types";

// Research until proven: one column per search round, coverage rising like a track, the questions still open under each.
// Renders nothing when the memo has no rounds (quick memos, older memos).
export default function Rounds({ memo }: { memo: Memo }) {
  const rounds = memo.rounds;
  if (!rounds || rounds.length === 0) return null;
  const last = rounds[rounds.length - 1];
  return (
    <section className="avoid-break rounded-lg border border-rule bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="serif text-[1.5rem] font-semibold">{last.open.length === 0 ? "Researched until proven" : "Researched in rounds"}</h3>
        <p className="tnum text-sm text-graphite">
          {rounds.length} round{rounds.length === 1 ? "" : "s"}, {Math.round(last.coverage * 100)}% of the key questions answered
        </p>
      </div>
      <ol className="mt-5 grid gap-5" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(0, 1fr))` }}>
        {rounds.map((r) => {
          const pct = Math.round(r.coverage * 100);
          const done = pct >= 85;
          return (
            <li key={r.round} className="min-w-0">
              <div
                className="relative h-28 border-b border-ink"
                role="meter"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Round ${r.round} coverage`}
              >
                <div className="absolute inset-x-0 bottom-0 rounded-t-[3px] bg-paper" style={{ height: "100%" }} />
                <div
                  className={`absolute inset-x-0 bottom-0 rounded-t-[3px] ${done ? "bg-pursue" : "bg-cobalt"}`}
                  style={{ height: `${pct}%` }}
                />
                <span
                  className={`tnum absolute left-3 font-mono text-[1.6rem] font-medium leading-none ${pct > 35 ? "text-white" : "text-ink"}`}
                  style={pct > 35 ? { bottom: `calc(${pct}% - 2.2rem)` } : { bottom: `calc(${pct}% + 0.4rem)` }}
                >
                  {pct}%
                </span>
              </div>
              <p className="mt-2.5 text-sm">
                <span className="block font-semibold">Round {r.round}</span>
                <span className="tnum block font-mono text-xs text-graphite">
                  {r.queries.length} searches, +{r.new_sources} sources
                </span>
              </p>
              {r.open.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {r.open.map((q, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden className="mt-[0.55em] h-[5px] w-[5px] shrink-0 bg-dig" />
                      <span>
                        <span className="text-graphite">Still open: </span>
                        {q}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm font-medium text-pursue">Nothing left open</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
