"use client";
import { useId, useState } from "react";

type Result = { document: { id: string; title: string }; score: number; features: number[] };
type Props = { results: Result[]; weights: number[]; enabled: boolean; hasQuery: boolean };
const groups = [
  { label: "High relevance", color: "#8b82f0", rule: "Score ≥ 70" },
  { label: "Review", color: "#d6ae6f", rule: "40 ≤ score < 70" },
  { label: "Low relevance", color: "#9a657b", rule: "Score < 40" },
];
const groupFor = (score: number) => score >= .7 ? 0 : score >= .4 ? 1 : 2;
const signed = (value: number) => (value >= 0 ? "+" : "") + value.toFixed(3);

export default function SimulationCharts({ results, weights, enabled, hasQuery }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [activeBand, setActiveBand] = useState<number | null>(null);
  const chartId = useId().replace(/:/g, "");
  const counts = groups.map((_, index) => results.filter(result => groupFor(result.score) === index).length);
  let offset = 0;
  return <section aria-label="Simulation decision charts" className="space-y-6">
    {hasQuery && <section className="relative overflow-hidden rounded-3xl border border-violet-800 bg-[#121218] p-6 text-white shadow-xl md:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(#8b82f0 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs uppercase tracking-[.2em] text-violet-300">Model observatory · synthetic data</p><h2 className="mt-2 text-2xl font-semibold">Follow every signal.</h2></div>
        <span className="rounded-full border border-violet-600/50 bg-violet-900/70 px-4 py-2 text-xs">{enabled ? "ML ranking active" : "Original order active"}</span>
      </div>
      <p className="relative mt-3 text-sm text-violet-100/70">Select a snippet to trace its calculation below. Every branch uses the current model score.</p>
      <div className="relative mt-8 overflow-x-auto pb-3">
        <div className="min-w-[650px]">
          <div className="mx-auto w-fit rounded-xl border border-violet-400/50 bg-[#242231] px-7 py-3 text-center shadow-lg"><span className="text-xs text-violet-200">TRAINED MODEL</span><p className="mt-1 font-semibold">Weighted signals → relevance</p></div>
          <div aria-hidden="true" className="mx-auto h-8 w-px bg-violet-500/60" />
          <div aria-hidden="true" className="mx-[10%] border-t border-violet-500/60" />
          <div className="grid grid-cols-5 gap-3">
            {results.map((result, index) => <div key={result.document.id}>
              <div aria-hidden="true" className="mx-auto h-6 w-px bg-violet-500/60" />
              <button type="button" aria-pressed={selected === result.document.id} onClick={() => setSelected(selected === result.document.id ? null : result.document.id)}
                className="h-full max-h-[140px] w-full rounded-xl border p-3 text-left transition-all hover:-translate-y-1 hover:border-violet-300 focus-visible:outline-violet-300"
                style={{ borderColor: selected === result.document.id ? "#b8b0ff" : "#36333f", background: selected === result.document.id ? "#302b47" : "#1b1a23", boxShadow: selected === result.document.id ? "0 0 28px #9c88ff25" : "none" }}>
                <span className="text-[10px] uppercase tracking-widest text-violet-200">{enabled ? "Rank" : "Position"} {index + 1}</span>
                <span className="mt-2 block text-xs leading-relaxed">{result.document.title}</span>
                <span className="mt-3 block font-mono text-lg">{(result.score * 100).toFixed(1)}<span className="text-xs text-violet-200"> / 100</span></span>
              </button>
            </div>)}
          </div>
        </div>
      </div>
    </section>}
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="rounded-3xl border border-rule bg-surface p-7 shadow-sm">
        <h2 className="text-xl font-semibold">Relevance distribution</h2>
        <p className="mt-2 text-sm text-graphite">Share of synthetic snippets in each score band.</p>
        {!hasQuery ? <p className="py-12 text-center text-graphite">Enter a question to see the chart.</p> : <>
          <div className="relative my-5 rounded-2xl border border-rule bg-[#111117] px-3 py-6" style={{ backgroundImage: "radial-gradient(ellipse at center, #7464bc18, transparent 70%)" }}>
          <svg viewBox="0 0 260 260" className="mx-auto w-full max-w-[300px]" role="group" aria-label="Interactive relevance distribution">
            <title>Relevance bands across {results.length} synthetic snippets</title>
            <defs>
              {groups.map((group, index) => <linearGradient key={group.label} id={chartId + "-band-" + index} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={group.color} /><stop offset="100%" stopColor={group.color} stopOpacity=".65" /></linearGradient>)}
              <filter id={chartId + "-glow"} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <circle cx="130" cy="130" r="119" fill="none" stroke="#36323f" strokeWidth=".7" strokeDasharray="1 6" />
            <circle cx="130" cy="130" r="94" fill="none" stroke="#22212b" strokeWidth="30" />
            <circle cx="130" cy="130" r="69" fill="#14131c" stroke="#393345" strokeWidth="1" />
            {groups.map((group, index) => {
              const percentage = results.length ? counts[index] / results.length * 100 : 0;
              const start = offset; offset += percentage;
              const active = activeBand === index;
              return percentage > 0 ? <circle key={group.label} cx="130" cy="130" r="94" fill="none"
                role="button" tabIndex={0} aria-pressed={active} aria-label={group.label + ": " + counts[index] + " snippets. Select to inspect."}
                onClick={() => setActiveBand(active ? null : index)}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveBand(active ? null : index); } }}
                stroke={"url(#" + chartId + "-band-" + index + ")"} strokeWidth={active ? 38 : 30} pathLength="100"
                strokeDasharray={Math.max(.01, percentage - (percentage < 100 ? 1 : 0)) + " " + (100 - Math.max(.01, percentage - (percentage < 100 ? 1 : 0)))}
                strokeDashoffset={-start} transform="rotate(-90 130 130)"
                filter={active ? "url(#" + chartId + "-glow)" : undefined}
                style={{ cursor: "pointer", opacity: activeBand === null || active ? 1 : .3, transition: "stroke-width .2s, opacity .2s" }}>
                <title>{group.label}: {counts[index]} snippets</title>
              </circle> : null;
            })}
            <text x="130" y="120" textAnchor="middle" fill="#eeeaf8" fontSize="34" fontWeight="550">{activeBand === null ? results.length : Math.round(counts[activeBand] / Math.max(1, results.length) * 100) + "%"}</text>
            <text x="130" y="145" textAnchor="middle" fill="#aaa3bb" fontSize="11">{activeBand === null ? "synthetic snippets" : groups[activeBand].label}</text>
            <text x="130" y="163" textAnchor="middle" fill="#827b95" fontSize="9">{activeBand === null ? "SELECT A SEGMENT" : counts[activeBand] + " of " + results.length + " snippets"}</text>
          </svg>
          {activeBand !== null && <button type="button" onClick={() => setActiveBand(null)} className="mx-auto mt-3 block rounded-md border border-rule px-3 py-1 text-xs text-graphite">Clear selection</button>}
          </div>
          <table className="w-full text-sm"><caption className="sr-only">Score bands and counts</caption><thead className="sr-only"><tr><th>Band</th><th>Count</th></tr></thead>
            <tbody>{groups.map((group, index) => <tr key={group.label}><th scope="row" className="py-2 text-left font-normal">
              <button type="button" aria-pressed={activeBand === index} onClick={() => setActiveBand(activeBand === index ? null : index)} className="rounded px-1 py-1 text-left hover:bg-paper"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color }} />{group.label}</button>
              <span className="block pl-5 text-xs text-graphite">{group.rule}</span>
            </th><td className="text-right font-mono">{counts[index]} · {Math.round(counts[index] / Math.max(1, results.length) * 100)}%</td></tr>)}</tbody>
          </table>
        </>}
        <p className="mt-4 text-xs leading-relaxed text-graphite">Bands are display rules, not learned thresholds. Counts are not a probability that a claim is true. {enabled ? "" : "Model scores remain visible while ranking is off."}</p>
      </section>
      <section className="rounded-2xl border border-rule bg-surface p-6">
        <h2 className="text-xl font-semibold">Decision explanation tree</h2>
        <p className="mt-2 text-sm leading-relaxed text-graphite">Expand any snippet to trace its inputs → weighted contributions → model score → display band. This visualizes logistic regression; the model is not a decision-tree classifier.</p>
        {!hasQuery ? <p className="mt-6 text-graphite">Enter a question to inspect decisions.</p> :
          <ul className="mt-5 space-y-3" aria-label="Decision trees for every snippet">
            {results.map((result, rank) => {
              const contributions = result.features.map((value, index) => value * weights[index]);
              const logit = contributions.reduce((sum, value) => sum + value, 0);
              const group = groups[groupFor(result.score)];
              return <li key={result.document.id} style={{ opacity: activeBand === null || groupFor(result.score) === activeBand ? 1 : .35, transition: "opacity .2s" }}><details key={selected === result.document.id ? "selected" : "collapsed"} open={selected === result.document.id} className="rounded-2xl border border-rule bg-gradient-to-br from-white to-violet-50/40 p-5 shadow-sm">
                <summary className="cursor-pointer font-semibold"><span className="mr-2 font-mono text-sm text-graphite">{enabled ? "Rank" : "Position"} {rank + 1}</span>{result.document.title}
                  <span className="mt-2 block text-sm font-normal" style={{ color: group.color }}>{group.label} · {(result.score * 100).toFixed(1)}/100</span>
                </summary>
                <ul className="ml-2 mt-4 border-l-2 border-rule pl-5 text-sm">
                  <li><p className="font-semibold">Feature contributions</p>
                    <ul className="my-3 space-y-2">{["Bias", "Title overlap", "Text overlap", "Freshness"].map((name, index) =>
                      <li key={name} className="border-l border-rule pl-3"><span>{name}</span><code className="mt-1 block break-words text-xs text-graphite">{result.features[index].toFixed(3)} × {weights[index].toFixed(3)} = {signed(contributions[index])}</code></li>)}</ul>
                  </li>
                  <li className="border-t border-rule py-3">↳ Sum of contributions: <strong>{signed(logit)}</strong></li>
                  <li className="border-t border-rule py-3">↳ Sigmoid(sum): <strong>{result.score.toFixed(4)}</strong></li>
                  <li className="border-t border-rule py-3">↳ Display rule: <strong style={{ color: group.color }}>{group.rule} → {group.label}</strong></li>
                  <li className="border-t border-rule pt-3">↳ {enabled ? "Sorted by descending score into rank " + (rank + 1) : "Ranking disabled: original source position " + (rank + 1)}</li>
                </ul>
              </details></li>;
            })}
          </ul>}
      </section>
    </div>
  </section>;
}
