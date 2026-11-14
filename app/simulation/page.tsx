"use client";
import { useMemo, useState } from "react";
import SimulationCharts from "@/components/SimulationCharts";
import { documents, features, trainModel } from "@/lib/search/simulation";

export default function Simulation() {
  const model = useMemo(() => trainModel(), []);
  const [query, setQuery] = useState("Aster Robotics funding");
  const [age, setAge] = useState(5);
  const [enabled, setEnabled] = useState(true);
  const results = documents.map((doc, index) => {
    const document = index === 0 ? { ...doc, daysOld: age } : doc;
    return { document, score: model.score(query, document), features: features(query, document), original: index };
  }).sort((a, b) => enabled ? b.score - a.score : a.original - b.original);

  return <div className="space-y-8">
    <header className="space-y-4">
      <span className="inline-block rounded-full border border-dig bg-dig-soft px-3 py-1 text-sm font-semibold text-dig">SIMULATION · SYNTHETIC DATA</span>
      <h1 className="serif text-4xl md:text-6xl">Teach search what matters.</h1>
      <p className="max-w-3xl text-lg text-graphite">A small logistic regression model learns to rank research snippets. Change the query or source age to see the ranking respond. No API calls or credentials are used.</p>
    </header>
    <section className="rounded-2xl border border-rule bg-surface p-6">
      <label className="block font-semibold" htmlFor="sim-query">Research question</label>
      <input id="sim-query" value={query} onChange={e => setQuery(e.target.value)} className="mt-3 w-full rounded-lg border border-rule p-4 text-lg" />
      <div className="mt-4 flex flex-wrap gap-2">
        {["Aster Robotics funding", "Aster Robotics competitors", "Aster Academy education", "robots pricing"].map(q => <button key={q} onClick={() => setQuery(q)} className="rounded-full border border-rule px-3 py-2 text-sm hover:bg-paper">{q}</button>)}
      </div>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <label htmlFor="source-age">Funding source age: <strong>{age} days</strong>
          <input className="mt-3 block w-full" id="source-age" type="range" min="0" max="1000" value={age} onChange={e => setAge(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-3"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Rank with trained model</label>
      </div>
    </section>
    <SimulationCharts results={results} weights={model.weights} enabled={enabled} hasQuery={Boolean(query.trim())} />
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <section aria-label="Ranked synthetic snippets" aria-live="polite" className="space-y-3">
        <h2 className="text-xl font-semibold">{enabled ? "ML ranking" : "Original source order"}</h2>
        {results.map(({ document, score, features: values }, i) => <article key={document.id} className="rounded-xl border border-rule bg-surface p-5">
          <div className="flex items-start justify-between gap-4"><h3 className="font-semibold"><span className="mr-3 text-graphite">{i + 1}.</span>{document.title}</h3><span className="whitespace-nowrap font-mono text-sm">{query.trim() ? Math.round(score * 100) + "/100" : "—"}</span></div>
          <p className="my-3 text-graphite">{document.text}</p>
          <div className="h-1.5 overflow-hidden rounded bg-paper"><div className="h-full bg-cobalt" style={{ width: query.trim() ? score * 100 + "%" : "0%" }} /></div>
          <p className="mt-3 text-xs text-graphite">Title overlap {Math.round(values[1] * 100)}% · Text overlap {Math.round(values[2] * 100)}% · {document.daysOld} days old</p>
        </article>)}
      </section>
      <aside className="space-y-5">
        <section className="rounded-xl border border-rule bg-surface p-5"><h2 className="font-semibold">What the model learned</h2><p className="mt-3 text-sm text-graphite">Trained in your browser on {model.trainingExamples} synthetic labeled feature examples for 800 gradient-descent steps.</p>
          {["Bias", "Title overlap", "Text overlap", "Freshness"].map((label, i) => <div key={label} className="mt-3 flex justify-between text-sm"><span>{label}</span><code>{model.weights[i].toFixed(2)}</code></div>)}
          <p className="mt-4 text-sm">Training loss: {model.losses[0].toFixed(3)} → {model.losses[1].toFixed(3)}</p>
        </section>
        <p className="text-sm leading-relaxed text-graphite">Scores illustrate relevance, not truth or calibrated confidence. These companies and snippets are fictional. Token overlap can miss synonyms and confuse entities. Lower training loss does not establish real-world accuracy. The production research pipeline is unchanged.</p>
      </aside>
    </div>
  </div>;
}
