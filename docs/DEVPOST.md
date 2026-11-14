# Devpost submission: Proven

Paste each section into the matching Devpost field.

Before you paste:
- Replace every `[MEASURE: ...]` with a number from a real run today, or delete the sentence. Do not guess.
- Replace every `[VERIFY: ...]` after checking it on `main` with real keys. If it does not work, delete the sentence.
- Replace every `[LINK: ...]`.
- Search the page for `[` before you submit.

---

## Project name

Proven

## Tagline (under 200 characters)

Diligence where every line has a source. Telem routes each search to the right engines; Proven writes the memo, checks pitch claims live and shows the trail behind each line.

## Links

- Repo: https://github.com/mario-lindev/proven
- Live app: [LINK: deployed URL, or delete if we run locally]
- Demo video: [LINK: backup video URL]

---

## Inspiration

Investors hear many pitches a week. Founders say "we have no competitors", "the market is $40B" or "we grew 3x". Someone checks those claims by hand, days after the meeting, or nobody checks them.

Companies have the same problem with vendors. Is the vendor funded? Being sued? Laying people off?

A chat answer is fast, but an investor cannot take it to a partner meeting without knowing where each sentence came from. We wanted a tool where every line can be proven, and where you can see the search that found it. That is the name.

## What it does

Type a company, vendor or market. Pick **Quick** (1 round) or **Deep** (2 rounds). Press **Research**.

- **Live research feed.** While the memo builds, the screen shows each query as it finishes, the engines Telem's router chose for it ("Router chose ..."), every engine that answered with its latency, and the pages found. Deep runs show Round 1 and Round 2 separately. The header counts queries, engines, pages found and elapsed time, and the Telem session id is printed at the bottom.
- **Memo.** A verdict (pursue, dig deeper or pass), a confidence score, a 2 to 3 sentence summary, Facts, Risks and "Ask the founder" questions. Every fact and risk has numbered source chips. Sources are grouped by the engine that found them.
- **Trail.** Click any line, any chip, or **How Proven reached this**. A drawer lists every step: Claude's planning, each search with the engines that answered, latency and result counts, the pages read, and the writing step. When you open it from a chip it jumps to "This search found the cited source".
- **Live Room.** Press **Start listening** and pitch. Chrome transcribes the speech. Proven pulls out checkable claims and checks each one against the web. Each claim becomes a card: **Checks out** (green), **Contradicted** (red) or **Unclear** (amber), with a one-line note, its sources and **See the searches behind this**. You can also type a claim and press **Check**.
- **Chrome extension.** The same claim checks on a Google Meet or Zoom web call, in a side panel, from the call's live captions. No audio is sent to Proven. **Research this company** opens a Deep memo or a Quick one in the web app. [VERIFY: tested on a real Meet call; delete this sentence if not]
- **Watch.** **Watch this company** creates a Telem monitor with an agent. **Check now** runs the agent at once instead of waiting for the hourly schedule, and the panel lists what changed, each with its source link.

Proven does not show a line it cannot cite. If Claude returns a fact or risk whose source ids do not exist, the code removes the line before it reaches the screen.

## How we built it

**Stack.** Next.js (App Router) and TypeScript in one repo, Tailwind for styling. Claude Opus 5.5 through the Anthropic SDK with structured JSON output: every call passes a JSON schema, so the brain always returns the exact shape in `lib/types.ts`. One helper (`askJSON`) makes every Claude call and records it as a trail step. Memos and trails are saved as JSON files, so share links survive a restart. With `MOCK=1`, every API route returns a fixture of the same shape, so the UI, the search layer and the brain were built at the same time.

