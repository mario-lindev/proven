"use client";

import { type FormEvent, useEffect, useState } from "react";
import type { Line, Memo, Source, Watch } from "@/lib/types";
import { errorMessage, post, request } from "./client-api";
import { type Evidence, ExternalLink, SourceChips, TrailDrawer } from "./trail";

const verdicts = { pursue: "Pursue", dig_deeper: "Dig deeper", pass: "Pass" };

export function Diligence({ demo }: { demo: boolean }) {
  const [company, setCompany] = useState("");
  const [memo, setMemo] = useState<Memo>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [evidence, setEvidence] = useState<Evidence>();

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !company.trim()) return;
    setBusy(true);
    setError("");
    setMemo(undefined);
    try {
      setMemo(await post<Memo>("/api/memo", { company: company.trim() }));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace">
      <section className={memo ? "intro compact" : "intro"}>
        <h1>Due diligence</h1>
        <p>Research a company, vendor or market and trace the evidence behind the verdict.</p>
        {demo && <p className="demo-note">Demo mode uses sample evidence for Acme Robotics.</p>}
        <form onSubmit={check} className="search-form">
          <div className="field">
            <label htmlFor="company">Company, vendor or market</label>
            <input id="company" value={company} placeholder="Acme Robotics" required
              onChange={(event) => setCompany(event.target.value)} />
          </div>
          <button className="primary" disabled={busy || !company.trim()}>{busy ? "Checking…" : "Check"}</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      {busy && (
        <section className="loading report" role="status">
          <h2>Building the memo</h2>
          <ol>
            <li>Plan the research</li>
            <li>Search and extract relevant sources</li>
            <li>Check claims and write the memo</li>
          </ol>
        </section>
      )}
      {memo && <MemoReport memo={memo} demo={demo} onEvidence={setEvidence} />}
      {evidence && <TrailDrawer evidence={evidence} onClose={() => setEvidence(undefined)} />}
    </main>
  );
}

function MemoReport({ memo, demo, onEvidence }: { memo: Memo; demo: boolean; onEvidence: (value: Evidence) => void }) {
  const byId = new Map(memo.sources.map((source) => [source.id, source]));
  const select = (source?: Source) => onEvidence({ trailId: memo.trail_id, source });

  return (
    <article className="report">
      <header className="report-header">
        <div>
          <h2>{demo ? "Acme Robotics" : memo.company}</h2>
          <div className="verdict-row">
            <span className={`verdict ${memo.verdict}`}>{verdicts[memo.verdict]}</span>
            <span className="muted tabular">{Math.round(memo.confidence * 100)}% confidence</span>
          </div>
        </div>
        <button className="secondary" type="button" onClick={() => select()}>Research trail</button>
      </header>
      <p className="summary">{memo.summary}</p>
      <MemoLines title="Facts" lines={memo.facts} byId={byId} onSelect={select} />
      <MemoLines title="Risks" lines={memo.risks} byId={byId} onSelect={select} />
      <section className="report-section">
        <h3>Open questions</h3>
        {memo.open_questions.length ? (
          <ul className="report-list">{memo.open_questions.map((question, index) => <li key={index}>{question}</li>)}</ul>
        ) : <p className="muted">No open questions returned.</p>}
      </section>
      <WatchPanel key={memo.id} company={demo ? "Acme Robotics" : memo.company} />
    </article>
  );
}

function MemoLines({
  title, lines, byId, onSelect,
}: { title: string; lines: Line[]; byId: Map<string, Source>; onSelect: (source: Source) => void }) {
  return (
    <section className="report-section">
      <h3>{title}</h3>
      {lines.length ? (
        <ul className="report-list">
          {lines.map((line, index) => (
            <li key={index}>
              {line.text}{" "}
              <SourceChips sources={[...new Set(line.source_ids)].flatMap((id) => {
                const source = byId.get(id);
                return source ? [source] : [];
              })} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      ) : <p className="muted">No sourced {title.toLowerCase()} returned.</p>}
    </section>
  );
}

function WatchPanel({ company }: { company: string }) {
  const [watch, setWatch] = useState<Watch>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = watch?.id;

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        setWatch(await request<Watch>(`/api/watch/${encodeURIComponent(id!)}`, {
          signal: controller.signal,
          cache: "no-store",
        }));
        setError("");
      } catch (reason) {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 30_000);
      }
    }
    timer = setTimeout(poll, 30_000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [id]);

  async function startWatch() {
    if (busy || watch) return;
    setBusy(true);
    setError("");
    try {
      setWatch(await post<Watch>("/api/watch", { company }));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="report-section">
      <div className="section-heading">
        <h3>Watch</h3>
        {watch ? <span className="muted">Watching {company}</span> : (
          <button className="secondary" type="button" onClick={startWatch} disabled={busy}>
            {busy ? "Starting…" : "Start watch"}
          </button>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {watch && (watch.updates.length ? (
        <ul className="report-list updates">
          {[...watch.updates].sort((first, second) => second.at.localeCompare(first.at)).map((update, index) => (
            <li key={`${update.at}-${update.url}-${index}`}>
              <time className="muted tabular" dateTime={update.at}>{update.at.slice(0, 10)}</time>
              <h4><ExternalLink url={update.url}>{update.title}</ExternalLink></h4>
              <p>{update.summary}</p>
            </li>
          ))}
        </ul>
      ) : <p className="muted">No updates yet. This panel refreshes every 30 seconds.</p>)}
    </section>
  );
}
