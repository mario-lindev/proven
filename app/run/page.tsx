"use client";

// One click runs the whole workflow at once: pitch audit, research memo with proof, and a watch.
// It only calls the existing endpoints; each panel links to the full page.
import Link from "next/link";
import { useRef, useState } from "react";
import { EngineDot, engineLabel } from "@/components/engines";
import { ActivityStrip, COBALT, INK, RUST, StreamBand, type Phase } from "@/components/flow/Ascii";
import CountUp from "@/components/flow/CountUp";
import PageHeader from "@/components/flow/PageHeader";
import type { Memo, MemoEvent, TrailStep, Watch } from "@/lib/types";
import type { AuditCheck, AuditClaim, AuditEvent, AuditSummary } from "@/lib/brain/audit";

async function ndjson<T>(path: string, body: unknown, onEvent: (e: T) => void, signal?: AbortSignal) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
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
const MARK = { supported: "bg-pursue", contradicted: "bg-pass", unclear: "bg-dig" } as const;
const EASE = "ease-[cubic-bezier(.22,1,.36,1)]";
const WORD = { supported: "Holds up", contradicted: "Contradicted", unclear: "Unclear" } as const;

export default function RunEverything() {
  const [company, setCompany] = useState("");
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const acRef = useRef<AbortController | null>(null);
  // Stop: drop the streams; whatever already arrived stays on screen.
  const stop = () => {
    acRef.current?.abort();
    setRunning(false);
  };
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
    const ac = new AbortController();
    acRef.current = ac;
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
        }, ac.signal).catch((err) => { if (!ac.signal.aborted) setAuditErr(String(err.message ?? err)); })
      : Promise.resolve();
    const m = ndjson<MemoEvent>("/api/memo", { company: name, depth: "quick", stream: true }, (e) => {
      if (e.type === "step") setSteps((s) => [...s, e.step]);
      else if (e.type === "memo") setMemo(e.memo);
      else if (e.type === "error") setMemoErr(e.error);
    }, ac.signal).catch((err) => { if (!ac.signal.aborted) setMemoErr(String(err.message ?? err)); });
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

  const topics = [...new Set(searches.map((s) => s.topic).filter((t): t is string => Boolean(t)))];
  const site = url.trim();
  const auditPhase: Phase | "skipped" | "error" = !site ? "skipped" : auditErr ? "error" : audit ? "done" : running ? "running" : "done";
  const memoPhase: Phase | "error" = memoErr ? "error" : memo ? "done" : running ? "running" : "done";
  const watchPhase: Phase | "error" = watchErr ? "error" : watch ? "done" : running ? "running" : "done";
  const bandPhase: Phase = running ? "running" : started ? "done" : "idle";

  return (
    <div className="space-y-10">
      <PageHeader
        title="Run everything"
        lede="One click audits what the company claims on its own site, researches it with a quote behind every line, and starts a watch. All three run at once."
      >
        <StreamBand phase={bandPhase} label="Three streams, audit, research and watch, merging into one result" className="h-28" />
      </PageHeader>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="overflow-hidden rounded-[8px] border border-ink/80 bg-surface"
      >
        <div className="grid sm:grid-cols-[1fr_1.4fr_auto]">
          <label className="block border-b border-rule px-6 py-4 sm:border-b-0 sm:border-r">
            <span className="text-sm font-semibold">Company</span>
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Ramp" className="serif mt-1 block w-full bg-transparent text-2xl outline-none placeholder:text-faint" />
          </label>
          <label className="block border-b border-rule px-6 py-4 sm:border-b-0 sm:border-r">
            <span className="text-sm font-semibold">Its website (for the audit, optional)</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ramp.com" className="mt-1 block w-full bg-transparent font-mono text-xl outline-none placeholder:text-faint" />
          </label>
          <button
            type={running ? "button" : "submit"}
            onClick={running ? stop : undefined}
            disabled={!running && !company.trim()}
            className={`bg-ink px-10 py-4 text-lg font-semibold text-white transition-colors duration-300 ${EASE} hover:bg-cobalt disabled:opacity-50 disabled:hover:bg-ink`}
          >
            {running ? "Stop" : "Run everything"}
          </button>
        </div>
      </form>
      {!started && (
        <p className="-mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="mr-1 text-graphite">Try</span>
          {EXAMPLES.map(([c, u]) => (
            <button
              key={c}
              type="button"
              onClick={() => { setCompany(c); setUrl(u); run(c, u); }}
              className={`rounded-[8px] border border-rule bg-surface px-3 py-1.5 transition-colors duration-200 ${EASE} hover:border-ink`}
            >
              {c}
            </button>
          ))}
        </p>
      )}

      {started && (
        <>
          <section aria-label="Scorecard" className="tnum grid border-y border-ink/80 sm:grid-cols-4">
            <Stat label="memo verdict" tone={memo ? VERDICT[memo.verdict][1] : "text-faint"}>
              {memo ? VERDICT[memo.verdict][0] : "…"}
            </Stat>
            <Stat label="lines backed by a quote">
              {memo?.verification ? (
                <>
                  <CountUp value={memo.verification.kept} />
                  <span className="text-faint"> / {memo.verification.checked}</span>
                </>
              ) : (
                <span className="text-faint">…</span>
              )}
            </Stat>
            <Stat label="site claims that hold up">
              {audit ? (
                <>
                  <CountUp value={audit.summary.supported} />
                  <span className="text-faint"> / {claims.length}</span>
                </>
              ) : (
                <span className="text-faint">{site ? "…" : "–"}</span>
              )}
            </Stat>
            <Stat label="trust score" tone={audit ? "text-cobalt" : ""}>
              {audit ? (
                <>
                  <CountUp value={audit.trust_score} />
                  <span className="text-[1.4rem] text-faint"> /100</span>
                </>
              ) : (
                <span className="text-faint">{site ? "…" : "–"}</span>
              )}
            </Stat>
          </section>

          <div className="grid gap-5 lg:grid-cols-3">
            <Panel n={1} title="Pitch audit" phase={auditPhase} color={COBALT} href={site ? `/audit?url=${encodeURIComponent(site)}` : "/audit"} linkLabel="Open the audit page">
              {!site && <p className="text-graphite">No website given, so the audit was skipped.</p>}
              {auditErr && <p className="text-pass">{auditErr}</p>}
              {site && !auditErr && claims.length === 0 && <p className="text-graphite">Reading the site and pulling out its claims.</p>}
              {claims.length > 0 && (
                <>
                  <p className="tnum text-sm text-graphite">
                    <span className="font-mono text-ink">{done}</span> of <span className="font-mono text-ink">{claims.length}</span> claims checked against independent sources
                  </p>
                  <ul className="mt-4 space-y-3">
                    {claims.map((c, i) => {
                      const k = checks[i];
                      return (
                        <li key={i} className="row-in grid grid-cols-[0.5rem_minmax(0,1fr)] gap-3 text-sm leading-snug" style={{ animationDelay: `${i * 40}ms` }}>
                          <span aria-hidden className={`mt-[0.35rem] h-2 w-2 rounded-full transition-colors duration-500 ${EASE} ${k ? MARK[k.verdict] : "bg-rule pulse-dot"}`} />
                          <span>
                            <span key={k?.verdict ?? "checking"} className={`font-semibold transition-colors duration-500 ${EASE} ${k ? `row-in ${TONE[k.verdict]}` : "text-faint"}`}>
                              {k ? WORD[k.verdict] : "Checking"}
                            </span>{" "}
                            <span>{c.claim}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </Panel>

            <Panel n={2} title="Research memo" phase={memoPhase} color={INK} href={memo ? `/memo/${memo.id}` : "/"} linkLabel={memo ? "Open the full memo" : "Research page"}>
              {memoErr && <p className="text-pass">{memoErr}</p>}
              {!memo && !memoErr && (
                <>
                  <p className="tnum text-sm text-graphite">
                    <span className="font-mono text-ink">{searches.length}</span> searches, <span className="font-mono text-ink">{engines.size}</span> engines through Telem and Tavily
                  </p>
                  <p className="mt-2 text-sm font-medium">{last ? last.label : "Planning the research"}</p>
                  {topics.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs text-graphite">Topics Telem labelled</p>
                      <p className="mt-1.5 flex flex-wrap gap-1.5">
                        {topics.map((t) => (
                          <span key={t} className="row-in rounded-[8px] border border-rule bg-paper px-2 py-0.5 font-mono text-[0.78rem]">
                            {t}
                          </span>
                        ))}
                      </p>
                    </div>
                  )}
                  {engines.size > 0 && (
                    <div className="mt-4">
                      <p className="text-xs text-graphite">Engines that answered</p>
                      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.82rem]">
                        {[...engines].map((e) => (
                          <span key={e} className="row-in flex items-center gap-1.5">
                            <EngineDot name={e} size={7} /> {engineLabel(e)}
                          </span>
                        ))}
                      </p>
                    </div>
                  )}
                  <ul className="mt-4 space-y-1 border-t border-rule-soft pt-3 text-sm text-graphite">
                    {searches.slice(-5).map((s, i) => (
                      <li key={`${searches.length}-${i}`} className="row-in truncate font-mono text-[0.78rem]">
                        {s.topic ? <span className="text-cobalt">[{s.topic}] </span> : ""}
                        {s.query}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {memo && (
                <div className="row-in">
                  <p className={`serif text-[2rem] font-semibold leading-tight ${VERDICT[memo.verdict][1]}`}>
                    {VERDICT[memo.verdict][0]}, <span className="tnum"><CountUp value={Math.round(memo.confidence * 100)} />%</span>
                  </p>
                  <p className="mt-3 text-sm leading-relaxed">{memo.summary}</p>
                  <p className="tnum mt-4 border-t border-rule-soft pt-3 text-sm text-graphite">
                    {memo.facts.length} facts, {memo.risks.length} risks, {memo.sources.length} sources
                    {memo.contradictions?.length ? `, ${memo.contradictions.length} claims vs. reality${high ? ` (${high} high)` : ""}` : ""}
                  </p>
                </div>
              )}
            </Panel>

            <Panel n={3} title="Watch" phase={watchPhase} color={RUST} href={memo ? `/memo/${memo.id}` : "/"} linkLabel="Check now from the memo page">
              {watchErr && <p className="text-pass">{watchErr}</p>}
              {!watch && !watchErr && <p className="text-graphite">Starting a Telem monitor.</p>}
              {watch && (
                <div className="row-in">
                  <p className="serif text-[1.5rem] font-semibold leading-tight">Watching {watch.company}</p>
                  <p className="mt-2 text-sm leading-relaxed text-graphite">
                    A Telem monitor agent re-checks for news, funding, layoffs, lawsuits and new competitors every hour.
                  </p>
                  <p className="mt-4 border-t border-rule-soft pt-3 text-xs text-faint">
                    Monitor <span className="font-mono text-graphite">{watch.monitor_id}</span>
                  </p>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, tone = "", children }: { label: string; tone?: string; children: React.ReactNode }) {
  return (
    <div className="border-rule px-6 py-6 first:pl-0 sm:border-l sm:first:border-l-0">
      <p className={`serif text-[3rem] font-semibold leading-none tracking-tight transition-colors duration-500 ${EASE} ${tone}`}>{children}</p>
      <p className="mt-2 text-sm text-graphite">{label}</p>
    </div>
  );
}

const STATE: Record<string, [string, string]> = {
  idle: ["Waiting", "text-faint"],
  running: ["Running", "text-cobalt"],
  done: ["Done", "text-pursue"],
  skipped: ["Skipped", "text-faint"],
  error: ["Failed", "text-pass"],
};

function Panel({ n, title, phase, color, href, linkLabel, children }: { n: number; title: string; phase: string; color: string; href: string; linkLabel: string; children: React.ReactNode }) {
  const [word, tone] = STATE[phase];
  return (
    <section
      className={`flex min-h-[22rem] flex-col overflow-hidden rounded-[8px] border bg-surface transition-colors duration-500 ${EASE} ${phase === "running" ? "border-ink/70" : "border-rule"}`}
    >
      <div className="h-4 border-b border-rule-soft">{phase === "running" && <ActivityStrip color={color} label={`${title} is working`} />}</div>
      <div className="flex items-baseline justify-between gap-3 px-6 pt-5">
        <h2 className="serif text-[1.5rem] font-semibold">
          <span className="tnum mr-2 font-mono text-base text-faint">{n}</span>
          {title}
        </h2>
        <span className={`flex items-center gap-1.5 text-sm font-medium ${tone}`}>
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-current ${phase === "running" ? "pulse-dot" : ""}`} />
          {word}
        </span>
      </div>
      <div className="mt-4 flex-1 px-6">{children}</div>
      <Link href={href} className="mx-6 mb-5 mt-5 text-sm font-medium text-cobalt hover:underline">
        {linkLabel}
      </Link>
    </section>
  );
}
