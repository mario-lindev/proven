"use client";

import SourceLink from "@/components/SourceLink";
import { useEffect, useRef, useState } from "react";
import type { Source, Trail, TrailStep } from "@/lib/types";
import ErrorBox from "./ErrorBox";
import { EngineBar, EngineDot, engineLabel, splitEngines } from "./engines";
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
};

export default function TrailDrawer({
  trailId,
  focusUrls = [],
  focusSource,
  trail: preloaded,
  onClose,
}: {
  trailId: string | null;
  focusUrls?: string[];
  focusSource?: Source | null;
  trail?: Trail | null;
  onClose: () => void;
}) {
  const { trail, error } = useTrail(trailId, preloaded);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!trailId) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    };
  }, [trailId]);

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
    <dialog
      ref={dialogRef}
      aria-labelledby="trail-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="no-print fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-[44rem] overflow-hidden bg-surface text-ink shadow-2xl sm:rounded-l-2xl backdrop:bg-black/70"
    >
      <aside className="drawer-in flex h-full flex-col">
        <div className="border-b border-rule px-4 pb-4 pt-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <h2 id="trail-title" className="text-3xl font-semibold tracking-tight">
              How Proven reached this
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-rule px-3 py-1.5 text-graphite hover:border-ink hover:text-ink"
            >
              Close
            </button>
          </div>
          {trail && (
            <dl className="tnum mt-4 grid grid-cols-2 gap-x-4 gap-y-2 min-[390px]:grid-cols-4">
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
            <div className="mt-4 rounded-lg bg-cobalt-soft px-4 py-3">
              <p className="text-sm text-graphite">Tracing the cited source</p>
              <p className="mt-0.5 font-medium">{focusSource.title}</p>
              <p className="mt-0.5 flex items-center gap-1.5 break-all text-sm text-graphite">
                <EngineDot name={focusSource.engine} />
                {engineLabel(focusSource.engine)}, {domain(focusSource.url)}
              </p>
            </div>
          )}
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-7">
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
                      hit ? "-mx-2 rounded-lg bg-cobalt-soft px-3 pt-3 ring-1 ring-cobalt/30" : ""
                    }`}
                  >
                    <span
                      className={`tnum flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                        s.kind === "llm" ? "bg-ink text-paper" : s.kind === "search" ? "border-2 border-cobalt text-cobalt" : "border-2 border-ink text-ink"
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
                          {s.kind === "search" ? "This search found the cited source" : "This step read the cited page"}
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
                                <SourceLink url={u}
                                  className={`hover:underline ${focusUrls.includes(u) ? "font-semibold text-cobalt" : "text-ink"}`}
                                >
                                  {domain(u)}
                                  <span className="text-faint">{u.replace(/^https?:\/\/[^/]+/, "")}</span>
                                </SourceLink>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}

                      {s.telem_session_id && (
                        <p className="mt-2 text-sm text-faint">
                          Telem session <span className="break-all font-mono">{s.telem_session_id}</span>
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
    </dialog>
  );
}
