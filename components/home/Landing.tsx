"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import RecentMemos from "@/components/RecentMemos";
import Motif from "@/components/ascii/Motifs";

export type Numbers = { queries: number; engines: number; pct: number | null; memos: number | null; verified: number | null };

// Full-bleed band inside the centered <main>.
function Band({ dark, children, className = "" }: { dark?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <section className={`relative left-1/2 w-screen -translate-x-1/2 ${dark ? "bg-navy text-[#eef1f6]" : ""} ${className}`}>
      <div className="mx-auto max-w-[1240px] px-5 md:px-10">{children}</div>
    </section>
  );
}

const STEPS = [
  { kind: "plan" as const, t: "Plan", d: "Claude breaks the question into searches: funding, rivals, hiring, lawsuits, sentiment. Deep mode searches again for whatever is still open." },
  { kind: "route" as const, t: "Route", d: "Telem picks the engines for each question, including LinkedIn, X, Reddit and Trustpilot, and records every call in the trail." },
  { kind: "prove" as const, t: "Prove", d: "Every line is checked against the page it cites. Lines without a supporting quote are dropped." },
  { kind: "learn" as const, t: "Learn", d: "Engines whose pages held up in past memos get read first next time." },
];

export default function Landing({ numbers, refreshKey, onStart }: { numbers: Numbers | null; refreshKey: number; onStart: () => void }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = root.current?.querySelectorAll("[data-reveal]");
    if (!els) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("is-in"), io.unobserve(e.target))),
      { rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div ref={root} className="no-print">
      {/* Proof band + recent memos */}
      <Band className="border-t border-rule py-20">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_26rem]">
          <div data-reveal>
            <h2 className="display max-w-[34rem] text-[3rem]">Every line in a memo is quoted from the page it cites.</h2>
            {numbers ? (
              <dl className="mt-12 grid grid-cols-2 gap-x-10 gap-y-10 sm:grid-cols-4">
                {[
                  [String(numbers.queries), "questions routed by Telem"],
                  [String(numbers.engines), "engines answered"],
                  numbers.pct !== null ? [`${numbers.pct}%`, "of verified proof came from engines Telem chose"] : null,
                  numbers.memos !== null ? [String(numbers.memos), "memos Proven has learned from"] : null,
                ]
                  .filter((x): x is string[] => !!x)
                  .map(([v, l], i) => (
                    <div key={l}>
                      <dd className={`display tnum text-[4.2rem] leading-none ${i === 2 ? "text-rust" : ""}`}>{v}</dd>
                      <dt className="mt-3 font-mono text-[0.78rem] leading-snug text-graphite">{l}</dt>
                    </div>
                  ))}
              </dl>
            ) : (
              <p className="mt-6 max-w-[34rem] text-[1.1rem] leading-relaxed text-graphite">
                Run a memo and the numbers show up here: questions routed, engines used, and how much of the proof came from
                engines Telem chose.
              </p>
            )}
          </div>
          <div data-reveal>
            <RecentMemos refreshKey={refreshKey} />
          </div>
        </div>
      </Band>

      {/* Product tour */}
      <Band className="border-t border-rule py-24">
        <h2 data-reveal className="display max-w-[40rem] text-[3.4rem]">One question in. A verdict with the receipt out.</h2>
        <div className="mt-14 grid gap-5 md:grid-cols-2">
          <Link data-reveal href="/memo/memo_kd83cz6e" className="group rounded-lg border border-rule bg-surface p-7 transition-colors hover:border-cobalt md:col-span-2">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="display text-[2rem] group-hover:text-cobalt">Claims vs. reality</h3>
              <span className="font-mono text-[0.78rem] text-graphite">from a real memo: Builder.ai &rarr;</span>
            </div>
            <p className="mt-2 max-w-[44rem] text-graphite">
              Proven puts what a company says about itself next to what independent sources say, each side cited.
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-rule bg-paper p-5">
                <p className="font-mono text-[0.75rem] uppercase tracking-wider text-graphite">The company says</p>
                <p className="serif mt-2 text-[1.35rem] leading-snug">2024 sales forecast of about $220M</p>
              </div>
              <div className="rounded-lg border border-pass/40 bg-pass-soft p-5">
                <p className="font-mono text-[0.75rem] uppercase tracking-wider text-pass">Independent sources say</p>
                <p className="serif mt-2 text-[1.35rem] leading-snug">An audit put actual 2024 sales at about $50M</p>
              </div>
            </div>
          </Link>

          {[
            { href: "/run", t: "Run everything", d: "One click runs a pitch audit, a research memo and a watch side by side.", rows: ["pitch audit", "research memo", "watch"] },
            { href: "/audit", t: "Pitch Audit", d: "Paste a website or a pitch. Every claim the company makes about itself is checked against sources it does not control.", rows: ["supported", "contradicted", "unclear"] },
            { href: "/live", t: "Live Room", d: "Claims are checked as they are spoken, in the browser or on a Google Meet or Zoom call through the Chrome extension.", rows: ["“We have no competitors”", "contradicted"] },
            { href: "/impact", t: "Event Impact", d: "Name a public company and an event. Proven checks whether it was reported, finds comparable past events and shows what those stocks did next.", rows: ["event reported?", "comparable past events", "what the stock did next"] },
          ].map((b) => (
            <Link data-reveal key={b.href} href={b.href} className="group flex flex-col rounded-lg border border-rule bg-surface p-7 transition-colors hover:border-cobalt">
              <div className="flex items-baseline justify-between">
                <h3 className="display text-[1.8rem] group-hover:text-cobalt">{b.t}</h3>
                <span className="font-mono text-faint transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-cobalt">&rarr;</span>
              </div>
              <p className="mt-2 text-graphite">{b.d}</p>
              <div className="mt-auto pt-6 font-mono text-[0.78rem]">
                {b.rows.map((r, i) => (
                  <p key={r} className="flex items-center gap-2 border-t border-rule-soft py-1.5 text-graphite">
                    <span className={`h-1.5 w-1.5 rounded-full ${r === "contradicted" ? "bg-pass" : r === "supported" ? "bg-pursue" : r === "unclear" ? "bg-dig" : i === 0 ? "bg-rust" : "bg-cobalt"}`} />
                    {r}
                  </p>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </Band>

      {/* How it works */}
      <Band dark className="py-24">
        <h2 data-reveal className="display max-w-[40rem] text-[3.4rem] !text-[#eef1f6]">How it works</h2>
        <ol data-reveal className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.t}>
              <div className="h-28 rounded-lg border border-white/15">
                <Motif kind={s.kind} label={`${s.t}: ${s.d}`} />
              </div>
              <h3 className="display mt-5 flex items-baseline gap-3 text-[2rem] !text-[#eef1f6]">
                <span className="tnum font-mono text-[0.8rem] tracking-normal text-[#aab6c9]">0{i + 1}</span>
                {s.t}
              </h3>
              <p className="mt-2 leading-relaxed text-[#c3ccda]">{s.d}</p>
            </li>
          ))}
        </ol>
      </Band>

      {/* Why it's different */}
      <Band className="py-24">
        <div data-reveal className="grid gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-3">
          {[
            ["A search engine", "gives you links."],
            ["A chatbot", "gives you an answer."],
            ["Proven", "gives you a verdict with the receipt."],
          ].map(([who, what], i) => (
            <div key={who} className={`p-8 ${i === 2 ? "bg-surface" : "bg-paper"}`}>
              <p className={`display text-[2.2rem] ${i === 2 ? "" : "!text-graphite"}`}>{who}</p>
              <p className={`mt-1 text-[1.15rem] ${i === 2 ? "text-ink" : "text-graphite"}`}>{what}</p>
            </div>
          ))}
        </div>
      </Band>

      {/* Closing */}
      <Band dark className="py-28">
        <div data-reveal className="flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
          <h2 className="display max-w-[44rem] text-[3.8rem] !text-[#eef1f6]">Know what is true before you commit.</h2>
          <button type="button" onClick={onStart} className="btn shrink-0 bg-[#eef1f6] px-7 py-3.5 text-lg text-navy hover:bg-white">
            Research a company <span aria-hidden>&uarr;</span>
          </button>
        </div>
      </Band>

      {/* Footer */}
      <footer className="relative left-1/2 -mb-28 w-screen -translate-x-1/2 border-t border-white/10 bg-navy text-[#c3ccda]">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-5 py-12 md:flex-row md:justify-between md:px-10">
          <div>
            <p className="serif text-[1.9rem] leading-none tracking-[-0.03em] text-[#eef1f6]">Proven</p>
            <p className="mt-3 text-sm">Built at SearchHack 2026 with Telem and Tavily.</p>
            <p className="mt-1 text-sm">Rishith, Aarav, Mario.</p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 font-mono text-[0.8rem] sm:grid-cols-3">
            {[
              ["/", "Research"], ["/run", "Run everything"], ["/audit", "Pitch Audit"], ["/live", "Live Room"],
              ["/impact", "Event Impact"], ["/telem", "Telem"], ["/engines", "Learned"], ["/simulation", "ML Lab"],
            ].map(([h, l]) => (
              <Link key={h} href={h} className="hover:text-white">{l}</Link>
            ))}
            <a href="https://github.com/mario-lindev/proven" className="hover:text-white">GitHub</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
