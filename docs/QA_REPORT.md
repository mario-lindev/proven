# QA report: real runs, 2026-11-14

QA agent. Every number below comes from real runs against the app on http://localhost:3313 (`main`, `MOCK=0`, real Telem, Tavily and Anthropic keys), 1:20 to 1:30 PM. Raw NDJSON events were saved for each run. Memo runs went one after another. The live checks and the watch ran at the same time as the memos, so their times include that load.

## Memo runs

Times are wall clock from the client. Phases come from the `step` events (receive time; `ms` is the same within 0.4 s).

| Run | Memo id | Total | Plan | Search R1 | Gaps | Search R2 | Extract | Write | Queries | Engines answering (Telem) | Topics | Sources | Facts / risks | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Stripe deep | `memo_djnn6gxn` | **53.5 s** | 4.7 s | 8.9 s | 2.8 s | 5.2 s | 5.0 s (8 pages) | 26.8 s | 20 | 16 of 16 | 5 | 24 | 12 / 8 | dig deeper 0.70 |
| Figma deep | `memo_ht8wcxgq` | **60.2 s** | 3.9 s | 15.8 s | 2.8 s | 4.4 s | 5.0 s (8 pages) | 28.2 s | 20 | 15 of 16 | 6 | 22 | 11 / 7 | dig deeper 0.65 |
| Rivian quick | `memo_5lqu3lmi` | **25.1 s** | 2.8 s | 8.0 s | | | 0.3 s (4 pages) | 14.0 s | 8 | 14 of 16 | 4 | 15 | 8 / 6 | dig deeper 0.60 |
| Duolingo quick | `memo_adns0toc` | **26.1 s** | 2.7 s | 8.2 s | | | 0.9 s (4 pages) | 14.5 s | 8 | 12 of 12 | 6 | 13 | 8 / 6 | dig deeper 0.60 |
| Rivian quick, **with verify + learn** (1:32 PM, after `5c3f0d6`) | `memo_uyjvyk1j` | **39.4 s** | 3.7 s | 5.7 s | | | 9.2 s (4 pages), then 2.9 s (16 pages, overlaps the write) | 14.3 s, then verify 6.6 s | 8 | 15 of 16 | 6 | 12 | 7 / 6 | dig deeper 0.60 |

- **Engines that answered:** exa, tavily (through Telem), perplexity, brave, parallel, ceramic, seltz, you, linkup; platform: apify_linkedin, socialdatax_x, fetchlayer_reddit, socialdatax_youtube, fetchlayer_trustpilot, fetchlayer_producthunt, socialdatax_wechat. Plus our direct Tavily call on every query.
- **Telem routing topics seen:** financial_filings, finance_markets, companies, people_profiles, general, news, academic_papers. Every query got a topic and a provider list.
- **Engine errors** (all `upstream 429, reason: rate_limited`): Stripe socialdatax_wechat, socialdatax_youtube; Rivian socialdatax_x, socialdatax_youtube; Figma socialdatax_x, socialdatax_wechat; Duolingo none. Other engines still answered.
- **Warnings:** `unranked_provider` (all platform engines), `trimmed_results` (ceramic), `dropped_results` (apify_linkedin), `routing_fallback` (socialdatax_youtube).
- **Verify and learn:** the first four memos ran before they were merged and have no `verification`. `GET /api/engines` was 404 at 1:15 PM and an empty board at 1:27 PM. After `5c3f0d6` (1:29 PM) the Rivian rerun had `verification {checked: 13, kept: 13, dropped: 0, ms: 6564}`, a `learn` step "Ranked 20 sources with what Proven learned from 1 memo", and a second `learn` step after the memo. `/api/engines` then showed 6 engines from 2 memos: tavily 0.50, you 0.30, exa 0.25, perplexity 0.21, apify_linkedin 0.12, seltz 0.09.
- **Verify quotes are real.** The 19 quotes on `memo_uyjvyk1j` are checked in code against the source text (`quoteIn` in `lib/brain/verify.ts`), and 13 of them appear word for word in the search snippet. 11 of 19 are labelled `partial`. 5 of the 13 kept lines have only partial quotes. One example: "2,083 R2s registered in California in Q3 2026" is kept on a quote that doesn't contain 2,083 (bug 4).
- **Verify adds about 14 s to a quick memo** (39.4 s against 25.1 s for the same company): 6.6 s for 4 parallel Claude calls, plus a slower extract this time (9.2 s against 0.3 s). Deep memos were not re-run with verify (budget).
- **Writing the memo is half the time** (14 s quick, 27 to 28 s deep). Round one's search takes 8 to 9 s; Figma's took 15.8 s because `fetchlayer_producthunt` took 15.1 s.

### Reading the memos

