"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { Line, Memo } from "@/lib/types";
import SourceLink from "./SourceLink";
import SourceChip from "./SourceChip";
import TrailDrawer from "./TrailDrawer";
import WatchPanel from "./WatchPanel";
import { domain, fmtTime } from "./http";

const VERDICT: Record<Memo["verdict"], { label: string; cls: string }> = {
  pursue: { label: "Pursue", cls: "bg-green-100 text-green-900 ring-green-700/30" },
  dig_deeper: { label: "Dig deeper", cls: "bg-amber-100 text-amber-900 ring-amber-600/30" },
  pass: { label: "Pass", cls: "bg-red-100 text-red-900 ring-red-700/30" },
};

export default function MemoView({ memo }: { memo: Memo }) {
  const [focus, setFocus] = useState<string[] | null>(null);
  const close = useCallback(() => setFocus(null), []);

  const index = new Map(memo.sources.map((s, i) => [s.id, i]));
  const v = VERDICT[memo.verdict] ?? VERDICT.dig_deeper;
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  async function copyMemo() {
    const cite = (ids: string[]) =>
      ids.map((id) => index.get(id)).filter((n): n is number => n !== undefined).map((n) => `[${n + 1}]`).join("");
    const text = [
      `${memo.company}: ${v.label} (${Math.round(memo.confidence * 100)}% confidence)`,
      "",
      memo.summary,
      "",
      "Facts",
      ...memo.facts.map((l) => `- ${l.text} ${cite(l.source_ids)}`),
      "",
      "Risks",
      ...memo.risks.map((l) => `- ${l.text} ${cite(l.source_ids)}`),
      "",
      "Open questions",
      ...memo.open_questions.map((q) => `- ${q}`),
      "",
      "Sources",
      ...memo.sources.map((s, i) => `[${i + 1}] ${s.title} (${s.engine}) ${s.url}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 2000);
  }

  function lineList(title: string, lines: Line[]) {
    return (
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">{title}</h3>
        {lines.length === 0 ? (
          <p className="text-muted">None found with a source.</p>
        ) : (
          <ul className="space-y-2">
            {lines.map((l, i) => (
              <li key={i}>
                <div className="break-words text-lg leading-relaxed">
                  {l.text}{" "}
                  {[...new Set(l.source_ids)].map((id) => {
                    const n = index.get(id);
                    if (n === undefined) return null;
                    const src = memo.sources[n];
                    return <SourceChip key={id} n={n + 1} source={src} onClick={() => setFocus([src.url])} />;
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <article className="space-y-10">
      <header className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className={`rounded-2xl px-6 py-3 text-3xl font-bold ring-1 ${v.cls}`}>{v.label}</span>
          <span className="text-xl text-muted">
            <span className="font-semibold text-foreground">{Math.round(memo.confidence * 100)}%</span> confidence
          </span>
        </div>
        <h2 className="break-words text-4xl font-semibold tracking-tight">{memo.company}</h2>
        <p className="max-w-3xl text-xl leading-relaxed">{memo.summary}</p>
        <div className="flex flex-wrap items-center gap-6">
          <Link href={`/memo/${encodeURIComponent(memo.id)}`} className="font-medium text-accent hover:underline">
            Memo link
          </Link>
          <button
            type="button"
            onClick={(event) => { event.currentTarget.focus(); setFocus([]); }}
            className="font-medium text-accent hover:underline"
          >
            See how Proven reached this
          </button>
          <button
            type="button"
            aria-live="polite"
            onClick={copyMemo}
            className="rounded-lg border border-line px-4 py-1.5 font-medium hover:border-accent hover:text-accent"
          >
            {copied === "done" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy memo"}
          </button>
        </div>
      </header>

      <div className="grid gap-10 md:grid-cols-2">
        {lineList("Facts", memo.facts)}
        {lineList("Risks", memo.risks)}
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Open questions</h3>
        <ul className="list-disc space-y-2 pl-6 text-lg">
          {memo.open_questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      </section>

      <WatchPanel company={memo.company} />

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Sources</h3>
        <ol className="divide-y divide-line rounded-2xl border border-line">
          {memo.sources.map((s, i) => (
            <li key={s.id} className="flex items-baseline gap-4 px-5 py-3">
              <span className="w-8 shrink-0 font-mono text-sm font-semibold text-accent">[{i + 1}]</span>
              <div className="min-w-0 flex-1">
                <SourceLink url={s.url} className="font-medium hover:underline">
                  {s.title}
                </SourceLink>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  <span>{domain(s.url)}</span>
                  <span className="rounded-md bg-soft px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
                    {s.engine}
                  </span>
                  {s.published && <span>{s.published}</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-muted">Memo written {fmtTime(memo.created_at)}</p>
      </section>

      <TrailDrawer trailId={focus ? memo.trail_id : null} focusUrls={focus ?? []} onClose={close} />
    </article>
  );
}
