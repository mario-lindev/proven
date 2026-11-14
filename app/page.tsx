"use client";

import { useEffect, useState } from "react";
import type { Memo } from "@/lib/types";
import ErrorBox from "@/components/ErrorBox";
import MemoView from "@/components/MemoView";
import { api, errMsg } from "@/components/http";

type Depth = "quick" | "deep";

// Each step: label and how long (ms) the timer stays on it before moving on.
// The last step stays active until the memo arrives.
const STEPS: Record<Depth, [string, number][]> = {
  quick: [
    ["Planning the research", 5000],
    ["Searching across engines (Telem + Tavily)", 13000],
    ["Reading the best sources", 14000],
    ["Writing the memo", 0],
  ],
  deep: [
    ["Planning the research", 8000],
    ["Searching across engines (Telem + Tavily)", 22000],
    ["Reading the best sources", 25000],
    ["Following up on gaps", 30000],
    ["Writing the memo", 0],
  ],
};

export default function Home() {
  const [company, setCompany] = useState("");
  const [context, setContext] = useState("");
  const [depth, setDepth] = useState<Depth>("deep");
  const [loading, setLoading] = useState<Depth | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [memo, setMemo] = useState<Memo | null>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const steps = STEPS[loading];
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      if (i >= steps.length - 1) return;
      t = setTimeout(() => {
        i += 1;
        setStep(i);
        next();
      }, steps[i][1]);
    };
    next();
    return () => clearTimeout(t);
  }, [loading]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = company.trim();
    if (!name || loading) return;
    setError(null);
    setMemo(null);
    setStep(0);
    setLoading(depth);
    try {
      const m = await api<Memo>("/api/memo", { company: name, context: context.trim() || undefined, depth });
      setMemo(m);
      setRun((r) => r + 1);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-12">
      <form onSubmit={submit} className="space-y-4">
        {!memo && !loading && (
          <div className="mb-8">
            <h1 className="text-5xl font-semibold tracking-tight">Is it worth pursuing?</h1>
            <p className="mt-3 max-w-2xl text-xl text-muted">
              A one-page memo with fresh facts, risks and open questions. Every line links to its source.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="A startup, vendor or market"
            aria-label="A startup, vendor or market"
            autoFocus
            className="min-w-0 flex-1 rounded-xl border-2 border-line px-5 py-4 text-2xl outline-none placeholder:text-muted/60 focus:border-accent"
          />
          <button
            type="submit"
            disabled={!company.trim() || !!loading}
            className="rounded-xl bg-accent px-8 py-4 text-xl font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "Checking..." : "Check"}
          </button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Context (optional)"
            aria-label="Context (optional)"
            className="min-w-0 flex-1 rounded-xl border border-line px-4 py-2.5 outline-none placeholder:text-muted/60 focus:border-accent"
          />
          <div role="radiogroup" aria-label="Research depth" className="flex rounded-xl border border-line p-1">
            {(["quick", "deep"] as Depth[]).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={depth === d}
                onClick={() => setDepth(d)}
                disabled={!!loading}
                className={`rounded-lg px-4 py-1.5 font-medium ${
                  depth === d ? "bg-accent text-white" : "text-muted hover:text-foreground"
                }`}
              >
                {d === "quick" ? "Quick research" : "Deep research"}
              </button>
            ))}
          </div>
        </div>
      </form>

      {loading && (
        <section className="rounded-2xl border border-line p-8">
          <p className="mb-5 text-muted">
            Researching <span className="font-semibold text-foreground">{company.trim()}</span>.{" "}
            {loading === "deep" ? "Deep runs take 1 to 2 minutes." : "This takes 30 to 60 seconds."}
          </p>
          <ol className="space-y-4">
            {STEPS[loading].map(([label], i) => {
              const state = i < step ? "done" : i === step ? "active" : "todo";
              return (
                <li key={label} className="flex items-center gap-4 text-xl">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                      state === "done"
                        ? "border-accent bg-accent"
                        : state === "active"
                          ? "animate-pulse border-accent"
                          : "border-line"
                    }`}
                  >
                    {state === "done" && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                  </span>
                  <span className={state === "todo" ? "text-muted/60" : state === "active" ? "font-semibold" : ""}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {error && <ErrorBox message={error} />}

      {memo && <MemoView key={run} memo={memo} />}
    </div>
  );
}
