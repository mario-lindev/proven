# Devpost submission: Proven

Paste each section into the matching Devpost field. The Telem section comes first on purpose: it is 40% of the score.

Before you submit, search the page for `[` and replace or delete every `[FILL: ...]`, `[DECIDE: ...]` and `[LINK: ...]`. Every number here comes from a real run today (`docs/QA_REPORT.md`) or from the code.

---

## Project name

Proven

## Tagline (under 200 characters)

Paste a startup's URL. Proven checks every claim it makes against independent sources, shows the exact quote, and learns which of Telem's engines hold up. It only learns from what it can prove.

## Links

- Live app: https://proven-tan.vercel.app
- Repo: https://github.com/mario-lindev/proven
- Demo video: [LINK: demo video URL]

---

## How we use Telem

Telem is the retrieval core of Proven. Every memo, every audit and every live claim check runs through it. The code is in `lib/search/telem.ts` and `lib/search/index.ts`.

- **Routing per query, shown to the user.** Every search sets `auto_routing: "accuracy"`. Telem returns a topic and an ordered engine list for each query. Proven records both on the query's trail step. The research feed and the trail drawer show the **Telem topic** and the engines **Telem routed to**, next to every engine that answered and how fast. Across our memos today the router used seven topics: financial filings, finance and markets, companies, people profiles, general, news and academic papers. A funding query and a hiring query go to different engines, and the user can see it.
- **16 engines in one deep memo.** In our Stripe deep memo, 16 of 16 engines answered through Telem across 20 queries in 5 routing topics: exa, tavily, perplexity, brave, parallel, ceramic, seltz, you and linkup, plus seven platform engines. That was 5 Telem search calls and 96 to 111 engine runs per deep memo. We hold one API key for all of it.
- **Platform engines.** Telem's platform engines are pin-only: the router never picks them by default. For memo queries about hiring, customers, reviews or social signals (up to 4 per round), Proven sends a separate batch pinned to LinkedIn (`apify_linkedin`), X (`socialdatax_x`), Reddit (`fetchlayer_reddit`), YouTube (`socialdatax_youtube`), Trustpilot (`fetchlayer_trustpilot`), Product Hunt (`fetchlayer_producthunt`) and WeChat (`socialdatax_wechat`), with auto-routing on so Telem picks the best of those for each query. In the Stripe memo, the merchant-trust risk cites a LinkedIn post that `apify_linkedin` found, next to a Trustpilot rating. We tested TikTok and Quora and dropped them: TikTok hung for about 45 s and Quora returned nothing.
- **Consensus merge.** Telem's `rank` is per engine and results are not merged for us. Per query, Proven merges by URL and orders pages the way Telem's docs do: pages that more engines found come first, then the best rank any engine gave, then the router's engine order. Each page is credited to the best-routed engine that found it. That engine name is on the source chip.
- **Date-filtered news.** Queries that ask for news, latest or recent go in their own batch with `published_after` set to 365 days ago. We request `publish_date` in `fields`, so dated sources show their date at the base price.
- **Batches and sessions.** Each round is one Telem call per batch (`user_input` as a list). Each engine run carries `batch_index`, so every run maps back to its query. Later searches and fetches send the first `session_id`, so follow-up rounds and page fetches sit in one session in the Telem console. Round one's news and platform batches start in parallel and open their own session, so a memo's trail shows two session ids.
- **Fetch fallback.** Proven reads full pages with Tavily extract. Any page Tavily misses goes to Telem `/v1/fetch` (5 URLs per call) in the same session. If both fail, the memo uses the search text.
- **Monitor agent.** **Watch this company** creates a Telem monitor with an agent (hourly, 30-day TTL). **Check now** calls `/v1/monitors/{id}/agent/ticks` to run the agent at once, then reads `/agent/changes` from a cursor. In our Stripe test the first update showed after 45 s and the agent returned 14 changes in about 3 minutes, one of them OpenRouter's post that it had joined Stripe that day. We run no crawler and no cron job.
- **Learning on top of Telem's routing.** Telem tells us which engine returned each page. Proven's verify pass tells us which pages held a quote that backs a memo line. After each memo Proven counts, per engine: results returned, results a memo cited, and results that backed a verified line. The board is at `/engines` (**What Proven learned**). Before the next memo reads any page, the candidates are ordered by Telem's consensus first, and the learned score moves a page at most 3 places up or down. Telem picks the engines for each question; Proven learns which engines' answers hold up.
- **Errors stay visible.** Each engine run's status, error and warnings go on the trail. When X, YouTube or WeChat returned a rate-limit error, the other engines still answered and the trail shows the error. If Telem refuses a request body (400 or 422), Proven retries once with the plain body from the docs.

