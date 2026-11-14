import type { Memo } from "@/lib/types";

// Research until proven: one cell per search round, coverage rising, the questions still open under each.
// Renders nothing when the memo has no rounds (quick memos, older memos).
export default function Rounds({ memo }: { memo: Memo }) {
  const rounds = memo.rounds;
  if (!rounds || rounds.length === 0) return null;
  const last = rounds[rounds.length - 1];
  return (
    <section className="avoid-break border border-rule bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-semibold">Researched until proven</h3>
        <p className="tnum text-sm text-graphite">
          {rounds.length} round{rounds.length === 1 ? "" : "s"}, {Math.round(last.coverage * 100)}% of the key questions answered
        </p>
      </div>
      <ol className="mt-4 grid gap-4" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(0, 1fr))` }}>
        {rounds.map((r) => {
          const pct = Math.round(r.coverage * 100);
          return (
            <li key={r.round} className="min-w-0">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">Round {r.round}</span>
                <span className="tnum text-lg font-semibold">{pct}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full bg-paper" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Round ${r.round} coverage`}>
                <div className={`h-full ${pct >= 85 ? "bg-pursue" : "bg-cobalt"}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="tnum mt-2 text-sm text-graphite">
                {r.queries.length} searches, {r.new_sources} new sources
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
