# Devpost submission: Proven

Paste each section into the matching Devpost field.

Before you paste:
- Replace every `[MEASURE: ...]` with a number you measured today, or delete the sentence. Do not guess.
- Replace every `[VERIFY: ...]` after checking it works on `main`. If it does not work, delete the sentence.
- Replace every `[LINK: ...]`.
- Search the page for `[` before you submit.

---

## Project name

Proven

## Tagline (under 200 characters)

Proven checks startups, vendors and markets for investors. Every line of the memo links to its source, and Live Room fact-checks a pitch while it is being spoken.

## Links

- Repo: https://github.com/mario-lindev/proven
- Live app: [LINK: deployed URL, or delete if we run locally]
- Demo video: [LINK: backup video URL]

---

## Inspiration

Investors hear many pitches a week. Founders say things like "we have no competitors", "the market is $40B" or "we grew 3x last quarter". Today someone checks those claims by hand, often days after the meeting, or nobody checks them at all.

Companies have the same problem when they pick a vendor. They need to know if the vendor is real, funded, being sued, or laying people off.

AI chat tools can answer questions, but an investor cannot put an answer in front of a partner meeting without knowing where each sentence came from. We wanted a tool where every line can be proven. That is the name.

## What it does

Proven tells you whether a startup, vendor or market is worth pursuing, and shows the evidence behind every conclusion.

- **Memo.** Type a company name. Proven plans the research, searches the web, reads the top pages and writes a one-page memo: a verdict (pursue, dig deeper or pass), a confidence score, a short summary, facts, risks and open questions to ask. Every fact and every risk has numbered source chips. Hover a chip to see the page title and which search engine found it.
- **Trail.** Click any line to open the research trail. It lists each step: the queries Proven ran, which engines answered each query, how long each engine took, how many results it returned, the pages that were read, and each AI step.
- **Live Room.** Turn on the mic during a pitch. Proven transcribes it in the browser, picks out factual claims that the web can check, and checks each one. Each claim shows up as a card: green (supported), red (contradicted) or amber (unclear), with a one-line note and its sources. "We have no competitors" turns red and lists the competitors it found. There is a text box to type a claim if the mic fails.
- **Chrome extension.** [VERIFY: the extension works on main; delete this bullet if not] The same claim checks on a Google Meet or Zoom call. The extension reads the call's live captions and shows the claim cards in a side panel.
- **Watch.** [VERIFY: Watch works end to end on main] Click Watch on a memo. Proven sets up a Telem monitor for that company and lists new results as they come in, so you hear about a lawsuit or a funding round without searching again.

Proven does not show a line it cannot cite. If the model returns a fact or risk without a valid source id, the code drops the line before it reaches the screen.

## How we built it

- **App:** Next.js (App Router) and TypeScript, one repo. Tailwind for styling. API routes under `app/api/` for memo, live checks, trail and watch.
- **AI:** Claude Opus 5.5 through the Anthropic SDK, with structured JSON output. Every call passes a JSON schema, so the model always returns a memo or a claim check in the exact shape the UI expects. One helper (`askJSON`) makes every call and records it as a step in the trail.
- **Memo pipeline** (`lib/brain/memo.ts`), with two depths:
  1. Claude plans the search queries: 6 to 8 for a quick memo, 10 to 14 for a deep one. They cover what the company does and its traction, funding, direct competitors (including stealth and overseas ones), hiring signals, customer sentiment, lawsuits, layoffs or security incidents, and recent news. Deep adds founders and team, pricing and business model, market size, key customers and regulatory risk.
  2. All queries go to Telem in one batch call and to Tavily in parallel. Results are merged, deduplicated by URL and given ids `s1`, `s2`, and so on.
  3. Deep only: Claude reviews the first round, names what an investor still can't answer (no revenue signal, no competitor named, claims only from the company itself), and writes 4 to 6 follow-up queries. Those run as a second Telem batch plus Tavily. Up to 30 sources are kept.
  4. Proven reads the full text of the top pages (4 for quick, 8 for deep) with Tavily extract, with Telem fetch as a fallback. If extract fails, the memo uses the search snippets.
  5. Claude writes the memo from those sources only. The prompt says every fact and risk must cite source ids, to leave a line out if it cannot, to prefer independent sources, and to say when a fact is only self-reported.
  6. Code then removes any line whose source ids do not exist, and keeps only the sources that are actually cited.
- **Live Room pipeline** (`lib/brain/live.ts`): the browser Web Speech API turns speech into text in Chrome. Each time a sentence ends, the UI sends the last two sentences to `/api/live`. Claude (low effort, for speed) pulls out at most 2 checkable claims and writes 2 to 3 search queries for each. For "no competitors" it searches for competitors. Proven runs the searches, then Claude judges each claim against the sources and cites them. Opinions and plans are skipped.
- **Search layer** (`lib/search/`): Telem router batch search with auto-routing, Telem fetch, Telem monitors, Tavily search and Tavily extract. Each search becomes one trail step with every engine's name, latency, result count, any error, and the Telem session id.
- **Storage:** in memory for the hackathon. No database yet.
- **Mock mode:** with `MOCK=1`, every API route returns a fixture with the same shape. The UI and the backend were built in parallel from the first hour.

## How we use Telem

