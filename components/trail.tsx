"use client";

import { useEffect, useRef, useState } from "react";
import type { Source, Trail } from "@/lib/types";
import { errorMessage, request, webUrl } from "./client-api";

export type Evidence = { trailId: string; source?: Source };

export function SourceChips({
  sources,
  onSelect,
}: {
  sources: Source[];
  onSelect: (source: Source) => void;
}) {
  return (
    <span className="source-chips">
      {sources.map((source, index) => (
        <button
          className="source-chip"
          key={source.id}
          type="button"
          title={`${source.title} · ${source.engine}`}
          aria-label={`Open source ${source.id.replace(/^s/, "") || index + 1}: ${source.title} via ${source.engine}`}
          onClick={() => onSelect(source)}
        >
          {source.id.replace(/^s(?=\d+$)/, "")}
        </button>
      ))}
    </span>
  );
}

export function TrailDrawer({ evidence, onClose }: { evidence: Evidence; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [trail, setTrail] = useState<Trail>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const { trailId, source } = evidence;

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    request<Trail>(`/api/trail/${encodeURIComponent(trailId)}`, {
      signal: controller.signal,
      cache: "no-store",
    }).then(setTrail).catch((reason) => {
      if (!controller.signal.aborted) setError(errorMessage(reason));
    });
    return () => controller.abort();
  }, [trailId, attempt]);

  return (
    <dialog
      className="trail-drawer"
      ref={dialog}
      aria-labelledby="trail-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="drawer-content">
        <div className="section-heading">
          <h2 id="trail-title">Research trail</h2>
          <button className="secondary" type="button" onClick={onClose}>Close</button>
        </div>
        {source && (
          <section className="source-detail" aria-label="Selected source">
            <p className="muted">{source.engine}{source.published ? ` · ${source.published.slice(0, 10)}` : ""}</p>
            <h3><ExternalLink url={source.url}>{source.title}</ExternalLink></h3>
            <p>{source.snippet}</p>
          </section>
        )}
        {error ? (
          <div>
            <p className="error" role="alert">{error}</p>
            <button className="secondary" type="button" onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}>Retry trail</button>
          </div>
        ) : !trail ? (
          <p role="status">Loading research trail…</p>
        ) : trail.steps.length === 0 ? (
          <p>No research steps recorded.</p>
        ) : (
          <ol className="trail-steps">
            {trail.steps.map((step, index) => (
              <li key={index}>
                <h3>{step.label}</h3>
                <p className="muted tabular">{step.kind} · {step.ms.toLocaleString()} ms</p>
                {step.query && !step.label.includes(step.query) && <p>{step.query}</p>}
                {step.engines?.length ? (
                  <ul className="trail-engines">
                    {step.engines.map((engine, engineIndex) => (
                      <li key={engineIndex}>
                        <strong>{engine.name}</strong>
                        <span className="tabular">{engine.latency_ms.toLocaleString()} ms · {engine.n_results} results</span>
                        {engine.error && <span className="error">{engine.error}</span>}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {step.urls?.length ? (
                  <ul className="trail-urls">
                    {step.urls.map((url, urlIndex) => <li key={urlIndex}><ExternalLink url={url}>{url}</ExternalLink></li>)}
                  </ul>
                ) : null}
                {step.telem_session_id && <p className="muted session">Telem session {step.telem_session_id}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </dialog>
  );
}

export function ExternalLink({ url, children }: { url: string; children: React.ReactNode }) {
  const href = webUrl(url);
  return href ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>;
}
