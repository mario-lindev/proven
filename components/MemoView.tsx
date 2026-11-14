"use client";

import SourceLink from "@/components/SourceLink";
import { useCallback, useMemo, useState } from "react";
import type { Line, Memo, Source, Trail } from "@/lib/types";
import SourceChip from "./SourceChip";
import TrailDrawer, { useTrail } from "./TrailDrawer";
import WatchPanel from "./WatchPanel";
import { EngineDot, engineLabel, isTavily } from "./engines";
import { domain, fmtDate, fmtMs, fmtTime } from "./http";
import { feedStats } from "./ResearchFeed";

export const VERDICT: Record<Memo["verdict"], { label: string; text: string; bg: string; bar: string; line: string }> = {
  pursue: { label: "Pursue", text: "text-pursue", bg: "bg-pursue-soft", bar: "bg-pursue", line: "border-pursue" },
  dig_deeper: { label: "Dig deeper", text: "text-dig", bg: "bg-dig-soft", bar: "bg-dig", line: "border-dig" },
  pass: { label: "Pass", text: "text-pass", bg: "bg-pass-soft", bar: "bg-pass", line: "border-pass" },
};

type Focus = { urls: string[]; source: Source | null };

export default function MemoView({ memo, trail: preloaded }: { memo: Memo; trail?: Trail | null }) {
  const [focus, setFocus] = useState<Focus | null>(null);
  const close = useCallback(() => setFocus(null), []);
  const { trail } = useTrail(memo.trail_id, preloaded);
  const [flash, setFlash] = useState<string | null>(null);

  const index = useMemo(() => new Map(memo.sources.map((s, i) => [s.id, i])), [memo.sources]);
  const v = VERDICT[memo.verdict] ?? VERDICT.dig_deeper;
  const pct = Math.round(memo.confidence * 100);
  const stats = trail ? feedStats(trail.steps) : null;
  const totalMs = stats?.spanMs ?? 0;

  const byEngine = useMemo(() => {
    const g = new Map<string, { s: Source; n: number }[]>();
    memo.sources.forEach((s, i) => {
      const k = s.engine || "unknown";
      g.set(k, [...(g.get(k) ?? []), { s, n: i + 1 }]);
    });
    // Telem-routed engines first, Tavily last.
    return [...g.entries()].sort((a, b) => Number(isTavily(a[0])) - Number(isTavily(b[0])) || b[1].length - a[1].length);
  }, [memo.sources]);

  const openLine = (ids: string[]) =>
    setFocus({
      urls: ids.map((id) => memo.sources[index.get(id) ?? -1]?.url).filter((u): u is string => !!u),
      source: memo.sources[index.get(ids[0]) ?? -1] ?? null,
    });

  function say(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2200);
  }

  async function copy(text: string, ok: string) {
    try {
      await navigator.clipboard.writeText(text);
      say(ok);
    } catch {
      say("Copy failed. Select the text and copy it by hand.");
    }
  }

  const shareUrl = () => `${window.location.origin}/memo/${encodeURIComponent(memo.id)}`;

  function markdown() {
    const cite = (ids: string[]) =>
      ids
        .map((id) => index.get(id))
        .filter((n): n is number => n !== undefined)
        .map((n) => `[${n + 1}]`)
        .join("");
    return [
      `# ${memo.company}: ${v.label} (${pct}% confidence)`,
      "",
      memo.summary,
      "",
      "## Facts",
      ...memo.facts.map((l) => `- ${l.text} ${cite(l.source_ids)}`),
      "",
      "## Risks",
      ...memo.risks.map((l) => `- ${l.text} ${cite(l.source_ids)}`),
      "",
      "## Ask the founder",
      ...memo.open_questions.map((q) => `- ${q}`),
      "",
      "## Sources",
      ...memo.sources.map((s, i) => `${i + 1}. [${s.title}](${s.url}) (found by ${engineLabel(s.engine)})`),
      "",
      `Memo by Proven, ${fmtTime(memo.created_at)}. Research trail: ${shareUrl()}`,
    ].join("\n");
  }

  function lineList(lines: Line[], kind: "fact" | "risk") {
    if (lines.length === 0) return <p className="text-graphite">Nothing here had a source, so nothing is listed.</p>;
    return (
      <ul className="divide-y divide-rule-soft">
        {lines.map((l, i) => (
          <li key={i} className="avoid-break">
            <div
              role="button"
              tabIndex={0}
              onClick={() => openLine(l.source_ids)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openLine(l.source_ids))}
              title="Show how Proven found this"
              className="group -mx-3 flex cursor-pointer gap-3 px-3 py-3 transition-colors hover:bg-paper"
            >
              <span
                aria-hidden
                className={`mt-[0.6em] h-[7px] w-[7px] shrink-0 ${kind === "risk" ? "bg-pass" : "bg-ink"}`}
              />
              <p className="serif text-[1.18rem] leading-[1.55]">
                {l.text}
                {l.source_ids.map((id) => {
                  const n = index.get(id);
                  if (n === undefined) return null;
                  const src = memo.sources[n];
                  return (
                    <SourceChip key={id} n={n + 1} source={src} onClick={() => setFocus({ urls: [src.url], source: src })} />
                  );
                })}
              </p>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <article className="space-y-10">
      <p className="print-only text-sm text-graphite">
        Proven memo, {fmtTime(memo.created_at)}. Every line cites a numbered source listed at the end.
      </p>

      <header className="grid gap-8 border-b border-rule pb-9 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <h1 className="serif break-words text-[3.4rem] font-semibold leading-[1.02] tracking-tight">{memo.company}</h1>
          <p className="serif mt-5 max-w-[42rem] text-[1.4rem] leading-[1.5] text-ink/90">{memo.summary}</p>
        </div>
        <div className={`print-plain self-start border-l-4 ${v.line} ${v.bg} px-6 py-5`}>
          <p className="text-graphite">Verdict</p>
          <p className={`serif text-[2.9rem] font-semibold leading-tight ${v.text}`}>{v.label}</p>
          <div className="mt-3 flex items-baseline justify-between text-sm">
            <span className="text-graphite">Confidence</span>
            <span className="tnum text-lg font-semibold">{pct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full bg-surface" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Confidence">
            <div className={`h-full ${v.bar}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-3 text-sm text-graphite">
            {memo.sources.length} sources
            {stats ? `, ${stats.queries} queries across ${stats.engines.size} engines` : ""}
          </p>
        </div>
      </header>

      <div className="no-print flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFocus({ urls: [], source: null })}
          className="rounded-md bg-ink px-4 py-2 font-medium text-white hover:bg-ink/85"
        >
          How Proven reached this
        </button>
        <Action onClick={() => copy(markdown(), "Copied as Markdown")}>Copy as Markdown</Action>
        <Action onClick={() => copy(shareUrl(), "Link copied")}>Copy share link</Action>
        <Action onClick={() => window.print()}>Print</Action>
        <span aria-live="polite" className="ml-2 text-sm font-medium text-pursue">
          {flash}
        </span>
      </div>

      <div className="memo-grid grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-10">
          <section className="avoid-break">
            <SectionTitle title="Facts" count={memo.facts.length} />
            {lineList(memo.facts, "fact")}
          </section>
          <section className="avoid-break">
            <SectionTitle title="Risks" count={memo.risks.length} />
            {lineList(memo.risks, "risk")}
          </section>
          <section className="avoid-break">
            <SectionTitle title="Ask the founder" count={memo.open_questions.length} />
            {memo.open_questions.length === 0 ? (
              <p className="text-graphite">No open questions.</p>
            ) : (
              <ol className="space-y-3">
                {memo.open_questions.map((q, i) => (
                  <li key={i} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2">
                    <span className="tnum pt-[0.2em] text-graphite">{i + 1}.</span>
                    <p className="serif text-[1.18rem] leading-[1.55]">{q}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-8">
          {trail && stats && (
            <section className="no-print border border-rule bg-surface p-5">
              <h3 className="font-semibold">The research behind it</h3>
              <dl className="tnum mt-3 grid grid-cols-3 gap-3">
                {[
                  ["queries", stats.queries],
                  ["engines", stats.engines.size],
                  ["time", fmtMs(totalMs)],
                ].map(([k, val]) => (
                  <div key={k} className="flex flex-col-reverse">
                    <dt className="text-sm text-graphite">{k}</dt>
                    <dd className="text-2xl font-medium">{val}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {[...stats.engines].map((n) => (
                  <span key={n} className="flex items-center gap-1.5">
                    <EngineDot name={n} />
                    {engineLabel(n)}
                  </span>
                ))}
              </p>
              <button
                type="button"
                onClick={() => setFocus({ urls: [], source: null })}
                className="mt-4 font-medium text-cobalt hover:underline"
              >
                Open the full trail
              </button>
            </section>
          )}

          <section>
            <SectionTitle title="Sources" count={memo.sources.length} />
            <div className="space-y-5">
              {byEngine.map(([engine, items]) => (
                <div key={engine} className="avoid-break">
                  <p className="mb-1.5 flex items-center gap-2 text-sm">
                    <EngineDot name={engine} />
                    <span className="font-semibold">{engineLabel(engine)}</span>
                    <span className="text-graphite">{isTavily(engine) ? "Tavily search" : "routed by Telem"}</span>
                  </p>
                  <ol className="space-y-2.5 border-l border-rule pl-4">
                    {items.map(({ s, n }) => (
                      <li key={s.id} className="grid grid-cols-[1.6rem_minmax(0,1fr)] gap-1.5">
                        <span className="tnum pt-0.5 text-sm font-semibold text-cobalt">{n}</span>
                        <div className="min-w-0">
                          <SourceLink url={s.url}
                            className="font-medium leading-snug hover:underline"
                          >
                            {s.title}
                          </SourceLink>
                          <p className="truncate text-sm text-graphite">
                            {domain(s.url)}
                            {s.published ? `, ${fmtDate(s.published)}` : ""}
                          </p>
                          <p className="print-only break-all text-xs text-graphite">{s.url}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>

          <div className="no-print">
            <WatchPanel company={memo.company} />
          </div>

          <p className="text-sm text-graphite">Written {fmtTime(memo.created_at)}</p>
        </aside>
      </div>

      <TrailDrawer
        trailId={focus ? memo.trail_id : null}
        trail={trail}
        focusUrls={focus?.urls ?? []}
        focusSource={focus?.source}
        onClose={close}
      />
    </article>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <h2 className="mb-2 flex items-baseline gap-2 border-b-2 border-ink pb-2 text-lg font-semibold">
      {title}
      <span className="tnum text-sm font-normal text-graphite">{count}</span>
    </h2>
  );
}

function Action({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-rule bg-surface px-4 py-2 font-medium text-ink hover:border-ink"
    >
      {children}
    </button>
  );
}
