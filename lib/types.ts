// The contract. Only Rishith edits this file; post [CONTRACT] in chat on every change.

export type Engine = { name: string; latency_ms: number; n_results: number; error?: string };

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
  urls?: string[];
  telem_session_id?: string;
  at: string;            // ISO time
  ms: number;
};

export type Trail = { id: string; steps: TrailStep[] };

export type WatchUpdate = { at: string; title: string; url: string; summary: string };
export type Watch = { id: string; company: string; monitor_id: string; updates: WatchUpdate[] };

export type TrailRecorder = {
  id: string;
  step: (s: Omit<TrailStep, "at"> & { at?: string }) => void;
};
