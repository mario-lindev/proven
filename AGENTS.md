# AGENTS.md: how we build Proven today

Read this first, every time. This file is for people (Rishith, Aarav, Mario) and for every coding agent (Claude Code, Codex, Cursor) working in this repo. If something here is wrong, fix it here first and tell the team.

**Event:** SearchHack, Sat Nov 14, 2026, Sunnyvale. **Devpost deadline 4:15 PM.** Finalists demo 3 minutes, then judges ask questions.

---

## 1. What we are building (one paragraph)

Proven tells investors and companies whether a startup, vendor or market is worth pursuing, and shows the evidence behind every conclusion. Type a company name and get a one-page memo (pursue / pass / dig deeper) with fresh facts, risks and open questions, where every line links to its source. Click any line to see the research trail: which searches ran, which engines answered, which page it came from. **Live Room** listens to a pitch and checks claims as they are spoken (green / amber / red). **Watch** keeps tracking a company and reports changes.

Sponsors:
- **Tavily** searches the web and extracts page content.
- **Telem** routes each search to the best engines, reaches LinkedIn / TikTok / WeChat, records every step (the trail), and runs the watches (monitors).

## 2. How we're judged (build for this)

| Weight | Criterion | What it means for us |
|---|---|---|
| **40%** | Use of Telem | Query understanding, retrieval, ranking, grounded results, "hard to build without Telem". Every memo line must cite a source; the trail must show Telem's engines. |
| 20% | Startup potential | Clear customer (investors, vendor buyers), urgent problem, a business model. |
| 20% | Innovation | Live claim-checking during a pitch is the new part. |
| 20% | Technical execution | It must work live. Have a recorded backup run. |

Rules: must use **Telem and Tavily**. Teams up to 4.

## 3. Roles

| Person | Owns | Done means |
|---|---|---|
| **Rishith**: lead, AI brain, integration | `lib/brain/`, `lib/types.ts`, `app/api/`, merging to `main`, the pitch | Memo + claim checks come back as valid JSON matching `lib/types.ts`, every line has `source_ids` |
| **Aarav**: search layer | `lib/search/` (Telem, Tavily, trail, monitors), `fixtures/` | `searchAll()`, `extract()`, trail recording and `watch()` work with real keys and return the shapes in §6 |
| **Mario**: product, UI, demo | `app/` pages and `components/`, Live Room mic, the Devpost page, the demo video, slides | The 3-minute demo runs end to end in the browser; Devpost submitted by 4:00 |

Rules for ownership:
- **Only edit files you own.** Need a change in someone else's area? Ask in chat; they make it or say "go ahead".
- `lib/types.ts` is the contract. Only Rishith edits it, and he posts in chat every time he does.
- Agents follow the same rule: tell your agent which folder it owns.

## 4. Communication

- **One group chat** (Discord DM group or iMessage). Every message starts with a tag:
  - `[DONE]` finished something others can use ("[DONE] searchAll works with real keys, pushed")
  - `[BLOCKED]` waiting on someone, name them ("[BLOCKED] @Aarav need trail ids on search results")
  - `[CONTRACT]` change to `lib/types.ts` or an API route
  - `[DEMO]` anything about the pitch or the run order
- **Blocked for more than 10 minutes? Say so.** Don't wait quietly.
- **Check-ins at each checkpoint in §9**, 2 minutes max, at the table: what works, what's next, what's blocking.
- Status board: §11 at the bottom of this file. Update your own line when you push.

## 5. Stack (chosen for speed, one language)

- **Next.js (App Router) + TypeScript**, one repo, one `npm run dev`. API routes in `app/api/*`. Deploy on Vercel.
- **Claude** through `@anthropic-ai/sdk`, model `claude-opus-5-5`. Structured output (`output_config.format` with a JSON schema) so the brain always returns JSON matching `lib/types.ts`. Live checks use `effort: "low"` for speed; the memo uses default effort.
- **Telem** REST: `https://router.telem.ai/v1/search`, `/v1/fetch`, `/v1/monitors` (details in §7).
- **Tavily** REST: `https://api.tavily.com/search`, `/extract`.
- **Live Room speech:** the browser Web Speech API (`webkitSpeechRecognition`) in Chrome. No paid speech service.
- **Storage:** in memory (a `Map` in `lib/store.ts`) for memos and trails. No database today.
- Styling: Tailwind. No component library unless Mario wants one.

