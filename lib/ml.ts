// A real model on Proven's own outcomes: which search results end up backing a verified memo line.
// One row per (memo, URL a search returned). Label 1 = the URL became a source whose quote verified a kept line.
// Plain logistic regression, gradient descent, no dependencies. Not wired into the memo pipeline.
import "@/lib/seed";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Memo, Trail } from "./types";

const DIR = process.env.VERCEL ? "/tmp/proven" : join(process.cwd(), ".data");

export const FEATURES = [
  "Returned by several searches",
  "Ranked near the top",
  "Found in the first round",
  "Financial-filings search",
  "Company's own site",
  "Social platform",
  "News outlet",
  "Search words in the URL",
] as const;

const SOCIAL = /(^|\.)(linkedin|x|twitter|reddit|youtube|facebook|instagram|tiktok)\.com$/;
const NEWS = /(^|\.)(techcrunch|reuters|bloomberg|cnbc|forbes|wsj|nytimes|ft|theverge|businessinsider|fortune|axios|theinformation|bbc|cnn|apnews|venturebeat|wired|theguardian|finance\.yahoo|prnewswire|businesswire)\.(com|co\.uk)$/;

type Row = { memo: string; url: string; x: number[]; y: number; order: number };
export type MlResult =
  | { ready: false; reason: string }
  | {
      ready: true;
      rows: number;
      positives: number;
      memos: number;
      features: { name: string; weight: number }[];
      holdout: { memos: number; rows: number; positives: number; auc: number; precision_at_10: number; baseline_precision_at_10: number };
    };

function readAll<T>(dir: string): T[] {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".json")).sort().flatMap((f) => {
      try { return [JSON.parse(readFileSync(join(dir, f), "utf8")) as T]; } catch { return []; }
    });
  } catch {
    return [];
  }
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

