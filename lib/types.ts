// The contract. Only Rishith edits this file; post [CONTRACT] in chat on every change.

export type Engine = {
  name: string; latency_ms: number; n_results: number; error?: string;
  warnings?: string[];   // Telem run warning codes, e.g. "routing_unavailable", "count_clamped" (capability_gap left out)
};

export type Source = {
  id: string;            // "s1", "s2"...
  url: string;
  title: string;
  engine: string;        // "exa", "brave", "tavily"... (Telem preprocessor_name, or "tavily")
  snippet: string;
  published?: string;    // ISO date if known
};

export type Line = { text: string; source_ids: string[] };   // every memo line cites sources

export type Memo = {
  id: string;
  company: string;
  verdict: "pursue" | "pass" | "dig_deeper";
  confidence: number;    // 0..1
  summary: string;       // 2-3 sentences
  facts: Line[];
  risks: Line[];
  open_questions: string[];
  sources: Source[];
  trail_id: string;
  created_at: string;
};

export type ClaimCheck = {
  id: string;
  claim: string;         // the sentence as spoken
  verdict: "supported" | "contradicted" | "unclear";   // green / red / amber
  note: string;          // one line, e.g. "3 funded competitors found"
  sources: Source[];
  trail_id: string;
};

export type TrailStep = {
  kind: "search" | "fetch" | "extract" | "llm";
  label: string;         // "Search: Acme competitors"
  query?: string;
  engines?: Engine[];    // which engines answered, how fast
  routing?: string[];    // search steps: the engines Telem's router chose for this query (may be absent)
  published_after?: string; // search steps: Telem kept only results published on or after this date (recency filter)
  urls?: string[];
  telem_session_id?: string;
  at: string;            // ISO time
  ms: number;
};

export type Trail = { id: string; steps: TrailStep[] };

export type WatchUpdate = { at: string; title: string; url: string; summary: string };
export type Watch = { id: string; company: string; monitor_id: string; updates: WatchUpdate[] };

// Streaming memo (POST /api/memo with { stream: true }): NDJSON, one MemoEvent per line, in this order:
// start, then a step for every trail step as it happens, then memo (or error).
export type MemoEvent =
  | { type: "start"; trail_id: string; company: string; depth: "quick" | "deep" }
  | { type: "step"; step: TrailStep }
  | { type: "memo"; memo: Memo }
  | { type: "error"; error: string };

// GET /api/memos: recent memos, newest first.
export type MemoSummary = Pick<Memo, "id" | "company" | "verdict" | "confidence" | "summary" | "created_at"> & {
  n_sources: number;
};

export type TrailRecorder = {
  id: string;
  step: (s: Omit<TrailStep, "at"> & { at?: string }) => void;
};
