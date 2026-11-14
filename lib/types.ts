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
  own?: boolean;         // true: the company's own site or a press release it issued; false/absent: independent
};

// Proof for one memo line: the exact quote in a cited source that backs it (found by the verify pass).
export type Evidence = { source_id: string; quote: string; verdict: "supported" | "partial" };

export type Line = { text: string; source_ids: string[]; evidence?: Evidence[] };   // every memo line cites sources

// Deep mode researches in rounds until the investor-critical questions are answered (lib/brain/loop.ts).
export type Round = {
  round: number;         // 1 = the planned searches, 2+ = follow-up searches aimed at the open questions
  queries: string[];     // searched in this round
  new_sources: number;   // sources this round added
  coverage: number;      // 0..1, how much of what an investor must know is answered with a source after this round
  open: string[];        // key questions still unanswered after this round
};

// Claims vs. reality: something the company says that independent sources contradict or do not support.
export type Contradiction = {
  claim: string;
  claim_source_ids: string[];
  reality: string;
  reality_source_ids: string[];   // at least one independent source
  severity: "high" | "medium" | "low";
};

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
  // Verify pass: every fact and risk re-checked against its sources' text; unsupported lines are dropped.
  verification?: { checked: number; kept: number; dropped: number; ms: number };
  rounds?: Round[];                  // deep mode only
  contradictions?: Contradiction[];  // 0 to 5; kept only when the cited ids exist
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
  kind: "search" | "fetch" | "extract" | "llm" | "verify" | "learn";
  label: string;         // "Search: Acme competitors"
  query?: string;
  engines?: Engine[];    // which engines answered, how fast
  routing?: string[];    // search steps: the engines Telem's router chose for this query (may be absent)
  topic?: string;        // search steps: the topic Telem's router classified the query as (e.g. "people_profiles")
  published_after?: string; // search steps: Telem kept only results published on or after this date (recency filter)
  urls?: string[];
  telem_session_id?: string;
  at: string;            // ISO time
  ms: number;
};

export type Trail = { id: string; steps: TrailStep[] };

export type WatchUpdate = { at: string; title: string; url: string; summary: string };
export type Watch = {
  id: string;
  company: string;
  monitor_id: string;
  updates: WatchUpdate[];
  checked_at?: string;   // last time "Check now" ran the Telem monitor agent
  cursor?: number;       // internal: Telem agent changes cursor
};

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

// What Proven learned: per engine, how often its results end up as verified evidence in memos.
// score = (supported + 1) / (returned + 10), a smoothed "verified yield" used to rank sources before reading.
export type EngineStat = {
  name: string;
  memos: number;      // memos this engine returned results in
  returned: number;   // results it returned that became candidate sources
  cited: number;      // of those, cited by a memo line
  supported: number;  // of those, backed by a verified quote (Evidence verdict "supported")
  score: number;
};
// GET /api/engines
export type EngineBoard = { engines: EngineStat[]; memos: number; updated_at: string };
