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

  return (
    <section className="avoid-break">
      <h2 className="mb-2 flex items-baseline gap-2 border-b-2 border-ink pb-2 text-lg font-semibold">
        Claims vs. reality
        <span className="tnum text-sm font-normal text-graphite">{list.length}</span>
      </h2>
      <p className="mb-4 text-sm text-graphite">Where the company&apos;s own account and independent sources disagree.</p>
      <ul className="space-y-4">
        {list.map((c, i) => {
          const s = SEVERITY[c.severity] ?? SEVERITY.low;
          return (
            <li key={i} className={`avoid-break border border-rule border-l-4 bg-surface ${s.line}`}>
              <div className="grid md:grid-cols-2">
                <div className="px-5 py-4">
                  <p className="mb-1.5 text-sm text-graphite">The company says</p>
                  <p className="serif text-[1.12rem] leading-[1.5]">
                    {c.claim}
                    {chips(c.claim_source_ids)}
                  </p>
                </div>
                <div className={`border-t border-rule-soft px-5 py-4 md:border-l md:border-t-0 ${s.bg}`}>
                  <p className="mb-1.5 flex items-center justify-between gap-3 text-sm text-graphite">
                    <span>Independent sources say</span>
                    <span className={`font-semibold ${s.text}`}>{s.label} severity</span>
                  </p>
                  <p className="serif text-[1.12rem] leading-[1.5]">
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