66 lines (facts and risks) in the 4 memos, checked against the sources they cite:
- 44 lines: every number in the line is in a cited source's title or snippet.
- 21 lines: the numbers are not in any snippet, but at least one cited page was one of the pages read in full (extract), so they can come from that text. We can't see extracted text through the API, so these were not confirmed.
- 1 line: a year that is in no snippet (Duolingo R2, "2025 AI-first shift"; it is correct).

I read all 34 lines of Stripe and Rivian by hand. None contradicts its source. Problems found:
- **Meta text in a fact.** Stripe F11 ends "A LinkedIn profile naming a different CEO is unreliable and was disregarded." That is Claude's process, not a fact.
- **Source ids in the prose.** Duolingo F8: "Note that the s3 and s11 comparisons are published by the competitors Praktika and Babbel themselves." A reader sees "s3" and "s11", not chips.
- **Uncited summary.** The Rivian summary says R1 demand "flattened near a ~$90k price point". No fact, risk or snippet has that number. The summary is not part of the citation check.
- **Weak support.** Figma R7 (growth slowing to about 36%, NDR 139% to 136%) rests on one LinkedIn analyst post (s27). F4 says "not independently verified"; R7 doesn't.
- **Off-topic citation.** Stripe F12 (named competitors) also cites s7, a Reddit thread about frozen funds.
- Stripe F9 ("OpenRouter is now part of Stripe") is not in its snippet, but the Stripe watch found OpenRouter's own post saying so today, so it is right.

## Live checks (`POST /api/live`)

