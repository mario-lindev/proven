"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MemoSummary } from "@/lib/types";
import { api, fmtTime } from "./http";

const verdicts = { pursue: "Pursue", dig_deeper: "Dig deeper", pass: "Pass" };

export default function RecentMemos() {
  const [memos, setMemos] = useState<MemoSummary[]>([]);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<{ memos: MemoSummary[] }>("/api/memos", undefined, controller.signal)
      .then(({ memos }) => setMemos(memos))
      .catch(() => {
        if (!controller.signal.aborted) setUnavailable(true);
      });
    return () => controller.abort();
  }, []);

  if (unavailable) return <p className="text-sm text-muted">Recent memos are unavailable.</p>;
  if (!memos.length) return null;

  return (
    <section className="border-t border-line pt-6" aria-labelledby="recent-memos">
      <h2 id="recent-memos" className="text-xl font-semibold">Recent memos</h2>
      <ul className="mt-2 divide-y divide-line">
        {memos.map((memo) => (
          <li key={memo.id} className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 py-3">
            <Link className="break-words font-medium text-accent underline-offset-4 hover:underline"
              href={`/memo/${encodeURIComponent(memo.id)}`}>
              {memo.company}
            </Link>
            <span className="text-sm text-muted">
              {verdicts[memo.verdict]} · {memo.n_sources} sources · <time dateTime={memo.created_at}>{fmtTime(memo.created_at)}</time>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
