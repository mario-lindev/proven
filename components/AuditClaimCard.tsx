"use client";

import type { AuditCheck, AuditClaim, AuditVerdict } from "@/lib/brain/audit";
import { EngineDot, engineLabel } from "./engines";
import { domain } from "./http";
import AsciiStrip from "./proof/AsciiStrip";

export const AUDIT_VERDICT: Record<AuditVerdict, { label: string; text: string; line: string; bg: string }> = {
  supported: { label: "Holds up", text: "text-pursue", line: "border-pursue", bg: "bg-pursue-soft" },
  contradicted: { label: "Contradicted", text: "text-pass", line: "border-pass", bg: "bg-pass-soft" },
  unclear: { label: "Unclear", text: "text-dig", line: "border-dig", bg: "bg-dig-soft" },
};

// One claim the company makes about itself. Pending until its check streams in, then green / red / amber.
export default function AuditClaimCard({
  claim,
  check,
  onTrail,
}: {
  claim: AuditClaim;
  check?: AuditCheck;
  onTrail: (trailId: string) => void;
}) {
  const v = check ? AUDIT_VERDICT[check.verdict] ?? AUDIT_VERDICT.unclear : null;
  const quoteSource = check?.quote ? check.sources.find((s) => s.id === check.quote_source_id) : undefined;
  return (
    <article
      className={`row-in relative overflow-hidden rounded-lg border border-rule border-l-[6px] bg-surface px-6 py-5 ${v ? v.line : "border-l-rule"}`}
    >
      {!v && (
        <AsciiStrip kind="scan" color="#2c46c9" label="" className="pointer-events-none absolute inset-x-0 top-0 h-3 w-full opacity-70" />
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        {v ? (
          <p className={`rounded-[4px] px-3 py-1 font-mono text-sm font-medium uppercase tracking-[0.08em] ${v.bg} ${v.text}`}>
            {v.label}
          </p>
        ) : (
          <p className="flex items-center gap-3 font-mono text-sm font-medium uppercase tracking-[0.08em] text-cobalt" role="status">
            <span className="pulse-dot h-2 w-2 rounded-full bg-cobalt" aria-hidden />
            Checking against the web
          </p>
        )}
        <span className="tnum font-mono text-xs text-graphite">
          {String(claim.index + 1).padStart(2, "0")} / {claim.category}
        </span>
      </div>

      <p className="serif mt-2 text-[1.45rem] font-medium leading-snug">{claim.claim}</p>
      <p className="mt-1.5 text-graphite">
        The company says: <span className="text-ink/80">&ldquo;{claim.sentence.replace(/\s+/g, " ")}&rdquo;</span>
      </p>

      {check && v && (
        <>
          <p className="mt-3 text-lg leading-snug">{check.note}</p>
          {check.quote && (
            <blockquote className={`mt-3 border-l-2 ${v.line} ${v.bg} px-4 py-3`}>
              <p className="font-mono text-[0.95rem] leading-[1.6]">&ldquo;{check.quote}&rdquo;</p>
              {quoteSource && (
                <p className="mt-1 text-sm text-graphite">
                  Found word for word in {domain(quoteSource.url)}, an independent source
                </p>
              )}
            </blockquote>
          )}
          {check.sources.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-rule-soft pt-3">
              {check.sources.map((s, i) => (
                <li key={s.id} className="grid grid-cols-[1.4rem_minmax(0,1fr)_auto] items-start gap-x-2">
                  <span className="tnum text-sm font-semibold text-cobalt">{i + 1}</span>
                  <div className="min-w-0">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                      {s.title || domain(s.url)}
                    </a>
                    <p className="flex items-center gap-1.5 truncate text-sm text-graphite">
                      <EngineDot name={s.engine} />
                      <span className="truncate">{`${engineLabel(s.engine)}, ${domain(s.url)}`}</span>
                    </p>
                  </div>
                  <span
                    className={`mt-0.5 shrink-0 rounded-[3px] border px-2 py-0.5 text-xs font-semibold ${
                      s.independent ? "border-cobalt/30 bg-cobalt-soft text-cobalt" : "border-rule bg-paper text-graphite"
                    }`}
                  >
                    {s.independent ? "Independent" : "Company's own"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {check.trail_id && (
            <button type="button" onClick={() => onTrail(check.trail_id)} className="mt-4 font-medium text-cobalt hover:underline">
              See the searches behind this
            </button>
          )}
        </>
      )}
    </article>
  );
}
