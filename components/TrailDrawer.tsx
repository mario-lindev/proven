"use client";

import { useEffect, useState } from "react";
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
  const [trail, setTrail] = useState<Trail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trailId) return;
    let live = true;
    setTrail(null);
    setError(null);
    api<Trail>(`/api/trail/${encodeURIComponent(trailId)}`)
      .then((t) => live && setTrail(t))
      .catch((e) => live && setError(errMsg(e)));
    return () => {
      live = false;
    };
  }, [trailId]);

  useEffect(() => {
    if (!trailId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trailId, onClose]);

  if (!trailId) return null;

  const total = trail?.steps.reduce((a, s) => a + s.ms, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-line px-7 py-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">How Proven reached this</h2>
            {trail && (
              <p className="mt-1 text-muted">
                {trail.steps.length} steps, {fmtMs(total)}
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
          {error && <ErrorBox message={error} />}
          {!error && !trail && <p className="text-muted">Loading the trail...</p>}
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
                      {hit && <p className="mt-1 text-sm font-medium text-accent">This step found the cited source</p>}

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
                        <p className="mt-3 text-xs text-muted">
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
