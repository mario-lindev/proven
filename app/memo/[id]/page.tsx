"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import type { Memo } from "@/lib/types";
import ErrorBox from "@/components/ErrorBox";
import MemoView from "@/components/MemoView";

type State = { kind: "loading" } | { kind: "missing" } | { kind: "error"; message: string } | { kind: "ok"; memo: Memo };

export default function MemoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    fetch(`/api/memo/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as (Memo & { error?: string }) | null;
        if (!live) return;
        if (res.status === 404) return setState({ kind: "missing" });
        if (!res.ok || !data || data.error) return setState({ kind: "error", message: data?.error ?? `The server answered ${res.status}.` });
        setState({ kind: "ok", memo: data });
      })
      .catch(() => live && setState({ kind: "error", message: "Couldn't reach the Proven server. Check that it is running." }));
    return () => {
      live = false;
    };
  }, [id, attempt]);

  if (state.kind === "loading") {
    return (
      <div aria-busy="true" aria-label="Loading the memo" className="space-y-6">
        <div className="h-14 w-1/2 bg-rule-soft" />
        <div className="h-5 w-3/4 bg-rule-soft" />
        <div className="h-5 w-2/3 bg-rule-soft" />
        <div className="grid gap-12 pt-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-5 bg-rule-soft" />
            ))}
          </div>
          <div className="h-48 bg-rule-soft" />
        </div>
      </div>
    );
  }

  if (state.kind === "missing") {
    return (
      <div className="max-w-[40rem] pt-10">
        <h1 className="text-5xl font-semibold tracking-tight">This memo isn&rsquo;t here</h1>
        <p className="mt-4 text-lg leading-relaxed text-graphite">
          The link may be wrong, or the memo was made on another server. Research the company again to get a fresh memo
          with its sources.
        </p>
        <Link href="/" className="action-primary mt-8 inline-flex items-center px-5">
          Start new research
        </Link>
      </div>
    );
  }

  if (state.kind === "error") {
    return <ErrorBox message={state.message} onRetry={() => setAttempt((a) => a + 1)} />;
  }

  return (
    <div className="space-y-8">
      <Link href="/" className="no-print inline-block text-graphite hover:text-ink">
        Back to research
      </Link>
      <MemoView memo={state.memo} />
    </div>
  );
}
