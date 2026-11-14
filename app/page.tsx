"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Memo, TrailStep } from "@/lib/types";
import ErrorBox from "@/components/ErrorBox";
import MemoView from "@/components/MemoView";
import RecentMemos from "@/components/RecentMemos";
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

  const runResearch = useCallback(async (name: string, detail: string, depth: Depth) => {
    if (!name || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setSteps([]);
    setSubject(name);
    try {
      const result = await streamMemo(
        { company: name, context: detail.trim() || undefined, depth },
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
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const name = query.get("company")?.trim();
    if (!name) return;
    const requestedDepth = query.get("depth") === "quick" ? "quick" : "deep";
    setCompany(name);
    setDepth(requestedDepth);
    if (query.get("go") !== "1") return;
    const timer = setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("go");
      window.history.replaceState(null, "", url);
      void runResearch(name, "", requestedDepth);
    }, 0);
    return () => clearTimeout(timer);
  }, [runResearch]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void runResearch(company.trim(), context, depth);
  }

  const loading = Boolean(subject);
  return (
    <div className="space-y-12">
      <form onSubmit={submit} className="space-y-4">
        <div className="mb-8">
            <h1 className="text-5xl font-semibold tracking-tight">Is it worth pursuing?</h1>
            <p className="mt-3 max-w-2xl text-xl text-muted">
              Get a verdict, cited facts and risks, and questions to follow up on.
            </p>
        </div>
        <label htmlFor="research-subject" className="block font-semibold">Company, vendor or market</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="A startup, vendor or market"
            id="research-subject"
            required
            disabled={loading}
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
            disabled={loading}
            className="min-w-0 flex-1 rounded-xl border border-line px-4 py-2.5 outline-none placeholder:text-muted/60 focus:border-accent"
          />
          <fieldset disabled={loading} className="flex flex-wrap gap-1 rounded-xl border border-line p-1">
            <legend className="sr-only">Research depth</legend>
            {(["quick", "deep"] as const).map((option) => (
              <label key={option} className="cursor-pointer">
                <input
                  type="radio"
                  name="research-depth"
                  checked={depth === option}
                  onChange={() => setDepth(option)}
                  className="peer sr-only"
                />
                <span className="block rounded-lg px-4 py-1.5 font-medium text-muted peer-checked:bg-accent peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                  {option === "quick" ? "Quick research" : "Deep research"}
                </span>
              </label>
            ))}
          </fieldset>
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
      {!loading && <RecentMemos key={memo?.id ?? "initial"} />}
    </div>
  );
}
