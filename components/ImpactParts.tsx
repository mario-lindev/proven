"use client";

import type { ImpactAnalogue, ImpactMove, ImpactRange, ImpactSentiment } from "@/lib/brain/impact";
import { fmtPct } from "@/lib/brain/impact-format";
import type { Source } from "@/lib/types";
import { EngineDot, engineLabel } from "./engines";
import { domain } from "./http";

const tone = (n: number) => (n > 0 ? "text-pursue" : n < 0 ? "text-pass" : "text-graphite");

function Move({ label, move, sources }: { label: string; move?: ImpactMove; sources: Source[] }) {
  const s = move ? sources.find((x) => x.id === move.source_id) : undefined;
  return (
    <div>
      <p className="text-sm font-semibold text-graphite">{label}</p>
      <p className={`serif tnum text-[2.1rem] font-semibold leading-tight ${move ? tone(move.pct) : "text-faint"}`}>
        {move ? fmtPct(move.pct) : "not reported"}
      </p>
      {move && (
        <blockquote className="mt-2 border-l-2 border-rule bg-paper px-3 py-2">
          <p className="serif leading-snug">&ldquo;{move.quote}&rdquo;</p>
          {s && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-graphite">
              <EngineDot name={s.engine} />
              Found word for word in{" "}
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink hover:underline">
                {domain(s.url)}
              </a>
              , via {engineLabel(s.engine)}
            </p>
          )}
        </blockquote>
      )}
    </div>
  );
}

// One comparable past event. Shown only once its next-day move has a quote found in a source's text.
export function ImpactAnalogueCard({ a }: { a: ImpactAnalogue }) {
  return (
    <article className={`row-in border-l-[6px] bg-surface px-6 py-5 shadow-[0_1px_0_#d8dee4] ${a.day1.pct < 0 ? "border-pass" : a.day1.pct > 0 ? "border-pursue" : "border-rule"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="serif text-[1.45rem] font-medium leading-snug">
          {a.company}
          {a.ticker && <span className="ml-2 text-base text-graphite">{a.ticker}</span>}
        </p>
        <span className="tnum text-sm text-graphite">{a.date}</span>
      </div>
      <p className="mt-1.5 text-lg leading-snug">{a.what}</p>
      <div className="mt-4 grid gap-6 border-t border-rule-soft pt-4 md:grid-cols-2">
        <Move label="Next trading day" move={a.day1} sources={a.sources} />
        <Move label="About one month later" move={a.month1} sources={a.sources} />
      </div>
    </article>
  );
}

// The verified next-day moves on one axis, with the median marked.
export function ImpactStrip({ analogues, range }: { analogues: ImpactAnalogue[]; range: ImpactRange | null }) {
  if (analogues.length === 0) return null;
  const vals = analogues.map((a) => a.day1.pct);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const pad = Math.max(1, (hi - lo) * 0.08);
  const W = 1000;
  const x = (v: number) => 40 + ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (W - 80);
  return (
    <svg viewBox={`0 0 ${W} 120`} className="w-full" role="img" aria-label={`Next-day moves in ${analogues.length} past cases`}>
      <line x1={40} x2={W - 40} y1={64} y2={64} stroke="var(--color-rule)" strokeWidth={2} />
      <line x1={x(0)} x2={x(0)} y1={50} y2={78} stroke="var(--color-graphite)" strokeWidth={1.5} />
      <text x={x(0)} y={98} textAnchor="middle" fontSize={15} fill="var(--color-graphite)">0%</text>
      {range && (
        <>
          <line x1={x(range.median)} x2={x(range.median)} y1={34} y2={84} stroke="var(--color-ink)" strokeWidth={2} strokeDasharray="5 4" />
          <text x={x(range.median)} y={24} textAnchor="middle" fontSize={15} fontWeight={600} fill="var(--color-ink)">
            median {fmtPct(range.median)}
          </text>
        </>
      )}
      {analogues.map((a, i) => (
        <g key={i}>
          <circle cx={x(a.day1.pct)} cy={64} r={9} fill={a.day1.pct < 0 ? "var(--color-pass)" : a.day1.pct > 0 ? "var(--color-pursue)" : "var(--color-graphite)"} fillOpacity={0.85} stroke="#fff" strokeWidth={2}>
            <title>{`${a.company}, ${a.date}: ${fmtPct(a.day1.pct)}`}</title>
          </circle>
        </g>
      ))}
      <text x={40} y={114} fontSize={14} fill="var(--color-graphite)">{fmtPct(Math.min(...vals))}</text>
      <text x={W - 40} y={114} textAnchor="end" fontSize={14} fill="var(--color-graphite)">{fmtPct(Math.max(...vals))}</text>
    </svg>
  );
}

const TONE = {
  positive: "border-pursue/40 bg-pursue-soft text-pursue",
  negative: "border-pass/40 bg-pass-soft text-pass",
  mixed: "border-dig/40 bg-dig-soft text-dig",
};

export function ImpactSentimentList({ sentiment }: { sentiment: ImpactSentiment }) {
  return (
    <div>
      <p className="text-lg leading-snug">{sentiment.note}</p>
      {sentiment.items.length > 0 && (
        <ul className="mt-3 space-y-3">
          {sentiment.items.map((it, i) => (
            <li key={i} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-3">
              <span className={`mt-0.5 rounded-[3px] border px-2 py-0.5 text-center text-xs font-semibold ${TONE[it.tone]}`}>{it.tone}</span>
              <div className="min-w-0">
                <p className="serif text-[1.1rem] leading-snug">&ldquo;{it.quote}&rdquo;</p>
                <p className="flex items-center gap-1.5 truncate text-sm text-graphite">
                  <EngineDot name={it.source.engine} />
                  <a href={it.source.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {it.source.title || domain(it.source.url)}
                  </a>
                  , {domain(it.source.url)}, via {engineLabel(it.source.engine)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
