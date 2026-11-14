"use client";

import type { Memo, Source } from "@/lib/types";
import SourceChip from "./SourceChip";

const SEVERITY = {
  high: { label: "High", line: "border-pass", text: "text-pass", bg: "bg-pass-soft" },
  medium: { label: "Medium", line: "border-dig", text: "text-dig", bg: "bg-dig-soft" },
  low: { label: "Low", line: "border-rule", text: "text-graphite", bg: "bg-paper" },
} as const;

// Claims vs. reality: what the company says beside what independent sources say. Renders nothing when the memo
// has no contradictions. onSource opens the trail at a source (same as the chips on memo lines).
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
    <section className="avoid-break border-t-4 border-pass pt-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div>
          <h2 className="serif text-[2.1rem] font-semibold leading-tight tracking-tight">Claims vs. reality</h2>
          <p className="mt-1 text-graphite">
            Where the company&apos;s own account and independent sources disagree. Every side cites its source.
          </p>
        </div>
        <p className="tnum text-right text-graphite">
          <span className="serif text-[2.1rem] font-semibold leading-none text-pass">{list.length}</span>{" "}
          {list.length === 1 ? "contradiction" : "contradictions"}
          {high > 0 ? `, ${high} high severity` : ""}
        </p>
      </div>
      <ul className="space-y-4">
        {list.map((c, i) => {
          const s = SEVERITY[c.severity] ?? SEVERITY.low;
          return (
            <li key={i} className={`avoid-break border border-rule border-l-[6px] bg-surface ${s.line}`}>
              <div className="grid md:grid-cols-2">
                <div className="px-6 py-5">
                  <p className="mb-2 text-sm font-semibold text-graphite">The company says</p>
                  <p className="serif text-[1.3rem] leading-[1.45]">
                    {c.claim}
                    {chips(c.claim_source_ids)}
                  </p>
                </div>
                <div className={`border-t border-rule-soft px-6 py-5 md:border-l md:border-t-0 ${s.bg}`}>
                  <p className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold text-graphite">
                    <span>Independent sources say</span>
                    <span className={`shrink-0 border px-2 py-px ${s.line} ${s.text}`}>{s.label} severity</span>
                  </p>
                  <p className="serif text-[1.3rem] leading-[1.45]">
                    {c.reality}
                    {chips(c.reality_source_ids)}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
