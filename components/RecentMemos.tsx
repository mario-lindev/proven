"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MemoSummary } from "@/lib/types";
import { api, errMsg, timeAgo } from "./http";
import { VERDICT } from "./MemoView";

export default function RecentMemos({ refreshKey = 0 }: { refreshKey?: number }) {
  const [memos, setMemos] = useState<MemoSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<{ memos: MemoSummary[] }>("/api/memos")
      .then((r) => live && (setMemos(r.memos ?? []), setError(null)))
      .catch((e) => live && setError(errMsg(e)));
    return () => {
      live = false;
    };
  }, [refreshKey]);

  return (
    <section aria-labelledby="recent-title" className="min-w-0 border-t border-rule pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-7">
      <h2 id="recent-title" className="serif mb-2 flex items-baseline justify-between pb-1 text-2xl font-semibold tracking-tight">
        Recent memos
        {memos && memos.length > 0 && <span className="tnum text-sm font-normal text-graphite">{memos.length}</span>}
      </h2>
      {error && <p className="py-3 text-graphite">Couldn&rsquo;t load recent memos: {error}</p>}
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
        <ul className="divide-y divide-rule-soft">
          {memos.slice(0, 8).map((m) => {
            const v = VERDICT[m.verdict] ?? VERDICT.dig_deeper;
            return (
              <li key={m.id}>
                <Link
                  href={`/memo/${encodeURIComponent(m.id)}`}
                  className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-3"
                >
                  <span className="serif truncate text-[1.2rem] font-semibold group-hover:text-cobalt group-hover:underline">{m.company}</span>
                  <span className={`text-sm font-semibold ${v.text}`}>
                    {v.label} <span className="tnum font-normal text-graphite">{Math.round(m.confidence * 100)}%</span>
                  </span>
                  <span className="truncate text-sm text-graphite">
                    {m.n_sources} sources, {timeAgo(m.created_at)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
