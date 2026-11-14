"use client";

import { useEffect, useState } from "react";
import { EngineDot, engineLabel } from "@/components/engines";
import { fmtMs } from "@/components/http";

type Data = {
  ready: boolean;
  reason?: string;
  trails: number; queries: number; runs: number; results: number; steered: number; dated: number;
  sessions: number;
  max_engines_in_one_run: number;
  engines: { name: string; runs: number; results: number; avg_ms: number; errors: number }[];
  topics: { topic: string; queries: number; engines: { name: string; runs: number }[] }[];
  proof: { verified: number; via_telem: number; memos: number };
};

export default function TelemPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/telem", { cache: "no-store" })
      .then((r) => r.json())
      .then(setD)
      .catch(() => setErr("Couldn't reach the Proven server."));
  }, []);

  const share = d && d.proof.verified > 0 ? Math.round((d.proof.via_telem / d.proof.verified) * 100) : null;
  const maxRuns = d?.engines[0]?.runs ?? 1;

  return (
    <div className="space-y-10">
      <header className="max-w-[48rem]">
        <h1 className="serif text-[3.2rem] font-semibold leading-[1.04] tracking-tight">What Telem did</h1>
        <p className="mt-4 text-[1.2rem] leading-relaxed text-graphite">
          Proven never picks a search engine itself. Telem reads each question, labels its topic and routes it to the
          engines that fit. These numbers are counted from the research runs saved on this server.
        </p>
      </header>

      {err && <p className="text-pass">{err}</p>}
      {!d && !err && <div aria-busy="true" className="h-40 bg-rule-soft" />}
      {d && !d.ready && <p className="border border-rule bg-surface px-6 py-5 text-graphite">Nothing to count yet: {d.reason}.</p>}

      {d && d.ready && (
        <>
          {share !== null && (
            <section className="border-t-4 border-cobalt bg-surface px-6 py-6">
              <p className="serif text-[2.6rem] font-semibold leading-tight">
                <span className="text-cobalt">{share}%</span> of the verified proof came from engines Telem routed to.
              </p>
              <p className="mt-2 text-graphite">
                {d.proof.via_telem.toFixed(0)} of {d.proof.verified.toFixed(0)} results that backed a verified memo line, across{" "}
                {d.proof.memos} memos. The rest came from our direct Tavily search.
              </p>
            </section>
          )}

          <dl className="tnum grid grid-cols-2 gap-6 border-y border-rule py-5 sm:grid-cols-4">
            {[
              ["questions routed", d.queries],
              ["engine runs", d.runs],
              ["engines used", d.engines.length],
              ["most engines in one run", d.max_engines_in_one_run],
              ["results returned", d.results],
              ["topics Telem labelled", d.topics.filter((t) => t.topic !== "unlabelled").length],
              ["searches steered by proof", d.steered],
              ["Telem sessions", d.sessions],
            ].map(([label, n]) => (
              <div key={label as string}>
                <dd className="serif text-[2rem] font-semibold">{n}</dd>
                <dt className="text-sm text-graphite">{label}</dt>
              </div>
            ))}
          </dl>

          <section aria-label="Engines Telem routed to" className="border border-rule bg-surface px-6 py-5">
            <h2 className="serif text-2xl font-semibold">Engines Telem routed to</h2>
            <p className="mt-1 text-graphite">How often Telem chose each engine, how much it returned and how fast it answered.</p>
            <ul className="mt-4 space-y-2">
              {d.engines.map((e) => (
                <li key={e.name} className="grid grid-cols-[12rem_minmax(0,1fr)_16rem] items-center gap-4">
                  <span className="flex items-center gap-2 font-medium">
                    <EngineDot name={e.name} /> {engineLabel(e.name)}
                  </span>
                  <span className="h-2 bg-rule-soft">
                    <span className="block h-2 bg-cobalt" style={{ width: `${Math.max(2, (e.runs / maxRuns) * 100)}%` }} />
                  </span>
                  <span className="tnum text-right text-sm text-graphite">
                    {e.runs} runs, {e.results} results, {fmtMs(e.avg_ms)}
                    {e.errors > 0 ? `, ${e.errors} failed` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Routing by topic" className="border border-rule bg-surface px-6 py-5">
            <h2 className="serif text-2xl font-semibold">Where Telem sent each kind of question</h2>
            <p className="mt-1 text-graphite">Telem labels every query with a topic, then picks engines for it.</p>
            <ul className="mt-4 divide-y divide-rule-soft">
              {d.topics.map((t) => (
                <li key={t.topic} className="grid grid-cols-[14rem_6rem_minmax(0,1fr)] items-baseline gap-4 py-2.5">
                  <span className="font-mono text-sm">{t.topic}</span>
                  <span className="tnum text-sm text-graphite">{t.queries} queries</span>
                  <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {t.engines.map((e) => (
                      <span key={e.name} className="flex items-center gap-1.5">
                        <EngineDot name={e.name} /> {engineLabel(e.name)} <span className="text-graphite">{e.runs}</span>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
