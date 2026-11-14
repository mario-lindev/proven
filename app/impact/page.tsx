"use client";

import { useRef, useState } from "react";
import type { ImpactAnalogue, ImpactEvent, ImpactSentiment } from "@/lib/brain/impact";
import { DISCLAIMER, rangeLine, rangeOf } from "@/lib/brain/impact-format";
import { ImpactAnalogueCard, ImpactSentimentList, ImpactStrip } from "@/components/ImpactParts";
import ErrorBox from "@/components/ErrorBox";
import { EngineDot, engineLabel } from "@/components/engines";
import { domain, errMsg } from "@/components/http";

type Start = Extract<ImpactEvent, { type: "start" }>;
type Done = Extract<ImpactEvent, { type: "done" }>;

const EXAMPLES = [
  { label: "Boeing + a production halt", company: "Boeing", event: "a production halt" },
  { label: "CrowdStrike + a global outage", company: "CrowdStrike", event: "a global outage" },
  { label: "a CEO steps down unexpectedly", company: "", event: "the CEO steps down unexpectedly" },
];

export default function ImpactPage() {
  const [company, setCompany] = useState("");
  const [event, setEvent] = useState("");
  const [running, setRunning] = useState(false);
  const [start, setStart] = useState<Start | null>(null);
  const [analogues, setAnalogues] = useState<ImpactAnalogue[]>([]);
  const [sentiment, setSentiment] = useState<ImpactSentiment | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);
  const companyRef = useRef<HTMLInputElement>(null);

  async function run(e?: React.FormEvent, given?: { company: string; event: string }) {
    e?.preventDefault();
    const body = { company: (given?.company ?? company).trim(), event: (given?.event ?? event).trim() };
    if (!body.company || !body.event || running) return;
    const run = ++runRef.current;
    setRunning(true);
    setStart(null);
    setAnalogues([]);
    setSentiment(null);
    setDone(null);
    setError(null);

    const handle = (ev: ImpactEvent) => {
      if (run !== runRef.current) return;
      if (ev.type === "start") setStart(ev);
      else if (ev.type === "analogue") setAnalogues((a) => [...a, ev.analogue]);
      else if (ev.type === "sentiment") setSentiment(ev.sentiment);
      else if (ev.type === "done") setDone(ev);
      else setError(ev.error);
    };

    try {
      const res = await fetch("/api/impact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
        for (const line of lines) if (line.trim()) handle(JSON.parse(line) as ImpactEvent);
      }
      if (buf.trim()) handle(JSON.parse(buf) as ImpactEvent);
    } catch (err) {
      if (run === runRef.current) setError(errMsg(err));
    } finally {
      if (run === runRef.current) setRunning(false);
    }
  }

  function pick(x: (typeof EXAMPLES)[number]) {
    setEvent(x.event);
    if (x.company) {
      setCompany(x.company);
      run(undefined, x);
    } else if (company.trim()) run(undefined, { company, event: x.event });
    else companyRef.current?.focus();
  }

  const range = done?.range ?? rangeOf(analogues.map((a) => a.day1.pct));
  const reported = start?.status === "reported";
  const field = "serif block w-full bg-transparent px-6 py-4 text-[1.4rem] leading-snug outline-none placeholder:text-faint";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="serif text-[3.4rem] font-semibold leading-none tracking-tight">Event Impact</h1>
        <p className="mt-3 max-w-[46rem] text-[1.15rem] text-graphite">
          Name a public company and an event, real or &ldquo;what if&rdquo;. Proven checks whether the event has been reported, finds
          comparable past events at other companies, and shows what those stocks did next, each figure backed by a quote found in its source.
        </p>
        <p className="mt-2 font-semibold text-ink">{DISCLAIMER}</p>
        {start && (
          <p className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-surface py-2.5 text-center font-mono text-sm text-ink">{DISCLAIMER}</p>
        )}
      </header>

      <form onSubmit={run} className="border border-rule bg-surface">
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <label className="block border-b border-rule md:border-b-0 md:border-r">
            <span className="block px-6 pt-3 text-sm font-semibold text-graphite">Company or ticker</span>
            <input ref={companyRef} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="CrowdStrike" className={field} />
          </label>
          <label className="block">
            <span className="block px-6 pt-3 text-sm font-semibold text-graphite">Event</span>
            <input value={event} onChange={(e) => setEvent(e.target.value)} placeholder="a global outage, a product recall, the CEO steps down" className={field} />
          </label>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-rule px-6 py-3">
          <span className="text-sm text-graphite">Research only. Proven shows what happened before; it does not predict a price.</span>
          <button type="submit" disabled={!company.trim() || !event.trim() || running} className="bg-ink px-8 py-3 text-xl font-semibold text-white hover:bg-cobalt disabled:opacity-50">
            {running ? "Researching" : "Find past reactions"}
          </button>
        </div>
      </form>

      {!start && !running && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-graphite">Try</span>
          {EXAMPLES.map((x) => (
            <button key={x.label} type="button" onClick={() => pick(x)} className="serif border border-rule bg-surface px-4 py-1.5 text-[1.05rem] hover:border-ink">
              {x.label}
            </button>
          ))}
        </div>
      )}

      {error && <ErrorBox message={error} />}

      {running && !start && !error && (
        <div className="flex items-center gap-3 border border-dashed border-cobalt/50 bg-cobalt-soft px-5 py-4 text-lg text-cobalt" role="status">
          <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-cobalt" aria-hidden />
          Reading the latest on the company and checking whether the event has been reported
        </div>
      )}

      {start && (
        <>
          <section aria-label="Event status" className="border-y-2 border-ink py-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-[4px] px-3.5 py-1.5 font-mono text-base font-medium uppercase tracking-[0.1em] text-white ${reported ? "bg-cobalt" : "bg-dig"}`}>
                {reported ? "Reported" : "Hypothetical"}
              </span>
              <p className="text-graphite">{start.company}</p>
            </div>
            <p className="serif mt-2 text-[2.1rem] font-semibold leading-tight">{start.event_neutral}</p>
            <p className="mt-1 text-lg">{start.status_note}</p>
            {start.quote && (
              <blockquote className="mt-3 border-l-2 border-cobalt bg-cobalt-soft px-4 py-3">
                <p className="serif text-[1.15rem] leading-snug">&ldquo;{start.quote}&rdquo;</p>
                <p className="mt-1 text-sm text-graphite">Found word for word in {domain(start.sources[0].url)}</p>
              </blockquote>
            )}
            {start.sources.length > 0 && (
              <ul className="mt-3 space-y-1">
                {start.sources.map((s) => (
                  <li key={s.id} className="flex items-center gap-1.5 truncate text-sm text-graphite">
                    <EngineDot name={s.engine} />
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink hover:underline">
                      {s.title || domain(s.url)}
                    </a>
                    <span className="-ml-1.5 truncate">, {domain(s.url)}, via {engineLabel(s.engine)}</span>
                  </li>
                ))}
              </ul>
            )}
            {!reported && <p className="mt-2 text-sm text-graphite">The sources listed are the latest found on the company. None reports this event.</p>}
          </section>

          <section aria-label="Past reactions" className="space-y-4">
            <div>
              <h2 className="serif text-[1.9rem] font-semibold">Comparable past events</h2>
              <p className="serif tnum mt-1 text-[1.45rem] leading-snug" aria-live="polite">
                {analogues.length === 0 && !done ? "Searching for past cases and the stock moves reported after them" : rangeLine(range)}
              </p>
              <p className="mt-1 text-graphite">
                {done
                  ? `${analogues.length} kept, ${done.dropped} dropped for lack of a quoted next-day move. Done in ${(done.ms / 1000).toFixed(0)} s. `
                  : ""}
                {DISCLAIMER}
              </p>
            </div>
            {analogues.length > 0 && (
              <div className="border border-rule bg-surface px-4 pb-1 pt-3">
                <ImpactStrip analogues={analogues} range={range} />
              </div>
            )}
            {analogues.map((a, i) => (
              <ImpactAnalogueCard key={i} a={a} />
            ))}
            {running && !done && (
              <p className="flex items-center gap-3 text-lg font-medium text-cobalt" role="status">
                <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-cobalt" aria-hidden />
                Checking more past cases against the web
              </p>
            )}
          </section>

          {sentiment && (
            <section aria-label="Forum sentiment" className="border-t border-rule pt-6">
              <h2 className="serif text-[1.9rem] font-semibold">What investors are saying</h2>
              <p className="mb-3 text-sm text-graphite">A sample of forum and social posts about {start.company}, quoted word for word. Not a poll.</p>
              <ImpactSentimentList sentiment={sentiment} />
            </section>
          )}

          {done && (
            <section aria-label="Summary" className="border-t-2 border-ink pt-6">
              <h2 className="serif text-[1.9rem] font-semibold">Summary</h2>
              <p className="serif tnum mt-2 text-[1.45rem] leading-snug">{done.summary.line}</p>
              {done.summary.similarity && (
                <p className="mt-3 text-lg leading-snug">
                  <span className="font-semibold">How similar the cases are. </span>
                  {done.summary.similarity}
                </p>
              )}
              {done.summary.differs && (
                <p className="mt-2 text-lg leading-snug">
                  <span className="font-semibold">Why this case may differ. </span>
                  {done.summary.differs}
                </p>
              )}
              {done.summary.watch.length > 0 && (
                <>
                  <p className="mt-4 font-semibold">What to watch</p>
                  <ul className="mt-1 list-disc space-y-1 pl-6 text-lg">
                    {done.summary.watch.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </>
              )}
              <p className="mt-5 border-l-4 border-dig bg-dig-soft px-4 py-3 font-semibold text-ink">{DISCLAIMER}</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
