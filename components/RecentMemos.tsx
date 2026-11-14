"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MemoSummary } from "@/lib/types";
import { api, errMsg, timeAgo } from "./http";
import { VERDICT } from "./MemoView";

const PREVIEW_COUNT = 4;

export default function RecentMemos() {
  const [memos, setMemos] = useState<MemoSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    api<{ memos: MemoSummary[] }>("/api/memos")
      .then((r) => live && (setMemos(r.memos ?? []), setError(null)))
      .catch((e) => live && setError(errMsg(e)));
    return () => {
      live = false;
    };
  }, [attempt]);

  return (
    <section aria-labelledby="recent-title" className="min-w-0 border-t border-rule px-4 pt-5 pb-4 sm:px-6 lg:border-t-0 lg:border-l lg:bg-paper">
      <h2 id="recent-title" className="mb-2 flex items-baseline justify-between gap-2 pb-2 text-sm font-semibold">
        Recent memos
        {memos && memos.length > 0 && <span className="tnum text-sm font-normal text-graphite">{memos.length}</span>}
      </h2>
      {error && (
        <div className="space-y-2 py-2 text-sm">
          <p role="alert" className="text-graphite">Couldn&rsquo;t load recent memos: {error}</p>
          <button type="button" className="action-secondary px-3" onClick={() => { setError(null); setAttempt((n) => n + 1); }}>
            Try again
          </button>
        </div>
      )}
      {!error && memos === null && (
        <ul aria-hidden className="divide-y divide-rule-soft">
          {[0, 1, 2].map((i) => (
            <li key={i} className="py-4">
              <div className="h-4 w-2/3 bg-rule-soft" />
              <div className="mt-2 h-3 w-1/3 bg-rule-soft" />
            </li>
          ))}
        </ul>
      )}
      {memos && memos.length === 0 && (
        <p className="py-3 text-graphite">Your memos will be listed here. Try one of the examples to start.</p>
      )}
      {memos && memos.length > 0 && (
        <>
          <ul id="memo-history" className="divide-y divide-rule-soft p-1">
            {(expanded ? memos : memos.slice(0, PREVIEW_COUNT)).map((m) => {
              const v = VERDICT[m.verdict] ?? VERDICT.dig_deeper;
              return (
                <li key={m.id}>
                  <Link
                    href={`/memo/${encodeURIComponent(m.id)}`}
                    className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 rounded-md px-2 py-2.5 hover:bg-raised"
                  >
                    <span className="truncate text-sm font-medium group-hover:text-cobalt">{m.company}</span>
                    <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${v.text} ${v.bg}`}>
                      {v.label} <span className="tnum font-normal opacity-80">{Math.round(m.confidence * 100)}%</span>
                    </span>
                    <span className="truncate text-xs text-graphite">
                      {m.n_sources} sources, {timeAgo(m.created_at)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {memos.length > PREVIEW_COUNT && (
            <button
              type="button"
              aria-controls="memo-history"
              aria-expanded={expanded}
              className="action-secondary mt-2 w-full px-3 text-sm"
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded ? "Show fewer memos" : `Show all ${memos.length} memos`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
