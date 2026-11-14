"use client";

import type { Memo, Source } from "@/lib/types";
import SourceChip from "./SourceChip";
import AsciiStrip from "./proof/AsciiStrip";

const SEVERITY = {
  high: { label: "High severity", line: "border-pass", text: "text-pass", bg: "bg-pass-soft", badge: "bg-pass text-white", ink: "#b2242c" },
  medium: { label: "Medium severity", line: "border-dig", text: "text-dig", bg: "bg-dig-soft", badge: "bg-dig text-white", ink: "#a8670b" },
  low: { label: "Low severity", line: "border-rule", text: "text-graphite", bg: "bg-paper", badge: "border border-rule text-graphite", ink: "#8c96a0" },
} as const;

// Claims vs. reality: what the company says beside what independent sources say. Renders nothing when the memo
// has no contradictions. onSource opens the trail at a source (same as the chips on memo lines).
// No entrance animation: every card renders fully on first paint.
export default function Contradictions({ memo, onSource }: { memo: Memo; onSource?: (source: Source) => void }) {
  const list = memo.contradictions;
  if (!list || list.length === 0) return null;
  const index = new Map(memo.sources.map((s, i) => [s.id, i]));
  const chips = (ids: string[]) =>
    ids.map((id) => {
      const n = index.get(id);
      if (n === undefined) return null;
      const src = memo.sources[n];
      return <SourceChip key={id} n={n + 1} source={src} onClick={() => onSource?.(src)} />;
    });

  const high = list.filter((c) => c.severity === "high").length;

  return (
    <section className="avoid-break">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b-2 border-ink pb-4">
        <div>
          <h2 className="serif text-[2.6rem] font-semibold leading-none tracking-tight">Claims vs. reality</h2>
          <p className="mt-2 text-[1.05rem] text-graphite">
            Where the company&apos;s own account and independent sources disagree. Every side cites its source.
          </p>
        </div>
        <p className="flex items-baseline gap-3 text-graphite">
          <span className="serif tnum text-[3.6rem] font-semibold leading-none text-pass">{list.length}</span>
          <span className="leading-tight">
            {list.length === 1 ? "contradiction" : "contradictions"}
            {high > 0 && (
              <>
                <br />
                <span className="font-semibold text-pass">{high} high severity</span>
              </>
            )}
          </span>
        </p>
      </div>
      <ol className="space-y-5">
        {list.map((c, i) => {
          const s = SEVERITY[c.severity] ?? SEVERITY.low;
          return (
            <li key={i} className={`avoid-break overflow-hidden rounded-lg border border-rule bg-surface`}>
              <div className="flex items-center justify-between gap-4 border-b border-rule-soft px-6 py-2.5">
                <span className="font-mono text-sm text-faint">{String(i + 1).padStart(2, "0")}</span>
                <span className={`rounded-[4px] px-2.5 py-0.5 font-mono text-xs font-medium uppercase tracking-[0.08em] ${s.badge}`}>
                  {s.label}
                </span>
              </div>
              <div className="grid md:grid-cols-[minmax(0,1fr)_3.25rem_minmax(0,1fr)]">
                <div className="px-6 py-6">
                  <p className="mb-2.5 text-sm font-semibold text-graphite">The company says</p>
                  <p className="serif text-[1.35rem] leading-[1.45] text-ink/75">
                    <span className="line-through decoration-pass/55 decoration-[1.5px]">{c.claim}</span>
                    {chips(c.claim_source_ids)}
                  </p>
                </div>
                <div className="relative hidden border-x border-rule-soft md:block" aria-hidden>
                  <AsciiStrip kind="rule" color={s.ink} label="" className="absolute inset-0 h-full w-full" />
                  <span className="absolute left-1/2 top-6 -translate-x-1/2 rounded-[4px] bg-surface px-1.5 py-0.5 font-mono text-xs font-medium text-ink">
                    vs
                  </span>
                </div>
                <div className={`border-t border-rule-soft px-6 py-6 md:border-t-0 ${s.bg}`}>
                  <p className={`mb-2.5 text-sm font-semibold ${s.text}`}>Independent sources say</p>
                  <p className="serif text-[1.35rem] font-medium leading-[1.45] text-ink">
                    {c.reality}
                    {chips(c.reality_source_ids)}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
