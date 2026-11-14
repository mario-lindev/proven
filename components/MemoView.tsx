"use client";

import { useCallback, useId, useMemo, useState } from "react";
import type { Evidence, Line, Memo, Source, Trail } from "@/lib/types";
import SourceChip from "./SourceChip";
import TrailDrawer, { useTrail } from "./TrailDrawer";
import WatchPanel from "./WatchPanel";
import { Check, EngineDot, engineLabel, isTavily } from "./engines";
import { domain, fmtDate, fmtMs, fmtTime } from "./http";
import { feedStats } from "./ResearchFeed";

export const VERDICT: Record<Memo["verdict"], { label: string; text: string; bg: string; bar: string; line: string }> = {
  pursue: { label: "Pursue", text: "text-pursue", bg: "bg-pursue-soft", bar: "bg-pursue", line: "border-pursue" },
  dig_deeper: { label: "Dig deeper", text: "text-dig", bg: "bg-dig-soft", bar: "bg-dig", line: "border-dig" },
  pass: { label: "Pass", text: "text-pass", bg: "bg-pass-soft", bar: "bg-pass", line: "border-pass" },
};

type Focus = { urls: string[]; source: Source | null; evidence?: Evidence | null };

const evidenceFor = (l: Line, sourceId: string | undefined) => l.evidence?.find((e) => e.source_id === sourceId) ?? null;

// "supported" if any quote fully backs the line, "partial" if quotes only partly do, null when unchecked.
const lineStatus = (l: Line) =>
  !l.evidence || l.evidence.length === 0 ? null : l.evidence.some((e) => e.verdict === "supported") ? "supported" : "partial";

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

  // Opening a line traces its first quoted source (or its first cited one if nothing was quoted).
  const openLine = (l: Line) => {
    const first = l.evidence?.[0]?.source_id ?? l.source_ids[0];
    setFocus({
      urls: l.source_ids.map((id) => memo.sources[index.get(id) ?? -1]?.url).filter((u): u is string => !!u),
      source: memo.sources[index.get(first) ?? -1] ?? null,
      evidence: evidenceFor(l, first),
    });
  };

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
    // Each line, then the quotes that back it as a blockquote inside the list item.
    const item = (l: Line) => {
      const st = lineStatus(l);
      const head = `- ${l.text} ${cite(l.source_ids)}${st === "supported" ? " (verified)" : st === "partial" ? " (partly verified)" : ""}`;
      const quotes = (l.evidence ?? []).map(
        (e) => `  > "${e.quote}" ${cite([e.source_id])}${e.verdict === "partial" ? " (partial)" : ""}`,
      );
      return quotes.length ? `${head}\n${quotes.join("\n  >\n")}` : head;
    };
    const ver = memo.verification;
    return [
      `# ${memo.company}: ${v.label} (${pct}% confidence)`,
      "",
      memo.summary,
      "",
      ...(ver && ver.checked > 0
        ? [`Verified: ${ver.kept} of ${ver.checked} lines checked against the text of their sources, ${ver.dropped} dropped.`, ""]
        : []),
      "## Facts",
      ...memo.facts.map(item),
      "",
      "## Risks",
      ...memo.risks.map(item),
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
            <LineRow
              line={l}
              kind={kind}
              sources={memo.sources}
              index={index}
              checked={!!memo.verification}
              onOpen={() => openLine(l)}
              onSource={(src) => setFocus({ urls: [src.url], source: src, evidence: evidenceFor(l, src.id) })}
            />
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
          {memo.verification && memo.verification.checked > 0 && (
            <p
              className="mt-3 flex items-start gap-2 border-t border-ink/10 pt-3 text-sm leading-snug"
              title={`Claude re-read each line against the text of its sources in ${fmtMs(memo.verification.ms)}. Lines with no supporting quote were dropped.`}
            >
              <Check className="mt-[2px] h-3.5 w-3.5 shrink-0 text-pursue" />
              <span>
                <span className="tnum font-semibold">
                  {memo.verification.kept} of {memo.verification.checked}
                </span>{" "}
                lines verified against their sources
                {memo.verification.dropped > 0 ? `, ${memo.verification.dropped} dropped` : ", none dropped"}
              </span>
            </p>
          )}
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
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium leading-snug hover:underline"
                          >
                            {s.title}
                          </a>
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
        focusEvidence={focus?.evidence}
        onClose={close}
      />
    </article>
  );
}

