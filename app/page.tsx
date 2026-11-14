"use client";

import { useEffect, useRef, useState } from "react";
import type { Memo, TrailStep } from "@/lib/types";
import ErrorBox from "@/components/ErrorBox";
import MemoView from "@/components/MemoView";
import { errMsg, fmtMs } from "@/components/http";
import { streamMemo } from "@/components/memo-stream";

type Depth = "quick" | "deep";

export default function Home() {
  const [company, setCompany] = useState("");
  const [context, setContext] = useState("");
  const [depth, setDepth] = useState<Depth>("deep");
  const [subject, setSubject] = useState("");
  const [steps, setSteps] = useState<TrailStep[]>([]);
  const request = useRef<AbortController>(null);
  const [error, setError] = useState<string | null>(null);
  const [memo, setMemo] = useState<Memo | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = company.trim();
    if (!name || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setSteps([]);
    setSubject(name);
    try {
      const result = await streamMemo(
        { company: name, context: context.trim() || undefined, depth },
        controller.signal,
        (step) => setSteps((previous) => [...previous, step]),
      );
      if (!controller.signal.aborted) setMemo(result);
    } catch (err) {
      if (!controller.signal.aborted) setError(errMsg(err));
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setSubject("");
    }
  }

  const loading = Boolean(subject);
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
        <section className="rounded-2xl border border-line bg-soft p-5 sm:p-8" aria-labelledby="progress-title">
          <h2 id="progress-title" className="break-words text-xl font-semibold">Researching {subject}</h2>
          <p className="mt-1 text-sm text-muted" role="status">
            {steps.length === 0 ? "Waiting for the first research step…" : `${steps.length} completed steps`}
          </p>
          {steps.length > 0 && (
            <ol className="mt-4 divide-y divide-line">
              {steps.slice(-6).map((step, index) => (
                <li key={steps.length - Math.min(steps.length, 6) + index} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 break-words">{step.label}</span>
                  <span className="shrink-0 text-sm text-muted tabular-nums">{fmtMs(step.ms)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {error && <ErrorBox message={error} />}

      {!loading && memo && <MemoView key={memo.id} memo={memo} />}
    </div>
  );
}
