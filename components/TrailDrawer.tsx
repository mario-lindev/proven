"use client";

import { useEffect, useRef, useState } from "react";
import type { Trail, TrailStep } from "@/lib/types";
import ErrorBox from "./ErrorBox";
import { api, domain, errMsg, fmtMs } from "./http";

const KIND: Record<TrailStep["kind"], { label: string; short: string; tone: string }> = {
  search: { label: "Search", short: "S", tone: "bg-accent text-white" },
  fetch: { label: "Fetch", short: "F", tone: "bg-sky-700 text-white" },
  extract: { label: "Extract", short: "E", tone: "bg-indigo-700 text-white" },
  llm: { label: "AI", short: "AI", tone: "bg-neutral-800 text-white" },
};

export default function TrailDrawer({
  trailId,
  focusUrls = [],
  onClose,
}: {
  trailId: string | null;
  focusUrls?: string[];
  onClose: () => void;
}) {
  if (!trailId) return null;
  return <Drawer key={trailId} trailId={trailId} focusUrls={focusUrls} onClose={onClose} />;
}

function Drawer({ trailId, focusUrls, onClose }: {
  trailId: string;
  focusUrls: string[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [trail, setTrail] = useState<Trail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<Trail>(`/api/trail/${encodeURIComponent(trailId)}`, undefined, controller.signal)
      .then(setTrail)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errMsg(e));
      });
    return () => controller.abort();
  }, [trailId, attempt]);

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="trail-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-xl bg-white shadow-2xl backdrop:bg-black/30"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-line px-7 py-6">
          <div>
            <h2 id="trail-title" className="text-2xl font-semibold tracking-tight">Research trail</h2>
            {trail && (
              <p className="mt-1 text-muted">
                {trail.steps.length} research steps
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-muted hover:bg-soft hover:text-foreground"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-6">
          {error && (
            <>
              <ErrorBox message={error} />
              <button type="button" className="mt-3 font-semibold text-accent underline" onClick={() => {
                setError(null);
                setAttempt((value) => value + 1);
              }}>Retry trail</button>
            </>
          )}
          {!error && !trail && <p className="text-muted" role="status">Loading the trail…</p>}
          {trail && focusUrls.length > 0 && !trail.steps.some((step) => step.urls?.some((url) => focusUrls.includes(url))) && (
            <p className="mb-5 rounded-lg bg-soft p-3 text-sm text-muted">The cited URL does not appear in the recorded steps.</p>
          )}
          {trail && trail.steps.length === 0 && <p className="text-muted">No steps were recorded.</p>}
          {trail && (
            <ol className="relative">
              {trail.steps.map((s, i) => {
                const k = KIND[s.kind] ?? KIND.llm;
                const hit = focusUrls.length > 0 && (s.urls ?? []).some((u) => focusUrls.includes(u));
                return (
                  <li key={i} className="relative flex gap-4 pb-7 last:pb-0">
                    {i < trail.steps.length - 1 && (
                      <span className="absolute left-[17px] top-9 h-[calc(100%-2.25rem)] w-px bg-line" />
                    )}
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${k.tone}`}
                    >
                      {k.short}
                    </span>
                    <div
                      className={`min-w-0 flex-1 rounded-xl ${hit ? "-m-2 bg-accent-soft p-2 ring-1 ring-accent/40" : ""}`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                          <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-muted">
                            {k.label}
                          </span>
                          <span className="font-medium">{s.label}</span>
                        </div>
                        <span className="shrink-0 font-mono text-sm text-muted">{fmtMs(s.ms)}</span>
                      </div>
                      {hit && <p className="mt-1 text-sm font-medium text-accent">This step includes the cited source</p>}

                      {!!s.routing?.length && (
                        <p className="mt-2 break-words text-sm">
                          <strong>Telem selected</strong> {s.routing.join(", ")}
                        </p>
                      )}

                      {s.engines && s.engines.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {s.engines.map((en, j) => (
                            <span
                              key={j}
                              title={en.error}
                              className={`rounded-full border px-3 py-1 text-sm ${
                                en.error
                                  ? "border-red-300 bg-red-50 text-red-800"
                                  : "border-line bg-soft text-foreground"
                              }`}
                            >
                              <span className="font-semibold">{en.name}</span>
                              <span className="ml-2 font-mono text-xs text-muted">{fmtMs(en.latency_ms)}</span>
                              <span className="ml-2 text-xs text-muted">
                                {en.error ? `error: ${en.error}` : `${en.n_results} results`}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}

                      {s.urls && s.urls.length > 0 && (
                        <ul className="mt-3 space-y-1">
                          {s.urls.map((u) => (
                            <li key={u} className="truncate text-sm">
                              <a
                                href={u}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`hover:underline ${focusUrls.includes(u) ? "font-semibold text-accent" : "text-muted"}`}
                              >
                                {domain(u)}
                                <span className="text-muted/70">{u.replace(/^https?:\/\/[^/]+/, "")}</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}

                      {s.telem_session_id && (
                        <p className="mt-3 break-all text-xs text-muted">
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
      </div>
    </dialog>
  );
}
