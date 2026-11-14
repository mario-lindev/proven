"use client";
import { useEffect, useState } from "react";
import type { MlResult } from "@/lib/ml";

const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export default function RealModel() {
  const [data, setData] = useState<MlResult | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/ml").then(async r => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not train the model");
      setData(j);
    }).catch(e => setError(String(e.message ?? e)));
  }, []);

  const max = data?.ready ? Math.max(...data.features.map(f => Math.abs(f.weight)), 0.001) : 1;
  const h = data?.ready ? data.holdout : null;
  return <section className="space-y-5 rounded-2xl border border-rule bg-surface p-6">
    <h1 className="serif text-3xl md:text-5xl">Trained on Proven&apos;s own results</h1>
    <p className="max-w-3xl text-lg text-graphite">Each search result is a row. The label is whether it ended up backing a verified line.</p>
    {error && <p className="text-dig">{error}</p>}
    {!data && !error && <p className="text-graphite">Training on saved memos…</p>}
    {data && !data.ready && <p className="text-graphite">Not trained yet: {data.reason}</p>}
    {data?.ready && h && <>
      <div className="flex flex-wrap gap-8">
        {([["Search results (rows)", data.rows], ["Backed a verified line", data.positives], ["Memos", data.memos]] as const).map(([label, value]) =>
          <div key={label}><div className="font-mono text-3xl">{value.toLocaleString()}</div><div className="text-sm text-graphite">{label}</div></div>)}
      </div>
      <div>
        <h2 className="font-semibold">What makes a result more or less likely to be provable</h2>
        <p className="text-sm text-graphite">Logistic regression weights on standardized features. Right of the line: more likely. Left: less likely.</p>
        <div className="mt-3 space-y-2">
          {[...data.features].sort((a, b) => b.weight - a.weight).map(f => <div key={f.name} className="grid grid-cols-[minmax(0,220px)_1fr_56px] items-center gap-3 text-sm">
            <span>{f.name}</span>
            <div className="relative h-4 rounded bg-paper">
              <div className="absolute inset-y-0 left-1/2 w-px bg-rule" />
              <div className={`absolute inset-y-0 rounded ${f.weight >= 0 ? "bg-cobalt" : "bg-dig"}`}
                style={{ width: `${Math.abs(f.weight) / max * 50}%`, left: f.weight >= 0 ? "50%" : `${50 - Math.abs(f.weight) / max * 50}%` }} />
            </div>
            <code className="text-right">{f.weight > 0 ? "+" : ""}{f.weight.toFixed(2)}</code>
          </div>)}
        </div>
      </div>
      <p className="text-lg">On memos it never saw, <strong>{n(h.precision_at_10)}</strong> of its top 10 picks were verified, vs <strong>{n(h.baseline_precision_at_10)}</strong> for the original search order.</p>
      <p className="text-sm text-graphite">
        {h.precision_at_10 > h.baseline_precision_at_10 ? "Better than search order on this holdout, but " : "Not better than search order yet; "}
        {h.memos} held-out {h.memos === 1 ? "memo is" : "memos are"} too few to be sure. Numbers are the average per held-out memo ({h.rows.toLocaleString()} results, {h.positives} verified). AUC {h.auc.toFixed(2)}.
        Only pages Proven chose to read can be verified, so the label also reflects which results the pipeline picked. The model is not used in the memo pipeline.
      </p>
    </>}
    <p className="border-t border-rule pt-4 text-graphite">Below: the same kind of model on made-up data, so you can see how it works.</p>
  </section>;
}
