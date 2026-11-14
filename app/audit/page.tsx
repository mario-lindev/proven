"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditCheck, AuditClaim, AuditEvent, AuditSummary } from "@/lib/brain/audit";
import AuditClaimCard from "@/components/AuditClaimCard";
import ErrorBox from "@/components/ErrorBox";
import TrailDrawer from "@/components/TrailDrawer";
import { errMsg } from "@/components/http";

type Done = { summary: AuditSummary; trust_score: number; ms: number };

const looksLikeUrl = (s: string) => /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s);
const EXAMPLES = ["https://ramp.com", "https://www.rippling.com", "https://www.notion.com"];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function AuditPage() {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [company, setCompany] = useState<{ name: string; domain: string } | null>(null);
  const [claims, setClaims] = useState<AuditClaim[]>([]);
  const [checks, setChecks] = useState<Record<number, AuditCheck>>({});
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trailId, setTrailId] = useState<string | null>(null);
  const runRef = useRef(0);

  const closeTrail = useCallback(() => setTrailId(null), []);

  async function run(e?: React.FormEvent, given?: string) {
    e?.preventDefault();
    const value = (given ?? input).trim();
    if (!value || running) return;
    const run = ++runRef.current;
    setRunning(true);
    setCompany(null);
    setClaims([]);
    setChecks({});
    setDone(null);
    setError(null);

    const handle = (ev: AuditEvent) => {
      if (run !== runRef.current) return;
      if (ev.type === "start") {
        setCompany({ name: ev.company, domain: ev.domain });
        setClaims(ev.claims);
      } else if (ev.type === "claim") setChecks((c) => ({ ...c, [ev.index]: ev.check }));
      else if (ev.type === "done") setDone({ summary: ev.summary, trust_score: ev.trust_score, ms: ev.ms });
      else setError(ev.error);
    };

    try {
      const body = looksLikeUrl(value) ? { url: /^https?:\/\//i.test(value) ? value : `https://${value}` } : { text: value };
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done: end, value: chunk } = await reader.read();
        if (end) break;
        buf += dec.decode(chunk, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) handle(JSON.parse(line) as AuditEvent);
      }
      if (buf.trim()) handle(JSON.parse(buf) as AuditEvent);
    } catch (err) {
      if (run === runRef.current) setError(errMsg(err));
    } finally {
      if (run === runRef.current) setRunning(false);
    }
  }

  // Deep link from the Chrome extension: /audit?url=<encoded>&go=1 fills the box and starts the audit.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current) return;
    deepLinked.current = true;
    const q = new URLSearchParams(window.location.search);
    const u = q.get("url")?.trim();
    if (!u) return;
    setInput(u);
    if (q.get("go") === "1") run(undefined, u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(u: string) {
    setInput(u);
    run(undefined, u);
  }

  const got = Object.values(checks);
  const counts: AuditSummary = done?.summary ?? {
    supported: got.filter((c) => c.verdict === "supported").length,
    contradicted: got.filter((c) => c.verdict === "contradicted").length,
    unclear: got.filter((c) => c.verdict === "unclear").length,
  };
  const scoreTone = !done ? "text-faint" : done.trust_score >= 70 ? "text-pursue" : done.trust_score >= 40 ? "text-dig" : "text-pass";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="serif text-[3.4rem] font-semibold leading-none tracking-tight">Pitch Audit</h1>
        <p className="mt-3 max-w-[44rem] text-[1.15rem] text-graphite">
          Paste a startup&rsquo;s website or its pitch. Proven pulls out every factual claim the company makes about itself and
          checks each one against sources the company does not control.
        </p>
      </header>

      <form onSubmit={run} className="border border-rule bg-surface">
        <label htmlFor="audit-input" className="sr-only">
          Website address or pitch text
        </label>
        <textarea
          id="audit-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && looksLikeUrl(input.trim())) run(e);
          }}
          rows={input.length > 120 ? 7 : 2}
          placeholder="https://ramp.com, or paste the pitch or deck text here"
          className="serif block w-full resize-y bg-transparent px-6 py-5 text-[1.5rem] leading-snug outline-none placeholder:text-faint"
        />
        <div className="flex items-center justify-between gap-4 border-t border-rule px-6 py-3">
          <span className="text-sm text-graphite">
            {looksLikeUrl(input.trim()) || !input.trim() ? "A website address is read live." : "Pasted text is audited as written."}
          </span>
          <button
            type="submit"
            disabled={!input.trim() || running}
            className="bg-ink px-8 py-3 text-xl font-semibold text-white hover:bg-cobalt disabled:opacity-50"
          >
            {running ? "Auditing" : "Audit the claims"}
          </button>
        </div>
      </form>

      {claims.length === 0 && !running && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-graphite">Try</span>
          {EXAMPLES.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => pick(u)}
              className="serif border border-rule bg-surface px-4 py-1.5 text-[1.05rem] hover:border-ink"
            >
              {u.replace(/^https:\/\/(www\.)?/, "")}
            </button>
          ))}
        </div>
      )}

      {error && <ErrorBox message={error} />}

      {running && claims.length === 0 && !error && (
        <div className="flex items-center gap-3 border border-dashed border-cobalt/50 bg-cobalt-soft px-5 py-4 text-lg text-cobalt" role="status">
          <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-cobalt" aria-hidden />
          Reading the pitch and picking out the claims that can be checked
        </div>
      )}

      {claims.length > 0 && (
        <>
          <section aria-label="Scoreboard" className="grid gap-6 border-y-2 border-ink py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <p className="text-graphite">
                {company?.name || "This pitch"}
                {company?.domain ? `, ${company.domain}` : ""}
              </p>
              <p className="serif tnum mt-1 text-[2.3rem] font-semibold leading-tight" aria-live="polite">
                {plural(claims.length, "claim")}: <span className="text-pursue">{counts.supported} {counts.supported === 1 ? "holds" : "hold"} up</span>,{" "}
                <span className="text-pass">{counts.contradicted} contradicted</span>,{" "}
                <span className="text-dig">{counts.unclear} unclear</span>
              </p>
              <p className="tnum mt-1 text-graphite">
                {done
                  ? `Checked in ${(done.ms / 1000).toFixed(0)} s. Only quotes found word for word in an independent source are shown.`
                  : `${got.length} of ${claims.length} checked`}
              </p>
            </div>
            <div className="lg:text-right">
              <p className="text-sm font-semibold text-graphite">Trust score</p>
              <p className={`serif tnum text-[4.2rem] font-semibold leading-none ${scoreTone}`}>
                {done ? done.trust_score : "--"}
                <span className="text-[1.6rem] text-faint"> / 100</span>
              </p>
              <p className="mt-1 text-sm text-graphite">Share of claims that hold up; an unclear claim counts half</p>
            </div>
          </section>

          <div className="space-y-4">
            {claims.map((c) => (
              <AuditClaimCard key={c.index} claim={c} check={checks[c.index]} onTrail={setTrailId} />
            ))}
          </div>
        </>
      )}

      <TrailDrawer trailId={trailId} onClose={closeTrail} />
    </div>
  );
}
