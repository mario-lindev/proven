"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/flow/PageHeader";
import type { ImproveEvent, ImproveResult, ImproveRow } from "@/lib/brain/improve";

const STEPS = ["Score", "Read the misses", "Rewrite the strategy", "Re-score", "Keep the best", "Test on unseen claims", "Use it"];

type Group = { key: string; title: string; rows: ImproveRow[] };

function groupsOf(r: ImproveResult): Group[] {
  const g: Group[] = r.iterations.map((it) => ({
    key: `train-${it.n}`,
    title: it.n === 0 ? "Practice, starting strategy" : `Practice, rewrite ${it.n}`,
    rows: it.rows,
  }));
  g.push({ key: "test-baseline", title: "Unseen claims, starting strategy", rows: r.test.rows_baseline });
  if (r.winner_strategy !== r.default_strategy) g.push({ key: "test-winner", title: "Unseen claims, best strategy", rows: r.test.rows_winner });
  return g;
}

const right = (rows: ImproveRow[]) => rows.filter((x) => x.correct).length;

export default function ImproveLoop() {
  const [result, setResult] = useState<ImproveResult | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [proposed, setProposed] = useState<{ n: number; strategy: string; rejected?: string }[]>([]);

  useEffect(() => {
    fetch("/api/improve", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ready: boolean; result?: ImproveResult }) => {
        if (d.ready && d.result) {
          setResult(d.result);
          setGroups(groupsOf(d.result));
        }
      })
      .catch(() => setErr("Couldn't reach the Proven server."));
  }, []);

  function onEvent(ev: ImproveEvent) {
    if (ev.type === "row") {
      const key = ev.phase === "train" ? `train-${ev.iteration}` : `test-${ev.which}`;
      const title =
        ev.phase === "train"
          ? ev.iteration === 0 ? "Practice, starting strategy" : `Practice, rewrite ${ev.iteration}`
          : ev.which === "baseline" ? "Unseen claims, starting strategy" : "Unseen claims, best strategy";
      setGroups((gs) => {
        const i = gs.findIndex((g) => g.key === key);
        if (i < 0) return [...gs, { key, title, rows: [ev.row] }];
        return gs.map((g, j) => (j === i ? { ...g, rows: [...g.rows, ev.row] } : g));
      });
    } else if (ev.type === "strategy") setProposed((p) => [...p, ev]);
    else if (ev.type === "done") setResult(ev.result);
    else if (ev.type === "error") setErr(ev.error);
  }

  async function run() {
    setRunning(true);
    setErr(null);
    setGroups([]);
    setProposed([]);
    setResult(null);
    try {
      const res = await fetch("/api/improve", { method: "POST" });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) if (l.trim()) onEvent(JSON.parse(l) as ImproveEvent);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      // A refused run leaves the last saved one on screen.
      fetch("/api/improve", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { ready: boolean; result?: ImproveResult }) => {
          if (d.ready && d.result) {
            setResult(d.result);
            setGroups(groupsOf(d.result));
          }
        })
        .catch(() => {});
    } finally {
      setRunning(false);
    }
  }

  const t = result?.test;
  const nTest = t?.rows_baseline.length ?? 0;
  const changed = !!result && result.winner_strategy !== result.default_strategy;
  const better = !!t && changed && right(t.rows_winner) > right(t.rows_baseline);

  return (
    <div className="space-y-12">
      <PageHeader
        title="Proven improves itself"
        lede="Proven scores its own search strategy against an answer key, rewrites it from the claims it got wrong, and tests the result on claims it never practised on. The product only switches to the new strategy if it does at least as well there."
      >
        <ol className="flex flex-wrap items-center gap-y-2 font-mono text-[0.82rem] text-graphite">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center">
              <span className="rounded-lg border border-rule bg-surface px-3 py-1.5 text-ink">{s}</span>
              {i < STEPS.length - 1 && <span className="px-2 text-faint" aria-hidden>{"->"}</span>}
            </li>
          ))}
        </ol>
      </PageHeader>

      <section className="flex flex-wrap items-center gap-5">
        <button
          onClick={run}
          disabled={running}
          className="rounded-lg bg-ink px-5 py-2.5 text-[0.95rem] font-medium text-paper transition-colors hover:bg-cobalt disabled:opacity-50"
        >
          {running ? "Running the loop" : "Run the loop"}
        </button>
        <p className="font-mono text-[0.8rem] text-graphite">
          {result ? `Last run ${new Date(result.at).toLocaleString()}` : running ? "Live checks through Telem and Tavily. A few minutes." : "No saved run yet."}
        </p>
      </section>

      {err && <p className="rounded-lg border border-rust bg-surface px-4 py-3 text-[0.95rem] text-rust">{err}</p>}

      {result && t && (
        <section className="border-b border-rule pb-10">
          <p className="font-mono text-[0.8rem] text-graphite">On {nTest} claims it never practised on</p>
          <h2 className="serif mt-2 max-w-[52rem] text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.02em] text-ink">
            {!changed
              ? `${right(t.rows_baseline)} of ${nTest} right. No rewrite beat the starting strategy in practice; kept the original.`
              : better
                ? `${right(t.rows_winner)} of ${nTest} right, up from ${right(t.rows_baseline)} of ${nTest}.`
                : right(t.rows_winner) === right(t.rows_baseline)
                  ? `${right(t.rows_winner)} of ${nTest} right, the same as the starting strategy.`
                  : `${right(t.rows_winner)} of ${nTest} right, down from ${right(t.rows_baseline)} of ${nTest}. No better than the starting strategy; kept the original.`}
          </h2>
          <p className="mt-4 text-[1.05rem] text-graphite">
            {result.adopted
              ? "Live Room and the claim checker are now using the new strategy."
              : "The product is still using the starting strategy."}
          </p>
        </section>
      )}

      {result && (
        <section className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div>
            <h3 className="serif text-[1.5rem] font-semibold text-ink">Practice score per round</h3>
            <Chart result={result} />
          </div>
          <div className="space-y-5">
            <h3 className="serif text-[1.5rem] font-semibold text-ink">The strategy</h3>
            <Strategy label="Before" text={result.default_strategy} />
            <Strategy label={changed ? (result.adopted ? "After (in use)" : "After (not adopted)") : "After (unchanged)"} text={result.winner_strategy} />
          </div>
        </section>
      )}

      {proposed.some((p) => p.rejected) && (
        <section className="space-y-2">
          {proposed.filter((p) => p.rejected).map((p) => (
            <p key={p.n} className="font-mono text-[0.8rem] text-rust">Rewrite {p.n} rejected: {p.rejected}.</p>
          ))}
        </section>
      )}

      {groups.length > 0 && (
        <section className="space-y-8">
          <h3 className="serif text-[1.5rem] font-semibold text-ink">Every claim, every round</h3>
          {groups.map((g) => (
            <div key={g.key}>
              <div className="flex items-baseline justify-between border-b border-rule pb-2">
                <p className="text-[1rem] font-medium text-ink">{g.title}</p>
                <p className="font-mono text-[0.85rem] text-graphite">{right(g.rows)} of {g.rows.length} right</p>
              </div>
              <ul>
                {g.rows.map((r, i) => (
                  <li key={i} className="grid grid-cols-[4.5rem_minmax(0,1fr)_7rem] items-baseline gap-4 border-b border-rule py-2.5">
                    <span className={`font-mono text-[0.8rem] ${r.correct ? "text-pursue" : "text-rust"}`}>{r.correct ? "right" : "wrong"}</span>
                    <span>
                      <span className="text-[0.98rem] text-ink">{r.claim}</span>
                      <span className="mt-0.5 block text-[0.85rem] leading-snug text-graphite">{r.note}</span>
                    </span>
                    <span className="text-right font-mono text-[0.78rem] text-graphite">
                      {r.verdict}
                      <span className="block text-faint">key: {r.key ? "true" : "false"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Strategy({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-rule bg-surface p-4">
      <p className="font-mono text-[0.78rem] text-graphite">{label}</p>
      <p className="mt-2 text-[0.98rem] leading-relaxed text-ink">{text}</p>
    </div>
  );
}

// Train accuracy per iteration; the dashed line is the starting strategy's score.
function Chart({ result }: { result: ImproveResult }) {
  const its = result.iterations;
  const W = 420, H = 220, L = 44, R = 16, T = 16, B = 34;
  const x = (i: number) => (its.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (its.length - 1));
  const y = (a: number) => T + (1 - a) * (H - T - B);
  const base = its[0].train_accuracy;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label="Practice accuracy per round">
      {[0, 0.5, 1].map((a) => (
        <g key={a}>
          <line x1={L} x2={W - R} y1={y(a)} y2={y(a)} className="stroke-rule" strokeWidth={1} />
          <text x={L - 8} y={y(a) + 4} textAnchor="end" className="fill-graphite font-mono text-[11px]">{a * 100}%</text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={y(base)} y2={y(base)} className="stroke-graphite" strokeWidth={1} strokeDasharray="4 4" />
      <polyline fill="none" className="stroke-cobalt" strokeWidth={2} points={its.map((it, i) => `${x(i)},${y(it.train_accuracy)}`).join(" ")} />
      {its.map((it, i) => (
        <g key={it.n}>
          <circle cx={x(i)} cy={y(it.train_accuracy)} r={4} className="fill-cobalt" />
          <text x={x(i)} y={y(it.train_accuracy) - 9} textAnchor="middle" className="fill-ink font-mono text-[11px]">
            {right(it.rows)}/{it.rows.length}
          </text>
          <text x={x(i)} y={H - 12} textAnchor="middle" className="fill-graphite font-mono text-[11px]">
            {it.n === 0 ? "start" : `rewrite ${it.n}`}
          </text>
        </g>
      ))}
    </svg>
  );
}
