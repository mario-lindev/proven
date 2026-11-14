# Proven

Proven checks what a startup says about itself against sources the company does not control, and shows the exact quote behind every line.

Paste a website and get each claim marked Holds up, Contradicted or Unclear. Type a company and get a one-page memo where every fact and risk carries a quote from its source. Proven also checks a founder's claims while they speak, and learns which search engines' pages hold up. It only learns from what it can prove.

Live: https://proven-tan.vercel.app

Built at SearchHack 2026 on Telem and Tavily. Team plan, roles and the API contract: [AGENTS.md](AGENTS.md). Pitch material: [docs/](docs/).

## Features

- **Pitch Audit** (`/audit`). Paste a URL or pitch text. Up to 8 factual claims are pulled out and each is checked against independent sources. A quote is shown only if code finds it word for word in an independent source. Trust score out of 100. Real runs: ramp.com, 8 claims in 23.8 s, 5 hold up, 3 unclear, score 81; rippling.com, 3 hold up, 2 contradicted, 3 unclear, score 56, 23 s.
- **Memo** (`/`). Verdict (pursue, dig deeper, pass), confidence, summary, facts, risks and questions to ask. Quick or Deep.
- **Verify every line.** Each fact and risk is re-read against the text of the sources it cites. Claude returns the exact quote and code checks it is in the source text. Lines with no quote found are dropped. Hover a line to see its quote.
- **Research until proven** (Deep). After each search round Proven scores how many of the investor's key questions are answered with a source, and searches again for the open ones. Up to 3 extra rounds; stops at 85% coverage.
- **Claims vs. reality.** The memo sets the company's own statements against independent sources. A real Builder.ai deep memo (101.8 s, 17 of 17 lines verified) found: $220m of 2024 sales told to lenders against about $55m in an audit, and the "Natasha" AI against about 700 human engineers.
- **Trail.** Click any line or source chip, or **How Proven reached this**, to see each search, its Telem topic, the engines Telem routed it to, who answered and how fast, and the pages read.
- **What Proven learned** (`/engines`). Engines scored by how many of their results backed a verified line. The score is used to order the pages the next memo reads.
- **Live Room** (`/live`). Chrome speech recognition plus claim checks: Checks out, Contradicted or Unclear, with sources. About 8 s per claim.
- **Chrome extension** (`extension/`). The same checks from Meet or Zoom web captions in a side panel. See [extension/README.md](extension/README.md).
- **Watch.** A Telem monitor agent per company. **Check now** runs it on demand and lists changes with sources.

## How Proven uses Telem

- `auto_routing: "accuracy"` on every search. The topic and engine list Telem picks for each query are shown in the feed and the trail.
- 16 engines answered in one deep memo (Stripe, 20 queries, 5 routing topics).
- Hiring, customer and social queries also run on pinned platform engines: LinkedIn, X, Reddit, YouTube, Trustpilot, Product Hunt, WeChat.
- Per query, pages are merged by URL and ordered by how many engines found them, then best rank, then routing order.
- News queries use `published_after` (last 365 days).
- Later searches and fetches reuse the first `session_id`. Round one's parallel batches open their own, so a memo's trail has two session ids.
- `/v1/fetch` for pages Tavily extract misses.
- `/v1/monitors` with the agent (`agent/ticks`, `agent/changes`) for Watch.
- Learning sits on top: Telem says which engine found each page, the verify pass says which pages held a quote, and the board scores engines on that.

Details: [docs/TELEM_NOTES.md](docs/TELEM_NOTES.md). Real timings and call counts: [docs/QA_REPORT.md](docs/QA_REPORT.md).

## Architecture

```
 Browser (Next.js pages)                    Chrome extension (Meet / Zoom captions)
   /            memo + research feed          side panel: claim cards
   /audit       Pitch Audit
   /live        Live Room
   /engines     What Proven learned
   /memo/[id]   shared memo
          |                                             |
          +----------------------+----------------------+
                                 |  HTTP (NDJSON streams for memos and audits, CORS for the extension)
                                 v
                    Next.js API routes (app/api/)
   /api/memo  /api/audit  /api/live  /api/engines  /api/trail/[id]  /api/watch  /api/memos  /api/health
                                 |
                                 v
                 Brain (lib/brain/, Claude Opus 5.5, JSON schema output)
   memo.ts    plan -> search -> rounds (deep) -> rank -> read pages -> write -> drop uncited -> verify -> learn
   loop.ts    research until proven: judge coverage, search the open questions, up to 3 extra rounds
   verify.ts  exact quote per line, checked in code against the source text
   audit.ts   find the company's claims -> search -> judge -> quote from an independent source only
   live.ts    find claims -> search -> judge
                                 |
              +------------------+------------------+
              v                                     v
   Search layer (lib/search/)             Learning (lib/learn.ts)
   Telem: routed batch search,            per engine: returned, cited,
     platform engines, news date          backed a verified line;
     filter, fetch, monitor agents        orders the pages read next
   Tavily: search and extract
              |
              v
   Store (lib/store.ts): memory, plus memos, trails and the engine board as JSON in .data/
```

## Setup

```sh
npm install
cp .env.example .env.local   # add TELEM_API_KEY, TAVILY_API_KEY, ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
npm run dev -- -p 3313       # the port the demo uses
```

Offline, no keys: set `MOCK=1` in `.env.local` (or run `MOCK=1 npm run dev`). API routes then return fixtures from `fixtures/`, and a **Demo data** badge shows next to the logo. Never present mock results as real.

Telem hackathon keys use `https://hack.telem.ai/api`; set `TELEM_BASE_URL` to change it. `TELEM_DILIGENCE=1` turns on extra Telem batches (filings, Reddit, patents); it is off by default and untested against the real API.

Live Room needs real Chrome for the mic. Embedded and IDE browsers can't use it.

## Scripts

Run with `npx tsx`. Scripts that call the real APIs need `--env-file=.env.local`.

| Command | What it does |
|---|---|
| `npx tsx --env-file=.env.local scripts/try-memo.ts "Company" [quick\|deep]` | One real memo with the verify pass, printed line by line with its quotes. `VERIFY_DEBUG=1` also prints quotes that were not found and the dropped lines. |
| `npx tsx --env-file=.env.local scripts/try-audit.ts <url \| "pitch text">` | One real Pitch Audit, printed claim by claim as the checks finish. |
| `npx tsx scripts/check-learn.ts` | Offline checks of the learning board and ranking. Synthetic memos, temp directory, no keys. |
| `npx tsx scripts/check-parse.ts` | Offline tests of the search layer: Telem and Tavily parsing, merge, batches, failures. No keys. |
| `npx tsx --env-file=.env.local scripts/try-search.ts` | Real-key smoke test of the search layer: Telem batches plus Tavily, one extract, prints sources and the trail. |
| `npx tsx --env-file=.env.local scripts/warm-cache.ts deep "Builder.ai" Stripe` | Runs real memos ahead of a demo; they appear under Recent memos. First argument `quick` or `deep`. Space runs a minute apart to avoid platform rate limits. |

## Team

- Rishith: lead, AI brain, integration
- Aarav: search layer (Telem, Tavily)
- Mario: product, UI, Chrome extension, demo

## License

See [LICENSE](LICENSE).
