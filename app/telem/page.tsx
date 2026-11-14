"use client";

import { useEffect, useState } from "react";
import { EngineDot, engineColor, engineLabel } from "@/components/engines";
import { StreamBand } from "@/components/flow/Ascii";
import CountUp from "@/components/flow/CountUp";
import PageHeader from "@/components/flow/PageHeader";
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
    <div className="space-y-12">
      <PageHeader
        title="What Telem did"
        lede="Proven never picks a search engine itself. Telem reads each question, labels its topic and routes it to the engines that fit. Every number here is counted from the research runs saved on this server."
      >
        <StreamBand mode="split" streams={6} phase={d?.ready ? "done" : "idle"} label="One question fanning out to many engines" className="h-28" />
      </PageHeader>

      {err && <p className="text-pass">{err}</p>}
      {!d && !err && <div aria-busy="true" className="h-40 rounded-[8px] bg-rule-soft" />}
      {d && !d.ready && <p className="rounded-[8px] border border-rule bg-surface px-6 py-5 text-graphite">Nothing to count yet: {d.reason}.</p>}

      {d && d.ready && (
        <>
          {share !== null && (
            <section aria-label="Share of verified proof via Telem" className="grid items-end gap-8 border-b border-ink/80 pb-10 lg:grid-cols-[auto_minmax(0,1fr)]">
              <p className="serif tnum text-[11rem] font-semibold leading-[0.8] tracking-[-0.04em] text-cobalt">
                <CountUp value={share} ms={1200} />
                <span className="text-[6rem]">%</span>
              </p>
              <div className="max-w-[34rem] pb-2">
                <p className="serif text-[2.2rem] font-semibold leading-[1.1]">of the verified proof came from engines Telem routed to.</p>
                <p className="tnum mt-4 leading-relaxed text-graphite">
                  <span className="font-mono text-ink">{d.proof.via_telem.toFixed(0)}</span> of{" "}
                  <span className="font-mono text-ink">{d.proof.verified.toFixed(0)}</span> results that backed a verified memo line, across{" "}
                  <span className="font-mono text-ink">{d.proof.memos}</span> memos. The rest came from our direct Tavily search.
                </p>
              </div>
            </section>
          )}

          <dl className="tnum grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
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
              <div key={label as string} className="flex flex-col-reverse border-l border-rule pl-4">
                <dt className="mt-1.5 text-sm text-graphite">{label}</dt>
                <dd className="font-mono text-[2.2rem] font-medium leading-none">
                  <CountUp value={n as number} format={(v) => Math.round(v).toLocaleString()} />
                </dd>
              </div>
            ))}
          </dl>

          <section aria-label="Engines Telem routed to" className="overflow-hidden rounded-[8px] border border-rule bg-surface">
            <div className="border-b border-rule px-6 py-5">
              <h2 className="serif text-[1.9rem] font-semibold">Engines Telem routed to</h2>
              <p className="mt-1 text-graphite">How often Telem chose each engine, how much it returned and how fast it answered.</p>
            </div>
            <div className="grid grid-cols-[2rem_13rem_minmax(0,1fr)_5rem_5.5rem_5rem] gap-4 border-b border-rule-soft px-6 py-2.5 text-xs text-graphite">
              <span>#</span>
              <span>Engine</span>
              <span>Share of runs</span>
              <span className="text-right">Runs</span>
              <span className="text-right">Results</span>
              <span className="text-right">Latency</span>
            </div>
            <ol>
              {d.engines.map((e, i) => (
                <li key={e.name} className="grid grid-cols-[2rem_13rem_minmax(0,1fr)_5rem_5.5rem_5rem] items-center gap-4 border-b border-rule-soft px-6 py-2.5 last:border-b-0">
                  <span className="tnum font-mono text-sm text-faint">{i + 1}</span>
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <EngineDot name={e.name} /> <span className="truncate">{engineLabel(e.name)}</span>
                  </span>
                  <span className="h-[7px] rounded-full bg-rule-soft">
                    <span
                      className="bar-in block h-full rounded-full"
                      style={{ width: `${Math.max(2, (e.runs / maxRuns) * 100)}%`, background: engineColor(e.name), animationDelay: `${i * 30}ms` }}
                    />
                  </span>
                  <span className="tnum text-right font-mono text-sm">{e.runs}</span>
                  <span className="tnum text-right font-mono text-sm text-graphite">{e.results.toLocaleString()}</span>
                  <span className="tnum text-right font-mono text-sm text-graphite">
                    {fmtMs(e.avg_ms)}
                    {e.errors > 0 && <span className="block text-[0.7rem] text-pass">{e.errors} failed</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <RoutingMap topics={d.topics} order={d.engines.map((e) => e.name)} />
        </>
      )}
    </div>
  );
}