Telem is the core of Proven's retrieval. It is not a fallback.

- **Batch queries.** A quick memo needs 6 to 8 searches; a deep memo needs 10 to 14, then 4 to 6 follow-ups. Proven sends each round to the Telem router as one `/v1/search` call, with `user_input` as a list of queries. Each engine run carries a `batch_index`, so we know which query it answers.
- **Auto-routing per query.** We turn on `auto_routing: "accuracy"`. Telem picks the engines for each query on its own. A funding query and a "customer complaints on Reddit" query do not need the same engines, and we do not have to write that routing logic ourselves.
- **Engine-level detail in the trail.** Telem returns one run per engine (`preprocessor_runs`) with the engine name, latency, status and error. Proven shows this in the trail for every query: which engines answered, how fast, and how many results each gave. Every source chip also shows the engine that found it. This is what makes the memo auditable, not just cited.
- **Hard-to-reach platforms.** [VERIFY: platform queries run on main; name the platforms that actually returned results] The research plan includes hiring signals (LinkedIn) and customer sentiment (Reddit, TikTok). Telem can reach platforms that a normal web search API covers poorly. Hiring and sentiment are often the earliest signs that a startup is growing or in trouble.
- **Fetch.** Telem `/v1/fetch` is the fallback for reading full pages when Tavily extract fails on a URL.
- **Monitors for Watch.** Watch creates a Telem monitor (`/v1/monitors`) for the company and polls it (`/v1/monitors/{id}/poll`) for results that are new since the last poll. Telem runs the schedule. We do not run our own crawler or cron job.

Why this would be hard without Telem: to get the same result we would need accounts and code for several search engines, our own logic to choose engines per query, our own latency and error tracking per engine, access to platforms like LinkedIn and TikTok, and our own scheduler and change detection for Watch. Telem gives us all of that through one API, and its per-engine output is what lets us show a full trail for every line.

In one demo memo, [MEASURE: number of distinct engines in one memo's trail] engines answered across [MEASURE: number of queries in that memo] queries.

## How we use Tavily

- **Search.** Every query also goes to Tavily search, in parallel with the Telem batch. Tavily results are merged with Telem results and deduplicated by URL. Tavily shows up as its own engine in the trail and on source chips, so the user can see which provider found each page.
- **Extract.** Proven uses Tavily extract to read the full text of the top pages (4 for a quick memo, 8 for a deep one) before Claude writes the memo. A search snippet is often too short to support a fact; the full page is what the memo is written from.

## Challenges we ran into

- **Grounding.** Telling the model "cite your sources" is not enough. Models sometimes cite ids that do not exist. We added a code check after every memo that removes lines with missing citations and drops sources nobody cited.
- **Speed in the Live Room.** A claim check has to come back while the speaker is still on the same point. We use low effort for claim finding and judging, cap it at 2 claims per chunk and 3 queries per claim, and send only the last two sentences. Our target was under 6 seconds per claim; we measured [MEASURE: seconds per live claim check].
- **Two search providers, one shape.** Telem and Tavily return different response shapes. Telem puts the engine name on each engine run, not on each result. We normalized both into one `Source` type and one trail step per query.
- **Monitors run on a schedule.** Telem monitors run at most hourly and a poll only returns what is new. To show a real Watch update at judging, we had to create the demo watch early in the day.
- **Three people, five hours.** We wrote the API contract (`lib/types.ts`) first and gave every route a mock mode, so the UI, the search layer and the AI layer could be built at the same time without waiting on each other.

## Accomplishments that we're proud of

- Every fact and risk in a memo links to a real page, and the code enforces it.
- The trail shows the whole research process, down to which engine answered each query and how long it took.
- Live Room checks claims during a pitch, not days later. [VERIFY: Live Room catches "we have no competitors" with real keys]
- A quick memo takes about [MEASURE: seconds per quick memo] seconds and a deep memo about [MEASURE: seconds per deep memo] seconds. A deep memo cites [MEASURE: average sources cited per deep memo] sources on average.
- A deep memo searches twice: the second round goes after what the first round could not answer.
- In testing we checked [MEASURE: number of live claims checked today] spoken claims.

## What we learned

- Grounding is a pipeline, not a prompt. You need the prompt rule, a strict output schema and a code check after.
- Showing which engine found each result builds more trust than a citation alone. People want to see the search, not just the link.
- Routing queries to different engines matters. Funding news, hiring and customer complaints live in different places on the web.
- Agreeing on the data contract in the first 30 minutes saved us most of our merge pain.

## What's next for Proven

- **Check that each source says what the line says.** Today the code checks that a cited source exists. Next, a second pass checks that the source text actually supports the line, and flags lines where it does not.
- **Measure accuracy.** Build a test set of memos and spoken claims with known answers, and publish the score.
- **Save memos and trails.** Move from memory to a database, so a fund can keep a history per company and share memos with partners.
- **Exports.** A PDF memo with the trail attached, for investment committee packets.
- **Integrations.** Send memos and Watch updates to the tools funds already use, such as their CRM, email and Slack.
- **Pilots.** Run Proven with a few seed funds and accelerators, and with one procurement team checking vendors.

## Built with

nextjs, typescript, react, tailwindcss, anthropic, claude, telem, tavily, web-speech-api, vercel