### Keys
`.env.local` (never commit it). Copy `.env.example`:
```
TELEM_API_KEY=
TAVILY_API_KEY=
ANTHROPIC_API_KEY=
MOCK=0          # 1 = API routes return fixtures/ (no keys, no cost)
```
Credits: Telem $50 at hack.telem.ai; Tavily 8,000 with code SEARCHHACK.

## 6. The contract (`lib/types.ts`)

Everyone builds against these shapes. With `MOCK=1`, every route returns a fixture with exactly this shape, so UI and backend work in parallel from minute one.

```ts
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
```

### API routes (owned by Rishith, called by Mario's UI)

| Route | Body | Returns | Used by |
|---|---|---|---|
| `POST /api/memo` | `{ company: string, context?: string }` | `Memo` | home page |
| `POST /api/live` | `{ text: string }` (latest ~2 sentences of transcript) | `{ checks: ClaimCheck[] }` (empty if no factual claim) | Live Room |
| `GET /api/trail/[id]` | none | `Trail` | trail drawer |
| `POST /api/watch` | `{ company: string }` | `Watch` | Watch button |
| `GET /api/watch/[id]` | none | `Watch` (with new updates) | watch panel |

Errors: `{ error: string }` with status 4xx/5xx. UI shows the message, never a blank screen.

## 7. Search layer (Aarav): functions the brain calls

`lib/search/index.ts` exports:

```ts
searchAll(queries: string[], trail: TrailRecorder, opts?: { platforms?: boolean }): Promise<Source[]>
extract(urls: string[], trail: TrailRecorder): Promise<{ url: string; text: string }[]>
watch(company: string): Promise<{ monitor_id: string }>
pollWatch(monitor_id: string): Promise<WatchUpdate[]>
newTrail(): TrailRecorder   // .step(TrailStep) and .id; stores in lib/store.ts
```

How `searchAll` works:
1. **One Telem call for all queries** (batch): `user_input` as a list of `{query}`, `search.auto_routing: "accuracy"`, `num_results: 5`, `tier: "default"`. Record one `search` trail step per query with the engines from `preprocessor_runs` (name, `latency_ms`, result count, errors) and `session_id`.
2. **In parallel, one Tavily search** per query (topic news for recent stuff). Engine name `"tavily"`.
3. Merge, dedupe by URL, give ids `s1, s2...`, keep the best 12 to 20.

Verified Telem facts (docs, today):
- Auth: `Authorization: Bearer $TELEM_API_KEY`.
- Response: results are under `preprocessor_runs[].output_payload.results[]` (`rank`, `url`, `title`, `summary`). The engine is `preprocessor_runs[].preprocessor_name`, not a field on each result. Each run has `latency_ms`, `status`, `error`, `batch_index`.
- `routing` is one entry per query when auto-routing is on. Show it in the trail if present.
- `/v1/fetch`: `{ "urls": [...], "options": { "tier": "default" } }`, one document per URL; failed URLs come back as their own rows.
- Monitors: `POST /v1/monitors` `{ "query": "...", "options": { "frequency": "1h" }, "ttl": "30d" }`. **Fastest run is hourly** and there is no "fire now" for polls, so create the demo watch **early (by 1 PM)** so a real update exists by judging. `POST /v1/monitors/{id}/poll` returns results new since the last poll.
- Hard-to-reach platforms (LinkedIn, TikTok, WeChat...): list in docs.telem.ai/resources/supported-platforms. Use them for the competitor and hiring queries. That is our "hard to build without Telem" proof.

Tavily (check docs.tavily.com if anything fails): `POST https://api.tavily.com/search` `{ query, max_results, topic }`, `POST https://api.tavily.com/extract` `{ urls }`, key as `Authorization: Bearer`.

Use `extract()` (Tavily extract, Telem fetch as fallback) only on the top 3 to 5 pages; it is the slow part.

## 8. Brain (Rishith)

`lib/brain/`:
- `memo.ts` `buildMemo(company, context?)`:
  1. Claude plans 6 to 10 queries: funding, competitors (incl. stealth / overseas), hiring (LinkedIn), customer sentiment (Reddit / TikTok), lawsuits / layoffs, recent news, pricing.
  2. `searchAll(queries)`, then `extract(top 5)`.
  3. Claude writes the `Memo` from sources only. **Rule in the prompt: every fact and risk must cite `source_ids`; no source, drop the line.**
  4. Code check after: remove any line whose `source_ids` don't exist.