// Topics on the left, engines on the right; each curve is one topic-to-engine route, as thick as its run count.
function RoutingMap({ topics, order }: { topics: Data["topics"]; order: string[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const used = new Set(topics.flatMap((t) => t.engines.map((e) => e.name)));
  const engines = [...order.filter((n) => used.has(n)), ...[...used].filter((n) => !order.includes(n))];
  const rows = Math.max(topics.length, engines.length);
  const row = 34;
  const H = rows * row + 16;
  const W = 1000;
  const lx = 250;
  const rx = 740;
  const ty = (i: number) => 8 + (H - 16) * ((i + 0.5) / topics.length);
  const ey = (i: number) => 8 + (H - 16) * ((i + 0.5) / engines.length);
  const maxRun = Math.max(1, ...topics.flatMap((t) => t.engines.map((e) => e.runs)));

  return (
    <section aria-label="Routing by topic" className="overflow-hidden rounded-[8px] border border-rule bg-surface">
      <div className="border-b border-rule px-6 py-5">
        <h2 className="serif text-[1.9rem] font-semibold">Where Telem sent each kind of question</h2>
        <p className="mt-1 text-graphite">Telem labels every query with a topic, then picks engines for it. Line width is the number of runs. Hover a topic to trace it.</p>
      </div>
      <div className="px-6 py-6">
        <svg viewBox={`0 0 ${W} ${H}`} className="tnum w-full" role="img" aria-label={topics.map((t) => `${t.topic}: ${t.engines.map((e) => `${engineLabel(e.name)} ${e.runs}`).join(", ")}`).join("; ")}>
          {topics.map((t, i) =>
            t.engines.map((e) => {
              const j = engines.indexOf(e.name);
              const y1 = ty(i);
              const y2 = ey(j);
              const on = hover === null || hover === t.topic;
              return (
                <path
                  key={`${t.topic}-${e.name}`}
                  d={`M${lx},${y1} C${(lx + rx) / 2},${y1} ${(lx + rx) / 2},${y2} ${rx},${y2}`}
                  fill="none"
                  stroke={engineColor(e.name)}
                  strokeWidth={1 + (e.runs / maxRun) * 9}
                  strokeLinecap="round"
                  style={{ opacity: on ? (hover ? 0.85 : 0.32) : 0.05, transition: "opacity 300ms cubic-bezier(.22,1,.36,1)" }}
                >
                  <title>{`${t.topic} → ${engineLabel(e.name)}: ${e.runs} runs`}</title>
                </path>
              );
            }),
          )}
          {topics.map((t, i) => (
            <g key={t.topic} onMouseEnter={() => setHover(t.topic)} onMouseLeave={() => setHover(null)} className="cursor-default">
              <rect x={0} y={ty(i) - 13} width={lx - 8} height={26} rx={8} className={hover === t.topic ? "text-cobalt-soft" : "text-paper"} fill="currentColor" />
              <text x={12} y={ty(i) + 4.5} fontSize="13.5" fontFamily="var(--font-plex-mono), monospace" className="text-ink" fill="currentColor">
                {t.topic}
              </text>
              <text x={lx - 18} y={ty(i) + 4.5} fontSize="12" textAnchor="end" className="text-graphite" fill="currentColor">
                {t.queries}
              </text>
              <circle cx={lx} cy={ty(i)} r={4} className="text-ink" fill="currentColor" />
            </g>
          ))}
          {engines.map((n, j) => (
            <g key={n}>
              <circle cx={rx} cy={ey(j)} r={5} fill={engineColor(n)} />
              <text x={rx + 14} y={ey(j) + 4.5} fontSize="13.5" className="text-ink" fill="currentColor">
                {engineLabel(n)}
              </text>
            </g>
          ))}
        </svg>
        <p className="mt-3 text-xs text-graphite">Left: topic and how many queries Telem gave it. Right: the engines it routed them to.</p>
      </div>
    </section>
  );
}