export function buildDataset(dataDir = DIR): { rows: Row[]; memos: string[] } {
  const trails = new Map(readAll<Trail>(join(dataDir, "trails")).map((t) => [t.id, t]));
  const memos = [...readAll<Memo>(join(dataDir, "memos")), ...readAll<Memo>(join(dataDir, "old_memos"))]
    .filter((m) => m.verification && trails.has(m.trail_id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const rows: Row[] = [];
  const used: string[] = [];
  for (const memo of memos) {
    const urlOf = new Map(memo.sources.map((s) => [s.id, s.url]));
    const verified = new Set<string>();
    for (const line of [...memo.facts, ...memo.risks]) for (const e of line.evidence ?? []) {
      const u = urlOf.get(e.source_id);
      if (u) verified.add(u);
    }
    const company = memo.company.toLowerCase().replace(/[^a-z0-9]/g, "");
    const firstRound = memo.rounds?.length ? new Set(memo.rounds[0].queries) : null;
    type Seen = { queries: Set<string>; rank: number; step: number; first: boolean; financial: boolean; overlap: number };
    const seen = new Map<string, Seen>();
    const searches = trails.get(memo.trail_id)!.steps.filter((s) => s.kind === "search" && s.urls?.length);
    searches.forEach((step, si) => {
      const q = step.query ?? "";
      const qWords = words(q).filter((w) => w !== company);
      step.urls!.forEach((url, i) => {
        const rank = 1 - i / step.urls!.length;
        const path = url.toLowerCase();
        const overlap = qWords.length ? qWords.filter((w) => path.includes(w)).length / qWords.length : 0;
        const s = seen.get(url) ?? { queries: new Set<string>(), rank: 0, step: si, first: false, financial: false, overlap: 0 };
        s.queries.add(q);
        if (rank > s.rank) { s.rank = rank; s.step = Math.min(s.step, si); }
        s.first ||= !firstRound || firstRound.has(q);
        s.financial ||= step.topic === "financial_filings";
        s.overlap = Math.max(s.overlap, overlap);
        seen.set(url, s);
      });
    });
    if (!seen.size) continue;
    used.push(memo.id);
    for (const [url, s] of seen) {
      let host = "";
      try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* not a URL */ }
      rows.push({
        memo: memo.id,
        url,
        y: verified.has(url) ? 1 : 0,
        // Original search order: best rank first, ties by which search ran first.
        order: (1 - s.rank) * 1000 + s.step,
        x: [
          Math.log(s.queries.size),
          s.rank,
          s.first ? 1 : 0,
          s.financial ? 1 : 0,
          company.length > 2 && host.replace(/[^a-z0-9]/g, "").includes(company) ? 1 : 0,
          SOCIAL.test(host) ? 1 : 0,
          NEWS.test(host) ? 1 : 0,
          s.overlap,
        ],
      });
    }
  }
  return { rows, memos: used };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

function auc(scores: number[], labels: number[]) {
  let pairs = 0, wins = 0;
  for (let i = 0; i < scores.length; i++) if (labels[i]) for (let j = 0; j < scores.length; j++) if (!labels[j]) {
    pairs++;
    wins += scores[i] > scores[j] ? 1 : scores[i] === scores[j] ? 0.5 : 0;
  }
  return pairs ? wins / pairs : 0.5;
}

export function train(dataDir = DIR): MlResult {
  const { rows, memos } = buildDataset(dataDir);
  const positives = rows.filter((r) => r.y).length;
  if (memos.length < 4) return { ready: false, reason: `Only ${memos.length} verified memos with a search trail; need at least 4.` };
  if (!positives) return { ready: false, reason: "No search result has backed a verified line yet." };

  // Split by memo, not by row: the newest quarter of memos is held out.
  const nHold = Math.max(1, Math.round(memos.length * 0.25));
  const held = new Set(memos.slice(-nHold));
  const tr = rows.filter((r) => !held.has(r.memo));
  const te = rows.filter((r) => held.has(r.memo));
  const trPos = tr.filter((r) => r.y).length;
  if (!trPos) return { ready: false, reason: "No verified search results in the training memos yet." };

  const k = FEATURES.length;
  const mean = Array.from({ length: k }, (_, j) => tr.reduce((s, r) => s + r.x[j], 0) / tr.length);
  const sd = Array.from({ length: k }, (_, j) => Math.sqrt(tr.reduce((s, r) => s + (r.x[j] - mean[j]) ** 2, 0) / tr.length) || 1);
  const z = (r: Row) => r.x.map((v, j) => (v - mean[j]) / sd[j]);

  const X = tr.map(z);
  const wPos = tr.length / (2 * trPos), wNeg = tr.length / (2 * (tr.length - trPos));   // class weights: positives are rare
  const w = new Array(k).fill(0);
  let b = 0;
  const lr = 0.1, l2 = 0.01;
  for (let step = 0; step < 1500; step++) {
    const g = new Array(k).fill(0);
    let gb = 0;
    for (let i = 0; i < X.length; i++) {
      const p = sigmoid(b + X[i].reduce((s, v, j) => s + v * w[j], 0));
      const d = (p - tr[i].y) * (tr[i].y ? wPos : wNeg);
      for (let j = 0; j < k; j++) g[j] += d * X[i][j];
      gb += d;
    }
    for (let j = 0; j < k; j++) w[j] -= lr * (g[j] / X.length + l2 * w[j]);
    b -= lr * (gb / X.length);
  }

  const score = (r: Row) => sigmoid(b + z(r).reduce((s, v, j) => s + v * w[j], 0));
  // Precision at 10, averaged over held-out memos: how many of the top 10 were verified.
  const hits = (pick: (a: Row, b: Row) => number) => {
    let total = 0;
    for (const id of held) total += te.filter((r) => r.memo === id).sort(pick).slice(0, 10).filter((r) => r.y).length;
    return total / held.size;
  };
  const scores = new Map(te.map((r) => [r, score(r)]));
  return {
    ready: true,
    rows: rows.length,
    positives,
    memos: memos.length,
    features: FEATURES.map((name, j) => ({ name, weight: Number(w[j].toFixed(3)) })),
    holdout: {
      memos: held.size,
      rows: te.length,
      positives: te.filter((r) => r.y).length,
      auc: Number(auc(te.map((r) => scores.get(r)!), te.map((r) => r.y)).toFixed(3)),
      precision_at_10: Number(hits((a, c) => scores.get(c)! - scores.get(a)! || a.order - c.order).toFixed(2)),
      baseline_precision_at_10: Number(hits((a, c) => a.order - c.order).toFixed(2)),
    },
  };
}
