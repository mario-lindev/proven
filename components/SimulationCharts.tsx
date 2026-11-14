"use client";
import { useState } from "react";

type Result = { document: { id: string; title: string }; score: number; features: number[] };
type Props = { results: Result[]; weights: number[]; enabled: boolean; hasQuery: boolean };
const groups = [
  { label: "High relevance", color: "#17704a", rule: "Score ≥ 70" },
  { label: "Review", color: "#a8670b", rule: "40 ≤ score < 70" },
  { label: "Low relevance", color: "#b2242c", rule: "Score < 40" },
];
const groupFor = (score: number) => score >= .7 ? 0 : score >= .4 ? 1 : 2;
const signed = (value: number) => (value >= 0 ? "+" : "") + value.toFixed(3);

export default function SimulationCharts({ results, weights, enabled, hasQuery }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const counts = groups.map((_, index) => results.filter(result => groupFor(result.score) === index).length);
  let offset = 0;
  return <section aria-label="Simulation decision charts" className="space-y-6">
    {hasQuery && <section className="relative overflow-hidden rounded-[8px] border border-rule bg-surface p-6 md:p-8">
            <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="serif text-[1.9rem] font-semibold">Follow every signal</h2><p className="mt-1 font-mono text-xs text-dig">Synthetic data</p></div>
        <span className="rounded-[8px] border border-rule bg-paper px-3 py-1.5 font-mono text-xs">{enabled ? "ML ranking active" : "Original order active"}</span>
      </div>
      <p className="relative mt-3 text-sm text-graphite">Select a snippet to trace its calculation below. Every branch uses the current model score.</p>
      <div className="relative mt-8 overflow-x-auto pb-3">
        <div className="min-w-[650px]">
          <div className="mx-auto w-fit rounded-[8px] border border-ink bg-ink px-7 py-3 text-center text-white"><span className="font-mono text-xs text-white/70">Trained model</span><p className="mt-1 font-semibold">Weighted signals → relevance</p></div>
          <div aria-hidden="true" className="mx-auto h-8 w-px bg-rule" />
          <div aria-hidden="true" className="mx-[10%] border-t border-rule" />
          <div className="grid grid-cols-5 gap-3">
            {results.map((result, index) => <div key={result.document.id}>
              <div aria-hidden="true" className="mx-auto h-6 w-px bg-rule" />
              <button type="button" aria-pressed={selected === result.document.id} onClick={() => setSelected(selected === result.document.id ? null : result.document.id)}
                className="h-full max-h-[140px] w-full rounded-[8px] border p-3 text-left transition-colors duration-300 ease-[cubic-bezier(.22,1,.36,1)] hover:border-ink"
                style={{ borderColor: selected === result.document.id ? "#2c46c9" : "#d8dee4", background: selected === result.document.id ? "#e9edfb" : "#ffffff" }}>
                <span className="font-mono text-[11px] text-graphite">{enabled ? "Rank" : "Position"} {index + 1}</span>
                <span className="mt-2 block text-xs leading-relaxed">{result.document.title}</span>
                <span className="mt-3 block font-mono text-lg">{(result.score * 100).toFixed(1)}<span className="text-xs text-graphite"> / 100</span></span>
              </button>
            </div>)}
          </div>
        </div>
      </div>
    </section>}
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="rounded-[8px] border border-rule bg-surface p-7">
        <h2 className="serif text-[1.6rem] font-semibold">Relevance distribution</h2>
        <p className="mt-2 text-sm text-graphite">Share of synthetic snippets in each score band.</p>
        {!hasQuery ? <p className="py-12 text-center text-graphite">Enter a question to see the chart.</p> : <>
          <svg viewBox="0 0 220 220" className="mx-auto my-6 w-full max-w-[260px]" role="img" aria-label={groups.map((group, index) => group.label + ": " + counts[index] + " snippets").join("; ")}>
            <title>Relevance distribution across {results.length} synthetic snippets</title>
            <circle cx="110" cy="110" r="109" fill="none" stroke="#e8ecf0" strokeWidth="1" />
            <circle cx="110" cy="110" r="56" fill="#f3f5f7" />
            {groups.map((group, index) => {
              const percentage = results.length ? counts[index] / results.length * 100 : 0;
              const start = offset;
              offset += percentage;
              return percentage > 0 ? <circle key={group.label} cx="110" cy="110" r="85" fill="none" stroke={group.color}
                className="transition-opacity duration-300 hover:opacity-75" strokeWidth="40" pathLength="100" strokeDasharray={percentage + " " + (100 - percentage)}
                strokeDashoffset={-start} transform="rotate(-90 110 110)"><title>{group.label}: {counts[index]} snippets</title></circle> : null;
            })}
            <text x="110" y="108" textAnchor="middle" fill="currentColor" fontSize="32" fontWeight="600">{results.length}</text>
            <text x="110" y="132" textAnchor="middle" fill="currentColor" fontSize="12">synthetic snippets</text>
          </svg>
          <table className="w-full text-sm"><caption className="sr-only">Score bands and counts</caption><thead className="sr-only"><tr><th>Band</th><th>Count</th></tr></thead>
            <tbody>{groups.map((group, index) => <tr key={group.label}><th scope="row" className="py-2 text-left font-normal">
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color }} />{group.label}
              <span className="block pl-5 text-xs text-graphite">{group.rule}</span>
            </th><td className="text-right font-mono">{counts[index]} · {Math.round(counts[index] / Math.max(1, results.length) * 100)}%</td></tr>)}</tbody>
          </table>
        </>}
        <p className="mt-4 text-xs leading-relaxed text-graphite">Bands are display rules, not learned thresholds. Counts are not a probability that a claim is true. {enabled ? "" : "Model scores remain visible while ranking is off."}</p>
      </section>
      <section className="rounded-[8px] border border-rule bg-surface p-6">
        <h2 className="serif text-[1.6rem] font-semibold">Decision explanation tree</h2>
        <p className="mt-2 text-sm leading-relaxed text-graphite">Expand any snippet to trace its inputs → weighted contributions → model score → display band. This visualizes logistic regression; the model is not a decision-tree classifier.</p>
        {!hasQuery ? <p className="mt-6 text-graphite">Enter a question to inspect decisions.</p> :
          <ul className="mt-5 space-y-3" aria-label="Decision trees for every snippet">
            {results.map((result, rank) => {
              const contributions = result.features.map((value, index) => value * weights[index]);
              const logit = contributions.reduce((sum, value) => sum + value, 0);
              const group = groups[groupFor(result.score)];
              return <li key={result.document.id}><details key={selected === result.document.id ? "selected" : "collapsed"} open={selected === result.document.id} className="rounded-[8px] border border-rule bg-surface p-5">
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