Why this is hard without Telem: we would need accounts and code for 16 engines, our own choice of engine per query, access to LinkedIn, X, Reddit, YouTube, Trustpilot, Product Hunt and WeChat, per-engine latency and error tracking, and a scheduler with change detection for Watch. Telem's per-engine output is also what makes the trail and the learning board possible: we can only score an engine because Telem tells us which engine found each page.

## How we use Tavily

- **Search.** Every query also goes to Tavily directly, one call per query, in parallel with the Telem batches. Funding, layoff, lawsuit and news queries use Tavily's news topic. It shows as "Tavily search" in the feed, the trail and the learning board, apart from the engines routed by Telem.
- **Extract.** Tavily extract reads the full text of the top pages (4 for a quick memo, 8 for a deep one) before Claude writes, and up to 16 more for the verify pass. The verify pass checks quotes against this text.
- **A second path.** If every Telem call fails, a memo still runs on Tavily results and the trail shows the Telem error.

## Inspiration

A founder's site says "50,000 customers" and "the only platform that does this". An investor checks that by hand, days after the meeting, or nobody does. Companies have the same problem with vendors.

A chat answer is fast, but an investor cannot take it to a partner meeting without knowing where each sentence came from. We wanted a tool where every line can be proven and you can see the search that found it. That is the name.

## What it does

- **Pitch Audit** (`/audit`). Paste a startup's website address or its pitch text and press **Audit the claims**. Proven pulls out up to 8 factual claims the company makes about itself and checks each one against sources the company does not control. Each claim becomes a card: **Holds up**, **Contradicted** or **Unclear**, with a quote that our code found word for word in an independent source, and a trust score out of 100. The company's own site and press-release wires do not count as evidence. Real runs today: ramp.com, 8 claims in 23.8 s, 5 hold up, 3 unclear, trust score 81. rippling.com, 8 claims in 23 s, 3 hold up, 2 contradicted, 3 unclear, trust score 56.
- **Memo.** Type a company, pick **Quick** or **Deep**, press **Research**. You get a verdict (pursue, dig deeper or pass), a confidence score, a summary, Facts, Risks and "Ask the founder" questions. Every fact and risk has numbered source chips.
- **Verify every line.** After the memo is written, each fact and risk is re-read against the text of the sources it cites. Claude must return the exact quote. Code then checks that the quote is in that source's text. A line with no quote found is dropped. Hover a line to see its quote.
- **Research until proven** (Deep). After each search round, Proven lists the six questions an investor must have answered (traction, funding, competitors, team, risks, customers), marks each one answered with a source or open, and searches again only for the open ones. It stops when coverage reaches 85%, when nothing is open, or after 3 extra rounds. The memo shows each round's coverage and what was still open.
- **Claims vs. reality.** The memo sets what the company says about itself against what independent sources say, with a severity. Our Builder.ai deep memo found two: the company told lenders it had $220m in 2024 sales, and an audit found about $55m; it sold its "Natasha" assistant as AI, and sources say about 700 human engineers did the work. That memo took 101.8 s and kept 17 of 17 lines after the verify pass.
- **Trail.** Press **How Proven reached this**, or click any line or chip. A drawer lists every step: the plan, each search with its Telem topic, the engines Telem routed to, who answered and how fast, the pages read, the verify step and the learn step.
- **What Proven learned** (`/engines`). A leaderboard of engines scored by how often their pages backed a verified line. The score is used to order the pages Proven reads in the next memo.
- **Live Room** (`/live`). Press **Start listening** and pitch. Chrome transcribes. Each checkable claim becomes a card: **Checks out**, **Contradicted** or **Unclear**, with sources. "Investors spend hours checking pitch claims by hand. And the best part: we have no competitors." came back Contradicted in 6.7 s with five named competitors.
- **Chrome extension.** The same claim checks in a side panel on a Google Meet or Zoom web call, read from the call's captions. No audio is sent to Proven. [DECIDE: keep this bullet only if it was tested on a real Meet call today]
- **Watch.** A Telem monitor agent per company; **Check now** runs it on demand.

## How we built it

**Stack.** Next.js (App Router) and TypeScript in one repo, Tailwind for styling. Claude Opus 5.5 through the Anthropic SDK with JSON schema output, so every call returns the exact shape in `lib/types.ts`. One helper (`askJSON`) makes every Claude call and records it as a trail step. Memos, trails and the engine board are saved as JSON files.