| # | Text sent | Verdict | Note (short) | Latency | Right? |
|---|---|---|---|---|---|
| 1 | We have no competitors. | unclear | "Startup not identified; sources are generic" | 10.6 s | Fair: no product named. **Demo risk** (see bug 2) |
| 2 | Stripe processes over a trillion dollars a year. | supported | $1T+ 2023, $1.4T 2024, $1.9T 2025 | 8.0 s | Yes |
| 3 | Figma was acquired by Adobe. | contradicted | deal terminated Dec 2023, IPO July 2025 | 9.7 s | Yes |
| 4 | Rivian delivered 50,000 vehicles last year. | contradicted | 42,247 in 2025; 51,579 was 2024 | 8.1 s | Yes |
| 5 | Duolingo has more than 100 million monthly active users. | supported | 135.3M Q3 2025, 140.6M Q2 2026 | 8.7 s | Yes |
| 6 | Honestly, I think our team is the most passionate group you'll ever meet. | (no checks) | opinion skipped | 1.7 s | Yes |
| 7 | Our market is worth $40 billion and growing 30% a year. | unclear, unclear (2 claims) | no market named | 9.9 s | Yes |
| 8 | OpenAI was founded in 2015 by Sam Altman and Elon Musk. | supported | Dec 2015, among ~11 co-founders | 6.8 s | Yes |
| 9 | Investors spend hours checking pitch claims by hand. And the best part: we have no competitors. (the demo's exact window) | **contradicted** | TechTruth.ai, StratEngine AI, Startup Due Dil, SeedAngels, askOdin | 6.7 s | Yes |
| 10 | Proven is an AI tool that checks investor pitch claims live during the meeting. We have no competitors. | **contradicted** | TechTruth.ai, Pitch Protocol, Factiverse... | 7.6 s | Yes |

- 9 checks with a claim: median 8.1 s, range 6.7 to 10.6 s. The §8 target of under 6 s is missed. Per check: find claims about 1.7 s, search 2.4 to 4.6 s, judge 2.0 to 2.9 s.
- 10 of 10 verdicts are defensible. Every check used Telem (exa, you, linkup, brave, parallel, ceramic, seltz, perplexity) plus Tavily, with no engine errors.

## Watch (`POST /api/watch {company: "Stripe"}`, then **Check now**)

| Time after create | Event | Updates |
|---|---|---|
| 1.2 s | watch `w_i6cc9g2m` created, monitor `17856f04-1a71-49d0-a61b-646e4b8f646a` | 0 |
| 1.9 s | Check now: 200 in 0.7 s | 0 |
| 23 s | GET | 0 |
| 45 s | GET | 2 (from the legacy `/poll`: Payments Dive Tempo, Mint agentic cards) |
| 130 s | GET | 3 (first agent change: OpenRouter's X post "officially part of @stripe today") |
| 191 s | GET | 16 (13 more agent changes) |
| 191 s | second Check now: 200 in 0.1 s, no 409 | 16 |
| 255 s | GET | 16 |

No API errors. Updates do arrive, but slowly: 45 s to the first one, about 3 minutes to the agent's batch. In the demo's 20 s Watch beat, **Check now** will not bring new items. Updates must already be on screen from prep (DEMO_SCRIPT updated).

## Cost per memo

No per-call prices are written in `docs/` (TELEM_NOTES only says billing is per provider meter and that empty results are not billed). So these are call counts, and the price is unknown.

| | Claude calls | Telem search calls | Telem engine runs (platform) | Tavily search | Tavily extract | Telem fetch |
|---|---|---|---|---|---|---|
| Quick, before verify | 2 | 3 | 41 to 44 (12 to 13) | 8 | 1 call, 4 pages | 0 |
| Quick, with verify (`memo_uyjvyk1j`) | 6 (plan, write, 4 verify batches) | 3 | 46 (14) | 8 | 2 calls, 4 + 16 pages | yes (pages Tavily missed) |
| Deep, before verify | 3 | 5 | 96 to 111 (20 to 24) | 20 | 1 call, 8 pages | yes (pages Tavily missed) |
| Live check, per claim | 2 (find + judge; find is shared) | 1 to 2 | 9 to 21 (0) | 2 to 3 | 0 | 0 |

Claude token usage is not recorded anywhere (`askJSON` drops `res.usage`), so the Claude cost can't be computed from the trail.

## Bugs, ranked

| # | Severity | Bug | Repro | Error / evidence | Suspect file |
|---|---|---|---|---|---|
| 1 | **High (demo)** | Fixture memos show as real history. 4 memos say "Stripe sells warehouse picking robots" and sit under **Recent memos** beside the real Stripe memo. | `GET /api/memos` | `memo_m0czv31o` ("Acme Robotics sells warehouse picking robots..."), `memo_6pwu931r`, `memo_fcyp6prt`, `memo_1vpn6mcw` | `app/api/memo/route.ts` (mock branch calls `saveMemo`); files in `.data/memos/` |
| 2 | **High (demo)** | A typed "We have no competitors" comes back amber, not red. Typed claims are sent alone, with no product named. | `POST /api/live {"text":"We have no competitors."}` | `unclear`: "Startup not identified; sources are generic competitor guides or unrelated companies" | `app/live/page.tsx` (`send(typed)`), `extension/panel.js` (`alone`), `lib/brain/live.ts` |
| 3 | **Medium (pitch)** | The learning board can't tell our direct Tavily calls from Telem's `tavily` provider: both are named `tavily`, and `tavily` leads the board (0.50). On stage, "Proven learns which of Telem's engines hold up" is topped by a non-Telem call. | `GET /api/engines` after `memo_uyjvyk1j` | `{"name":"tavily","memos":2,"returned":15,"cited":13,"supported":11.5,"score":0.5}` | `lib/search/index.ts` (engine name on direct Tavily results), `lib/learn.ts` |
| 4 | Medium | "Kept" counts lines backed only by `partial` quotes, so "13 of 13 verified" overstates. 5 of 13 kept lines on `memo_uyjvyk1j` have only partial quotes; one keeps "2,083 R2s registered" on a quote without that number. | `GET /api/memo/memo_uyjvyk1j` | `verification {checked:13, kept:13, dropped:0}`; 11 of 19 evidence items `"verdict":"partial"` | `lib/brain/verify.ts` (kept = any evidence), UI summary |
| 4b | Medium | Live checks miss the under 6 s target (measured at 1:21 to 1:24 PM, before `5c3f0d6` changed `live.ts`). | 9 checks | 6.7 to 10.6 s, median 8.1 s | `lib/brain/live.ts` (two Claude calls in series), `lib/search/index.ts` |
| 4c | Low | Deep memos warmed before 1:29 PM (`memo_djnn6gxn`, `memo_ht8wcxgq`) have no `verification`, so they won't show quotes or "N of M verified" in the new UI. | `GET /api/memo/memo_djnn6gxn` | no `verification` key | re-run warm-cache after the freeze |
| 5 | Medium | X, YouTube and WeChat get rate-limited when memos run back to back; the trail shows them as errors. | 4 memos in a row | `socialdatax_x: the provider returned an error (upstream 429, reason: rate_limited)` | `lib/search/index.ts` (`PLATFORM_PROVIDERS`); space warm-cache runs |
| 6 | Medium | One slow platform engine stalls round one. | Figma deep | `fetchlayer_producthunt` 15,110 ms; round one 15.8 s (vs about 9 s) | `lib/search/index.ts` / `lib/search/telem.ts` (no per-batch timeout) |
| 7 | Low | Each memo has 2 Telem session ids. Round one's news and platform batches start in parallel before a session exists. README.md still says "one Telem session per memo" (not a QA-owned file; docs/ fixed). | any memo trail | Rivian: `32de551c...` (main) and `f622674c...` (news batch) | `lib/search/index.ts:93-144` |
| 8 | Low | The memo summary is never checked. It can carry uncited numbers. | `memo_5lqu3lmi` | "R1 demand that has flattened near a ~$90k price point": in no line or snippet | `lib/brain/memo.ts` (summary outside the cite check) |
| 9 | Low | Process text and raw source ids in memo lines. | `memo_djnn6gxn` F11, `memo_adns0toc` F8 | "...was disregarded."; "the s3 and s11 comparisons..." | `lib/brain/memo.ts` write prompt |
| 10 | Low | "tavily" appears twice on each query's trail step (Telem's tavily provider and our direct call), so they can't be told apart (same cause as bug 3). | any search step | `['exa','perplexity','tavily','tavily']` | `lib/search/index.ts` |
| 11 | Low | Watch: agent updates have an empty `summary`; the same page shows twice (poll title vs agent title); some items are off topic (Blackstone office lease, sponsored TechCrunch post). | watch `w_i6cc9g2m` | `"summary": ""` on all 14 agent items | `lib/search/telem.ts` (changes to updates, ~line 302), `app/api/watch/[id]/route.ts` (`addUpdates` keys on url + title) |
| 12 | Low | Almost every memo says dig deeper: 11 of 12 in history at 1:35 PM (the one exception, "fyn academy", not a QA run, said pass), confidence 0.60 to 0.70. No memo has said pursue. A judge may ask. | `GET /api/memos` | | `lib/brain/memo.ts` verdict rubric |
| 13 | Low | Prompts have no date. For "last year" the live planner searched "Rivian deliveries 2024 total" (it is 2026). The judge still got 2025 right. | live check 4 | queries in trail `tr_61caqi20` | `lib/brain/live.ts`, `lib/brain/memo.ts` |
| 14 | Low | `POST /api/live` with a non-JSON body returns 500 (the memo route returns 400). | `POST /api/live` body `not json` | `500 {"error":"Unexpected token 'o', \"not json\" is not valid JSON"}` | `app/api/live/route.ts` |
| 15 | Low | The "Find checkable claims" step goes to its own trail, which no claim card links to, so a claim's trail starts at search. | any live check | trails `tr_*` have 3 search + 1 llm (judge) steps only | `lib/brain/live.ts` (`pickTrail`) |

## Recommended fixes (in order)

1. **Remove the fixture memos and stop mock runs from saving.** Delete the four files above from `.data/memos/` (and their trails), and drop `saveMemo` from the mock branch of `app/api/memo/route.ts`. About 5 minutes, and it removes the most visible demo hazard.
2. **Make the typed "no competitors" fallback land red.** Docs now say to type `Proven checks investor pitch claims live during the meeting. We have no competitors.` (Contradicted in 7.6 s). In code, `app/live/page.tsx` could send the last spoken sentence with a typed claim, or `lib/brain/live.ts` could tell the claim finder that an unnamed "we" is the product being pitched.
3. **Rename the direct Tavily engine** (for example `tavily_direct`) in `lib/search/` so the learning board and trail credit Telem's engines separately (bugs 3 and 10). Show "N supported, M partial" instead of "N of N verified" (bug 4). Then re-warm the demo memos so they carry verification.

Next if there's time: give the platform batch a timeout of about 8 s (Product Hunt stalled round one by 7 s), show 429 as "rate limited, skipped" rather than an error, run warm-cache memos a minute apart, and record `res.usage` in `askJSON`'s trail step so cost can be measured.

## Best demo backups

- **`memo_uyjvyk1j` Rivian quick, verified:** the only memo with evidence quotes and a `verification` block (13 checked, 13 kept). Use it to show the hover quote until the deep memos are re-warmed.
- **`memo_djnn6gxn` Stripe deep:** the strongest content (no verification yet). 12 facts, 8 risks, 24 sources: the $159B tender, the alleged August 2026 data breach, privacy class actions, merchant account freezes (a LinkedIn post via `apify_linkedin`, Trustpilot 1.6/5), Bridge and Tempo. 16 engines, 20 queries.
- **`memo_ht8wcxgq` Figma deep:** margin squeeze from AI costs, the Claude Design threat, stock down 52% in H1 2026, short interest before the lock-up expiry.
- **`memo_5lqu3lmi` Rivian quick:** guidance cuts, five layoff rounds, VW now the largest holder, a $250M settlement. Its summary has the uncited "$90k" phrase (bug 8).
- **`memo_adns0toc` Duolingo quick:** a securities class action, the AI-first backlash, subscribers growing at half the rate of DAUs.
- Watch `w_i6cc9g2m` (Stripe) has 16 updates, but it lives only in server memory with no page open, so it can't be shown. Make the demo watch from the memo page during prep.
