"use client";

import { useEffect, useRef, useState } from "react";
import type { Evidence, Source, Trail, TrailStep } from "@/lib/types";
import ErrorBox from "./ErrorBox";
import { Check, EngineBar, EngineDot, TopicChip, engineLabel, splitEngines } from "./engines";
import { api, domain, errMsg, fmtMs } from "./http";
import { feedStats } from "./ResearchFeed";

export function useTrail(trailId: string | null, preloaded?: Trail | null) {
  const [trail, setTrail] = useState<Trail | null>(preloaded ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!trailId) return;
    if (preloaded && preloaded.id === trailId) {
      setTrail(preloaded);
      return;
    }
    let live = true;
    setError(null);
    api<Trail>(`/api/trail/${encodeURIComponent(trailId)}`)
      .then((t) => live && setTrail(t))
      .catch((e) => live && setError(errMsg(e)));
    return () => {
      live = false;
    };
  }, [trailId, preloaded]);
  return { trail, error };
}

const KIND: Record<TrailStep["kind"], string> = {
  search: "Search",
  fetch: "Fetch",
  extract: "Read pages",
  llm: "Claude",
  verify: "Verify",
  learn: "Learn",
};

export default function TrailDrawer({
  trailId,
  focusUrls = [],
  focusSource,
  focusEvidence,
  trail: preloaded,
  onClose,
}: {
  trailId: string | null;
  focusUrls?: string[];
  focusSource?: Source | null;
  focusEvidence?: Evidence | null;
  trail?: Trail | null;
  onClose: () => void;
}) {
  const { trail, error } = useTrail(trailId, preloaded);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!trailId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [trailId, onClose]);

  // Scroll the first step that found a cited source into view.
  useEffect(() => {
    if (!trail || focusUrls.length === 0) return;
    const el = bodyRef.current?.querySelector("[data-hit='true']");
    el?.scrollIntoView({ block: "center" });
  }, [trail, focusUrls]);

  if (!trailId) return null;

  const steps = trail?.steps ?? [];
  const stats = feedStats(steps);
  const total = stats.spanMs;
  const scale = Math.max(1500, ...steps.flatMap((s) => (s.engines ?? []).map((e) => e.latency_ms)));

  return (
    <div className="no-print fixed inset-0 z-40" role="dialog" aria-modal="true" aria-labelledby="trail-title">
      <div className="absolute inset-0 bg-ink/35" onClick={onClose} />
      <aside className="drawer-in absolute right-0 top-0 flex h-full w-full max-w-[44rem] flex-col bg-surface shadow-2xl">
        <div className="border-b border-rule px-7 pb-5 pt-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id="trail-title" className="serif text-3xl font-semibold tracking-tight">
              How Proven reached this
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="rounded-md border border-rule px-3 py-1.5 text-graphite hover:border-ink hover:text-ink"
            >
              Close
            </button>
          </div>
          {trail && (
            <dl className="tnum mt-4 grid grid-cols-4 gap-4">
              {[
                ["steps", steps.length],
                ["queries", stats.queries],
                ["engines", stats.engines.size],
                ["total time", fmtMs(total)],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col-reverse">
                  <dt className="text-sm text-graphite">{k}</dt>
                  <dd className="text-2xl font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {focusSource && (
            <div className="mt-4 border-l-2 border-cobalt bg-cobalt-soft px-4 py-3">
              <p className="text-sm text-graphite">Tracing the cited source</p>
              <p className="mt-0.5 font-medium">{focusSource.title}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-graphite">
                <EngineDot name={focusSource.engine} />
                <span>{`${engineLabel(focusSource.engine)}, ${domain(focusSource.url)}`}</span>
              </p>
              {focusEvidence && (
                <p className="mt-2.5 border-t border-cobalt/15 pt-2.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-pursue">
                    <Check className="h-3.5 w-3.5" />
                    {focusEvidence.verdict === "supported" ? "Quote that backs the line" : "Quote that partly backs the line"}
                  </span>
                  <q className="serif mt-1 block text-[1.02rem] leading-snug">{focusEvidence.quote}</q>
                </p>
              )}
            </div>
          )}
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-7 py-6">
          {error && <ErrorBox message={error} />}
          {!error && !trail && <p className="text-graphite">Loading the trail.</p>}
          {trail && steps.length === 0 && <p className="text-graphite">No steps were recorded for this one.</p>}
          {trail && (
            <ol>
              {steps.map((s, i) => {
                const hit = focusUrls.length > 0 && (s.urls ?? []).some((u) => focusUrls.includes(u));
                const { telem, tavily } = splitEngines(s.engines);
                return (
                  <li
                    key={i}
                    data-hit={hit}
                    className={`relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 pb-6 last:pb-0 ${
                      hit ? "-mx-3 bg-cobalt-soft px-3 pt-3 ring-1 ring-cobalt/30" : ""
                    }`}
                  >
                    <span
                      className={`tnum flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                        s.kind === "llm"
                          ? "bg-ink text-white"
                          : s.kind === "verify"
                            ? "bg-pursue text-white"
                            : s.kind === "learn"
                              ? "bg-cobalt text-white"
                              : s.kind === "search"
                                ? "border-2 border-cobalt text-cobalt"
                                : "border-2 border-ink text-ink"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0">
                          <span className="mr-2 text-sm text-graphite">{KIND[s.kind] ?? s.kind}</span>
                          {s.kind === "search" ? (
                            <span className="break-words font-mono text-[0.9rem]">{s.query ?? s.label}</span>
                          ) : (
                            <span className="font-medium">{s.label}</span>
                          )}
                        </p>
                        <span className="tnum shrink-0 text-sm text-graphite">{fmtMs(s.ms)}</span>
                      </div>
                      {hit && (
                        <p className="mt-1 text-sm font-medium text-cobalt">
                          {s.kind === "search"
                            ? "This search found the cited source"
                            : s.kind === "verify"
                              ? "This step found the quote in the cited page"
                              : "This step read the cited page"}
                        </p>
                      )}
                      {s.topic && (
                        <p className="mt-1.5 flex items-center gap-2 text-sm text-graphite">
                          Telem topic <TopicChip topic={s.topic} />
                        </p>
                      )}
                      {s.routing && s.routing.length > 0 && (
                        <p className="mt-1 text-sm text-cobalt">
                          Telem&rsquo;s router chose {s.routing.map(engineLabel).join(", ")}
                        </p>
                      )}

                      {s.engines && s.engines.length > 0 && (
                        <div className="mt-3 space-y-3">
                          {telem.length > 0 && (
                            <div>
                              <p className="mb-1.5 text-sm text-graphite">
                                {s.kind === "search" ? "Telem routed to" : "Telem"}
                              </p>
                              <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                                {telem.map((e, j) => (
                                  <EngineBar key={j} e={e} scale={scale} />
                                ))}
                              </div>
                            </div>
                          )}
                          {tavily.length > 0 && (
                            <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
                              {tavily.map((e, j) => (
                                <EngineBar key={j} e={e} scale={scale} />
                              ))}
                            </div>
                          )}
                          {s.engines
                            .filter((e) => e.error)
                            .map((e, j) => (
                              <p key={`err${j}`} className="text-sm text-graphite">
                                {engineLabel(e.name)} failed: {e.error}
                              </p>
                            ))}
                        </div>
                      )}

                      {s.urls && s.urls.length > 0 && (
                        <details className="mt-3 text-sm" open={hit}>
                          <summary className="cursor-pointer text-graphite hover:text-ink">
                            {s.urls.length} page{s.urls.length === 1 ? "" : "s"}
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {s.urls.map((u) => (
                              <li key={u} className="truncate">
                                <a
                                  href={u}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`hover:underline ${focusUrls.includes(u) ? "font-semibold text-cobalt" : "text-ink"}`}
                                >
                                  {domain(u)}
                                  <span className="text-faint">{u.replace(/^https?:\/\/[^/]+/, "")}</span>
                                </a>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}

                      {s.telem_session_id && (
                        <p className="mt-2 text-sm text-faint">
                          Telem session <span className="font-mono">{s.telem_session_id}</span>
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </aside>
    </div>
  );
}