- `live.ts` `checkText(text)`: Claude (effort low) pulls checkable factual claims ("we have no competitors", "market is $40B", "grew 3x"). For each: 2 to 3 queries, `searchAll`, Claude judges `supported / contradicted / unclear` with sources. Target **under 6 s** per claim. Skip opinions.
- Every LLM call adds an `llm` trail step.

## 9. Timeline and checkpoints

| Time | Rishith | Aarav | Mario | Checkpoint |
|---|---|---|---|---|
| 11:00 to 11:30 | Repo scaffold (Next.js, `types.ts`, `MOCK` routes, fixtures) and push | Get keys working: one raw Telem call + one Tavily call from a script | UI skeleton on mock data: company box → memo page | **11:30**: scaffold on `main`, everyone running `npm run dev` |
| 11:30 to 1:00 | `buildMemo` with real search | `searchAll` + trail recording; **create the demo Watch** | Memo page: verdict, facts, risks, sources, click → trail drawer | **1:00**: a real memo for one company end to end |
| 1:00 to 1:30 | lunch, test 3 companies | lunch | lunch, pick demo companies with Rishith | |
| 1:30 to 2:30 | `checkText` (Live Room backend) | `extract`, `watch` / `pollWatch`, platform queries | Live Room page: mic → transcript → `/api/live` every few seconds → colored claims | **2:30**: Live Room catches "we have no competitors" |
| 2:30 to 3:15 | Speed + accuracy fixes, cache demo runs | Trail shows engines, latency, Telem session; error handling | Watch panel, polish, loading states | **3:15**: feature freeze. Only bug fixes after this |
| 3:15 to 3:45 | Rehearse pitch twice | Record backup video of a full run | Devpost draft, slides, screenshots | |
| 3:45 to 4:00 | Final merge, deploy | Check deploy works | **Submit Devpost** | **4:00**: submitted (deadline 4:15) |
| 4:15 on | Demo prep | | | Keep slides ready for the finals |

If a checkpoint slips by more than 15 minutes, cut scope (§12), don't push the deadline.

## 10. Git workflow (clean and fast)

- `main` must always run. Anything on `main` works with `MOCK=1`.
- Work on your own branch: `rishith/...`, `aarav/...`, `mario/...`.
- Merge small and often (every 30 to 45 min): `git pull --rebase origin main`, run it, then push and merge (PR or fast-forward). Post `[DONE]` in chat.
- Never force-push `main`. Never commit `.env.local` or keys.
- Commit messages: short, present tense ("Add Telem batch search").
- Conflicts in a file you don't own: stop and ask the owner.

### For coding agents
- Read this file first. Stay inside the folder your human owns.
- Don't change `lib/types.ts` or API route shapes; ask the human to raise a `[CONTRACT]`.
- Don't add new dependencies without saying so in chat.
- Run `npm run build` before pushing.
- Never invent sources or results. If a call fails, return the error.

## 11. Status board (update your line when you push)

| Who | Now working on | Last pushed | Blocked on |
|---|---|---|---|
| Rishith | | | |
| Aarav | | | |
| Mario | | | |

## 12. Cut list (if behind, cut from the bottom up)

Must have: memo with sources → trail drawer → Live Room for one claim type.
Nice to have, cut first: Watch panel (show the Telem console instead), Tavily extract (use search summaries), deploy to Vercel (run locally), styling polish.

## 13. The demo (3 minutes, Mario runs the laptop, Rishith talks)

1. **Problem (20 s):** "Investors hear dozens of pitches a week and check the claims by hand, days later."
2. **Live Room (60 s):** pitch Proven while Live Room listens. Say "we have no competitors". It turns red and lists real competitors with sources.
3. **Memo (50 s):** a judge names a company. The memo builds: verdict, risks, sources.
4. **Trail (30 s):** click a risk: the searches, which engines answered (Telem), the page. "Every line is provable. That's the name."
5. **Watch + business (20 s):** show a real update from the watch set at 1 PM. Who pays: per seat for funds, per report for companies.

Backup: the recorded run from 3:15 to 3:45, plus cached results for 3 companies.

## 14. Prep the demo companies

Pick 3 public companies or well-known startups where Proven finds something real (a competitor, a lawsuit, a layoff). Run them before judging so results are cached. Stick to companies and public information, never private individuals.