**Memo pipeline** (`lib/brain/memo.ts`):
1. **Plan.** Claude writes 6 to 8 queries (quick) or 10 to 14 (deep): traction, funding, competitors, hiring, customer sentiment, lawsuits, layoffs, security incidents, news. Deep adds team, pricing, market size, key customers and regulatory risk.
2. **Search.** `searchAll` sends the queries to Telem (general, news and platform batches) and Tavily at the same time.
3. **Research until proven** (deep, `lib/brain/loop.ts`). Coverage is judged after each round and new queries are written for the open questions only. A question counts as answered only if the source it cites exists. The loop also marks which sources are the company's own.
4. **Rank with what was learned** (`lib/learn.ts`). Consensus order first; the learned engine score moves a page at most 3 places.
5. **Read pages.** Tavily extract, with Telem fetch for pages it misses.
6. **Write.** Claude writes from those sources only. Each source is tagged as the company's own or independent. The prompt says to cite every line, to leave out what it cannot cite, and to list a contradiction only when the sources clearly show one.
7. **Check in code.** Citations to ids that do not exist are removed. Lines with no citation are dropped. A contradiction must cite an independent source on the reality side.
8. **Verify** (`lib/brain/verify.ts`). Lines go to Claude in batches of 4 with the text of their cited sources. Claude returns a quote per source. Code compares the quote with the source text (ignoring case, spacing and quote marks) and rejects quotes shorter than 12 characters. A line with no quote found is dropped.
9. **Learn.** Per engine, results returned, cited and backed by a quote are added to the board. A full quote counts 1 and a partial quote 0.5.

**Pitch Audit** (`lib/brain/audit.ts`). The site is read live. Claude picks up to 8 checkable claims and writes queries for each. Four claims are checked at a time. For each, independent sources are put ahead of the company's own, Claude judges the claim, and a quote is shown only if code finds it in an independent source's text. A failed check comes back Unclear with the error in its note. The trust score is the share of claims that hold up, with an unclear claim counted as half.

**Live Room** (`lib/brain/live.ts`). Each time a sentence ends, the page sends the last two sentences. Claude picks at most 2 checkable claims, Proven searches, and Claude judges each one against the sources. Opinions are skipped. The same claim is not checked twice within 90 seconds.

**Streaming.** Memos and audits stream as NDJSON, one event per step or claim, which is what makes the cards fill in live.

## Challenges we ran into

- **"Cite your sources" is not enough.** Models sometimes cite ids that do not exist, or cite a real page that does not say the thing. We added two code checks: one for the ids, one for the quote.
- **A company's own words look like evidence.** Search returns the company's site and its press releases first. Pitch Audit and Claims vs. reality both needed a rule for what counts as independent.
- **Engines fail in different ways.** One platform engine took 15.1 s once and held a search round at 15.8 s. X, YouTube and WeChat returned rate-limit errors in 3 of 4 memos run back to back. The trail shows these, and the other engines still answered.
- **Speed in the Live Room.** We measured a median of 8.1 s per check (6.7 to 10.6 s over 9 checks). Our target was under 6 s and we missed it.
- **Monitors take time.** The first Watch update came 45 s after **Check now**, and the agent's batch after about 3 minutes.

## Accomplishments that we're proud of

- Paste a URL and get up to 8 claims checked against independent sources in about 23 s, each with a quote that code found on the page.
- A real memo that set a company's statement to lenders ($220m) against its audit (about $55m), with sources on both sides.
- Every memo line carries a quote from its source, or it is dropped.
- The learning board gives an engine credit only for a page that backed a verified line.
- 16 engines, 20 queries and 5 routing topics in one deep memo, all visible in the trail.
- 10 of 10 live check verdicts in our QA run were defensible.

## What we learned

- Grounding is a pipeline: a prompt rule, a strict schema, a citation check and a quote check.
- A learning loop needs a signal it cannot fake. Ours is a quote that code found in a page.
- Routing matters. Funding news, hiring and customer complaints live in different places, and Telem's router sends them to different engines.
- Showing the search behind a line builds more trust than a link alone.

## What's next for Proven

- **Stricter proof.** A kept line can rest on a partial quote today. Next: show full and partial separately, and check the summary too.
- **Measure accuracy.** A test set of claims with known answers, and a published score.
- **Faster live checks**, under the 6 s target.
- **Per-topic learning.** Score engines per Telem topic, so the board says which engine holds up for funding and which for hiring.
- **Pilots** with seed funds, accelerators and one procurement team.

## Built with

nextjs, typescript, react, tailwindcss, anthropic, claude, telem, tavily, web-speech-api, chrome-extension, vercel

## How Proven fits the SearchHack brief

- **Routing queries to the right engine:** Telem routes every query; Proven adds an extra search on the engines whose pages held up in past memos.
- **Agents that plan, search, verify and synthesize:** plan, search in rounds until the key questions are answered, read pages, write, then check every line's quote in code.
- **Retrieval beyond keyword matching:** pages found by several engines rank higher; LinkedIn, X, Reddit and review sites are searched; news is limited to the past year.
- **Memory:** Proven remembers which engines and which query phrasings led to verified lines and reuses them on the next memo.
- **Fewer wasted searches:** it measures verified lines per search and reads pages from better-scoring engines first.
- **New interfaces:** a live research feed, the quote behind each line on hover, Claims vs. reality, Pitch Audit, and a Chrome side panel that checks claims during a call.

Not built: knowledge graphs, and search over images, video or code.
