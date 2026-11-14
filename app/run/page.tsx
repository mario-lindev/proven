"use client";

// One click runs the whole workflow at once: pitch audit, research memo with proof, and a watch.
// It only calls the existing endpoints; each panel links to the full page.
import Link from "next/link";
import { useState } from "react";
import type { Memo, MemoEvent, TrailStep, Watch } from "@/lib/types";
import type { AuditCheck, AuditClaim, AuditEvent, AuditSummary } from "@/lib/brain/audit";

async function ndjson<T>(path: string, body: unknown, onEvent: (e: T) => void) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onEvent(JSON.parse(line) as T);
    }
  }
}

const EXAMPLES: [string, string][] = [
  ["Ramp", "https://ramp.com"],
  ["Rippling", "https://www.rippling.com"],
  ["Notion", "https://www.notion.com"],
];
const VERDICT: Record<Memo["verdict"], [string, string]> = {
  pursue: ["Pursue", "text-pursue"],
  dig_deeper: ["Dig deeper", "text-dig"],
  pass: ["Pass", "text-pass"],
};
const TONE = { supported: "text-pursue", contradicted: "text-pass", unclear: "text-dig" } as const;
const WORD = { supported: "Holds up", contradicted: "Contradicted", unclear: "Unclear" } as const;

export default function RunEverything() {
  const [company, setCompany] = useState("");
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);

  const [claims, setClaims] = useState<AuditClaim[]>([]);
  const [checks, setChecks] = useState<Record<number, AuditCheck>>({});
  const [audit, setAudit] = useState<{ summary: AuditSummary; trust_score: number } | null>(null);
  const [auditErr, setAuditErr] = useState<string | null>(null);

  const [steps, setSteps] = useState<TrailStep[]>([]);
  const [memo, setMemo] = useState<Memo | null>(null);
  const [memoErr, setMemoErr] = useState<string | null>(null);

  const [watch, setWatch] = useState<Watch | null>(null);
  const [watchErr, setWatchErr] = useState<string | null>(null);

  async function run(c = company, u = url) {
    const name = c.trim();
    const site = u.trim();
    if (!name || running) return;
    setRunning(true);
    setStarted(true);
    setClaims([]); setChecks({}); setAudit(null); setAuditErr(null);
    setSteps([]); setMemo(null); setMemoErr(null);
    setWatch(null); setWatchErr(null);

    const a = site
      ? ndjson<AuditEvent>("/api/audit", { url: site }, (e) => {
          if (e.type === "start") setClaims(e.claims);
          else if (e.type === "claim") setChecks((m) => ({ ...m, [e.index]: e.check }));
          else if (e.type === "done") setAudit({ summary: e.summary, trust_score: e.trust_score });
          else if (e.type === "error") setAuditErr(e.error);
        }).catch((err) => setAuditErr(String(err.message ?? err)))
      : Promise.resolve();
    const m = ndjson<MemoEvent>("/api/memo", { company: name, depth: "quick", stream: true }, (e) => {
      if (e.type === "step") setSteps((s) => [...s, e.step]);
      else if (e.type === "memo") setMemo(e.memo);
      else if (e.type === "error") setMemoErr(e.error);
    }).catch((err) => setMemoErr(String(err.message ?? err)));
    const w = fetch("/api/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: name }) })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error ?? `Failed (${r.status})`);
        setWatch(d as Watch);
      })
      .catch((err) => setWatchErr(String(err.message ?? err)));
    await Promise.allSettled([a, m, w]);
    setRunning(false);
  }

  const searches = steps.filter((s) => s.kind === "search");
  const engines = new Set(searches.flatMap((s) => (s.engines ?? []).filter((e) => !e.error).map((e) => e.name)));
  const last = steps[steps.length - 1];
  const done = Object.keys(checks).length;
  const high = memo?.contradictions?.filter((c) => c.severity === "high").length ?? 0;

  return (
    <div className="space-y-8">
      <header className="max-w-[48rem]">
        <h1 className="serif text-[3.2rem] font-semibold leading-[1.04] tracking-tight">Run everything</h1>
        <p className="mt-4 text-[1.2rem] leading-relaxed text-graphite">
          One click: audit what the company claims on its own site, research it with a quote behind every line, and
          start a watch. All three run at once.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="border border-rule bg-surface"
      >
        <div className="grid sm:grid-cols-[1fr_1.4fr_auto]">
          <label className="block border-b border-rule px-5 py-4 sm:border-b-0 sm:border-r">
            <span className="text-sm font-semibold">Company</span>
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Ramp" className="serif mt-1 block w-full bg-transparent text-xl outline-none placeholder:text-faint" />
          </label>
          <label className="block border-b border-rule px-5 py-4 sm:border-b-0 sm:border-r">
            <span className="text-sm font-semibold">Its website (for the audit, optional)</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ramp.com" className="serif mt-1 block w-full bg-transparent text-xl outline-none placeholder:text-faint" />
          </label>
          <button type="submit" disabled={!company.trim() || running} className="bg-ink px-8 py-4 text-lg font-semibold text-white disabled:opacity-50">
            {running ? "Running" : "Run everything"}
          </button>
        </div>
      </form>
      {!started && (
        <p className="flex flex-wrap gap-2 text-sm">
          {EXAMPLES.map(([c, u]) => (
            <button key={c} type="button" onClick={() => { setCompany(c); setUrl(u); run(c, u); }} className="border border-rule bg-surface px-3 py-1.5 hover:border-ink">
              {c}
            </button>
          ))}
        </p>
      )}

      {started && (
        <>
          <section className="tnum grid gap-6 border-y border-rule py-5 sm:grid-cols-4">
            <Stat label="memo verdict" value={memo ? VERDICT[memo.verdict][0] : "…"} tone={memo ? VERDICT[memo.verdict][1] : ""} />
            <Stat label="lines backed by a quote" value={memo?.verification ? `${memo.verification.kept} of ${memo.verification.checked}` : "…"} />
            <Stat label="site claims that hold up" value={audit ? `${audit.summary.supported} of ${claims.length}` : url.trim() ? "…" : "–"} />
            <Stat label="trust score" value={audit ? `${audit.trust_score} / 100` : url.trim() ? "…" : "–"} />
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="1. Pitch audit" href={url.trim() ? `/audit?url=${encodeURIComponent(url.trim())}` : "/audit"} linkLabel="Open the audit page">
              {!url.trim() && <p className="text-graphite">No website given, so the audit was skipped.</p>}
              {auditErr && <p className="text-pass">{auditErr}</p>}
              {url.trim() && !auditErr && claims.length === 0 && <p className="text-graphite">Reading the site and pulling out its claims.</p>}
              {claims.length > 0 && (
                <>
                  <p className="text-sm text-graphite">{done} of {claims.length} claims checked against independent sources</p>
                  <ul className="mt-3 space-y-2.5">
                    {claims.map((c, i) => {
                      const k = checks[i];
                      return (
                        <li key={i} className="text-sm leading-snug">
                          <span className={`font-semibold ${k ? TONE[k.verdict] : "text-faint"}`}>{k ? WORD[k.verdict] : "Checking"}</span>{" "}
                          <span>{c.claim}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </Panel>

            <Panel title="2. Research memo" href={memo ? `/memo/${memo.id}` : "/"} linkLabel={memo ? "Open the full memo" : "Research page"}>
              {memoErr && <p className="text-pass">{memoErr}</p>}
              {!memo && !memoErr && (
                <>
                  <p className="text-sm text-graphite">
                    {searches.length} searches, {engines.size} engines through Telem and Tavily
                  </p>
                  <p className="mt-2 text-sm">{last ? last.label : "Planning the research"}</p>
                  <ul className="mt-3 space-y-1 text-sm text-graphite">
                    {searches.slice(-6).map((s, i) => (
                      <li key={i} className="truncate font-mono text-[0.8rem]">
                        {s.topic ? `[${s.topic}] ` : ""}{s.query}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {memo && (
                <>
                  <p className={`serif text-2xl font-semibold ${VERDICT[memo.verdict][1]}`}>
                    {VERDICT[memo.verdict][0]}, {Math.round(memo.confidence * 100)}%
                  </p>
                  <p className="mt-2 text-sm leading-relaxed">{memo.summary}</p>
                  <p className="mt-3 text-sm text-graphite">
                    {memo.facts.length} facts, {memo.risks.length} risks, {memo.sources.length} sources
                    {memo.contradictions?.length ? `, ${memo.contradictions.length} claims vs. reality${high ? ` (${high} high)` : ""}` : ""}
                  </p>
                </>
              )}
            </Panel>

            <Panel title="3. Watch" href={memo ? `/memo/${memo.id}` : "/"} linkLabel="Check now from the memo page">
              {watchErr && <p className="text-pass">{watchErr}</p>}
              {!watch && !watchErr && <p className="text-graphite">Starting a Telem monitor.</p>}
              {watch && (
                <>
                  <p className="font-semibold">Watching {watch.company}</p>
                  <p className="mt-1 text-sm text-graphite">
                    A Telem monitor agent re-checks for news, funding, layoffs, lawsuits and new competitors every hour.
                  </p>
                  <p className="mt-2 text-xs text-faint">
                    Monitor <span className="font-mono">{watch.monitor_id}</span>
                  </p>
                </>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className={`serif text-[1.9rem] font-semibold ${tone}`}>{value}</p>
      <p className="text-sm text-graphite">{label}</p>
    </div>
  );
}

function Panel({ title, href, linkLabel, children }: { title: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <section className="flex min-h-[18rem] flex-col border border-rule bg-surface px-5 py-5">
      <h2 className="serif text-xl font-semibold">{title}</h2>
      <div className="mt-3 flex-1">{children}</div>
      <Link href={href} className="mt-4 text-sm font-medium text-cobalt hover:underline">
        {linkLabel}
      </Link>
    </section>
  );
}