// One fact or risk. Hover or focus shows the quotes that back it; click opens the trail.
function LineRow({
  line,
  kind,
  sources,
  index,
  checked,
  onOpen,
  onSource,
}: {
  line: Line;
  kind: "fact" | "risk";
  sources: Source[];
  index: Map<string, number>;
  checked: boolean; // the memo went through the verify pass
  onOpen: () => void;
  onSource: (s: Source) => void;
}) {
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const [chipOpen, setChipOpen] = useState(false);
  const pid = useId();
  const status = lineStatus(line);
  const evidence = (line.evidence ?? []).filter((e) => index.has(e.source_id));
  const open = (hover || focused) && !chipOpen;
  const dot = kind === "risk" ? "pass" : "ink";

  return (
    <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-describedby={open ? pid : undefined}
        className="group -mx-3 flex cursor-pointer gap-3 px-3 py-3 transition-colors hover:bg-paper"
      >
        <span
          aria-hidden
          className={`mt-[0.6em] h-[7px] w-[7px] shrink-0 ${
            status ? (dot === "pass" ? "bg-pass" : "bg-ink") : dot === "pass" ? "border border-pass" : "border border-ink/60"
          }`}
        />
        <p className="serif text-[1.18rem] leading-[1.55]">
          {line.text}
          {line.source_ids.map((id) => {
            const n = index.get(id);
            if (n === undefined) return null;
            const src = sources[n];
            return (
              <SourceChip
                key={id}
                n={n + 1}
                source={src}
                quote={line.evidence?.find((e) => e.source_id === id)}
                onOpenChange={setChipOpen}
                onClick={() => onSource(src)}
              />
            );
          })}
          {status && (
            <span
              className={`relative -top-[0.15em] ml-2 inline-flex items-center gap-1 whitespace-nowrap font-sans text-[0.74rem] font-semibold ${
                status === "supported" ? "text-pursue" : "text-dig"
              }`}
            >
              <Check className="h-3 w-3" />
              {status === "supported" ? "verified" : "partly verified"}
            </span>
          )}
          {!status && checked && (
            <span className="relative -top-[0.15em] ml-2 whitespace-nowrap font-sans text-[0.74rem] text-faint">unverified</span>
          )}
        </p>
      </div>

      {open && (
        <div
          id={pid}
          role="tooltip"
          className="no-print pointer-events-none absolute left-7 top-full z-30 -mt-1 w-[min(38rem,calc(100%-1.75rem))] border border-rule bg-surface p-4 shadow-[0_12px_32px_-12px_rgba(20,32,43,0.35)]"
        >
          {evidence.length > 0 ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-medium text-pursue">
                <Check className="h-3.5 w-3.5" />
                Checked against the text of {evidence.length === 1 ? "its source" : `${evidence.length} sources`}
              </p>
              <ul className="mt-3 space-y-3.5">
                {evidence.map((e, i) => {
                  const n = index.get(e.source_id)!;
                  const s = sources[n];
                  return (
                    <li key={i}>
                      <blockquote
                        className={`serif border-l-2 pl-3 text-[1.05rem] leading-snug text-ink ${
                          e.verdict === "supported" ? "border-pursue" : "border-dig"
                        }`}
                      >
                        &ldquo;{e.quote}&rdquo;
                      </blockquote>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-3 text-sm text-graphite">
                        <span className="tnum font-semibold text-cobalt">{n + 1}</span>
                        <span className="max-w-[18rem] truncate font-medium text-ink">{s.title}</span>
                        <span>{domain(s.url)}</span>
                        <span className="flex items-center gap-1">
                          <EngineDot name={s.engine} />
                          {engineLabel(s.engine)}
                        </span>
                        <span className={`font-medium ${e.verdict === "supported" ? "text-pursue" : "text-dig"}`}>
                          {e.verdict === "supported" ? "supports the line" : "partly supports it"}
                        </span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-sm text-graphite">
              {checked
                ? "No exact quote for this line was found in its sources."
                : "Not checked against its sources. This memo was written before Proven verified each line."}
            </p>
          )}
          <p className="mt-3 border-t border-rule-soft pt-2.5 text-sm text-faint">Click the line to see the searches behind it.</p>
        </div>
      )}
    </div>
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