**Memo pipeline** (`lib/brain/memo.ts`):
1. **Plan.** Claude writes 6 to 8 queries (quick) or 10 to 14 (deep): what the company does, funding, competitors including stealth and overseas ones, hiring, customer sentiment, lawsuits, layoffs, security incidents and recent news. Deep adds team, pricing, market size, key customers and regulatory risk.
2. **Search, round 1.** `searchAll` sends the queries to Telem and Tavily at the same time (details below).
3. **Find the gaps (deep only).** Claude reads what came back and names what an investor still cannot answer: no revenue signal, no competitor named, claims only from the company itself. It writes 4 to 6 follow-up queries, preferring independent sources.
4. **Search, round 2 (deep only).** Same search layer, same Telem session. Up to 30 sources are kept.
5. **Read pages.** Full text of the top 4 (quick) or 8 (deep) pages with Tavily extract. Any URL Tavily misses goes to Telem `/v1/fetch`. If both fail, the memo uses search snippets.
6. **Write.** Claude writes from those sources only. The prompt says to cite source ids on every fact and risk, to leave a line out if it cannot cite it, not to guess numbers, and to say when a fact is only self-reported.
7. **Check in code.** Any citation to an id that does not exist is removed, any line left with no citation is dropped, and only sources that are actually cited are kept.

**Streaming.** `POST /api/memo` with `stream: true` returns NDJSON: a `start` event, one `step` event per trail step as it finishes, then the `memo` (or an `error`). That is what drives the live research feed.

**Live Room** (`lib/brain/live.ts`). Each time Chrome's speech recognition ends a sentence, the page sends the last two sentences to `/api/live`. Claude (low effort, for speed) picks at most 2 checkable claims and writes 2 to 3 queries for each. For "no competitors" it searches for competitors. Proven runs the searches through the same layer, then Claude judges each claim against the sources and cites them. Opinions and plans are skipped. The same claim is not checked twice within 90 seconds, because overlapping transcript windows repeat it.

**Extension** (`extension/`). Plain Manifest V3, no build step. It reads Meet or Zoom web captions by their `aria-label`, waits until a sentence is stable, and sends new sentences to the same `/api/live` route. It suggests the company name from phrases like "CEO of X" and opens `/?company=X&depth=deep&go=1`.

## How we use Telem

Telem is the retrieval core of Proven. All of it is in `lib/search/telem.ts` and `lib/search/index.ts`.

- **Per-query auto-routing, visible live.** Every search sets `auto_routing: "accuracy"`. Telem returns a `routing` entry per query with its providers, best first. We put that on the query's trail step, and the feed shows "Router chose ..." under each query as it finishes. A funding query and a hiring query get different engines, and the user can see that happen.
- **Batch calls.** Each search round is one Telem call per batch, with `user_input` as a list of queries. Each engine run carries `batch_index`, so we map every run back to its query.
- **Multi-engine consensus ranking.** Telem's `rank` is per provider, not a shared score, and results are not merged for us. So per query we merge by URL and order pages the way Telem's docs merge: pages that more engines found come first, then the best rank any engine gave, then the router's provider order. Each page is credited to the best-routed engine that found it, and that engine name is on its source chip.
- **Platform engines.** Telem's platform providers are pin-only: auto-routing never picks them by itself. For memo queries about hiring, customers, reviews or social signals (up to 4 per round), Proven sends a separate batch pinned to `apify_linkedin`, `socialdatax_x`, `fetchlayer_reddit`, `socialdatax_youtube`, `fetchlayer_trustpilot`, `fetchlayer_producthunt` and `socialdatax_wechat`, with auto-routing on so Telem picks the best of those for each query. LinkedIn hiring, Reddit complaints and Trustpilot reviews are where early growth or trouble shows up, and a normal web search API reaches them poorly. In our Stripe deep memo all seven returned results, and the memo's merchant-trust risk cites a LinkedIn post that `apify_linkedin` found. (We dropped TikTok, which hung for 45 s, and Quora, which returned nothing.)
- **Date-filtered news.** Queries that ask for news, latest or recent go in their own batch with `published_after` set to 365 days ago, so old coverage does not crowd out this year's. The date is recorded on the trail step. We request `publish_date` in `fields`, so dated sources show their date at the base price.
- **Telem sessions.** The first search returns a `session_id`, and every later search and fetch in the memo sends it back: round two and the page fetches. The session id is printed in our feed and trail so you can find the memo in the Telem console. Round one's news and platform batches run in parallel with the first call, so today they open their own sessions.
- **Engine-level trail.** Telem returns one run per engine with name, latency, status, error and warnings. Each query's trail step lists every engine that answered, how fast, how many results, and any error or warning such as `routing_unavailable`.
- **Fetch.** `/v1/fetch` (5 URLs per call, split into parallel calls) reads pages Tavily extract could not, in the memo's session.
- **Monitor agents for Watch.** **Watch this company** creates a monitor ("News, funding, layoffs, lawsuits or new competitors for X", hourly, 30-day TTL) with Telem's agent. **Check now** calls `/v1/monitors/{id}/agent/ticks` to run the agent immediately, then reads `/agent/changes` from a cursor, so each update is a new entity or changed fact with its quote and source URL. The legacy `/poll` read runs alongside. We run no crawler and no cron job.
- **Safe fallback.** If Telem refuses the richer request body (400 or 422, which run nothing), we retry once with the plain body from the docs, so the demo still gets results.

Why this is hard without Telem: we would need accounts and code for many search engines, our own per-query engine choice, our own merge across engines, separate access to LinkedIn, X, Reddit and Trustpilot, per-engine latency and error tracking, and a scheduler with change detection for Watch. Telem gives all of that through one API, and its per-engine output is what lets us show a trail for every line.

In one deep memo (Stripe), 16 engines answered through Telem across 20 queries, and Telem's router put the queries in 5 topics (financial filings, finance and markets, companies, people profiles, general).

## How we use Tavily

- **Search.** Every query also goes to Tavily, one call per query, in parallel with the Telem batches. Funding, layoff, lawsuit and news queries use Tavily's news topic. Tavily shows as its own engine in the feed, the trail and the source list.
- **Extract.** Tavily extract reads the full text of the top pages before Claude writes. A snippet is often too short to support a fact; the full page is what the memo is written from.

## Challenges we ran into

- **Grounding.** "Cite your sources" in a prompt is not enough; models sometimes cite ids that do not exist. We added a code check after every memo that removes bad citations, drops uncited lines and keeps only cited sources.
- **Merging engines.** Each engine ranks on its own scale. We had to build a merge that rewards agreement between engines instead of trusting one engine's rank 1.
- **Batch options.** Telem search options apply to the whole batch, so news (date filter) and platform (pinned providers) queries need their own batches. One query can be in two batches; the trail step joins them back together.
- **Speed in the Live Room.** A check has to come back while the speaker is still on the point. We use low effort, at most 2 claims and 3 queries per claim, and send only the last two sentences. We measured about 8 s per check (7 to 11 s over 9 checks), and 1.7 s when there is no factual claim.
- **Monitors run hourly.** The fix was Telem's monitor agent: **Check now** runs it on demand.
- **Three people, one day.** We wrote the data contract first and gave every route a mock mode, so nobody waited on anyone.

## Accomplishments that we're proud of

- Every fact and risk links to a real page, and code enforces it.
- You can watch Telem route each query live, then open the trail for any line and see which engines found it.
- Live Room and the extension check claims during the pitch, not days later. With real keys, "Investors spend hours checking pitch claims by hand. And the best part: we have no competitors." came back Contradicted in 6.7 s, naming five tools that do the same with their pages.
- A deep memo searches twice: the second round goes after what the first could not answer.
- A quick memo took 25 to 26 seconds and a deep memo 54 to 60 seconds in our runs.

## What we learned

- Grounding is a pipeline, not a prompt: a prompt rule, a strict schema and a code check after.
- Showing the search behind a line builds more trust than a link alone.
- Routing matters. Funding news, hiring and customer complaints live in different places, and Telem's router picks different engines for them.
- Agreeing on the data contract in the first 30 minutes saved most of our merge pain.

## What's next for Proven

- **Check that each source says what the line says.** Today code checks that a cited source exists. Next, a second pass checks the line against the source text and flags mismatches.
- **Measure accuracy.** A test set of memos and claims with known answers, and a published score.
- **Keep watches across restarts** and send Watch updates to email and Slack.
- **Exports.** A PDF memo with the trail attached, for investment committee packets.
- **Pilots** with seed funds, accelerators and one procurement team.

## Built with

nextjs, typescript, react, tailwindcss, anthropic, claude, telem, tavily, web-speech-api, chrome-extension
