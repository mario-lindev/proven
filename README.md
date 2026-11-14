# Proven

Proven tells investors and companies whether a startup, vendor or market is worth pursuing, in a one-page memo where every line cites its source.
It also checks a founder's claims while they speak, in the browser or on a Meet or Zoom call, and keeps watching the company afterwards.

[SCREENSHOT: memo page with the trail drawer open]

Built at SearchHack 2026 on Telem and Tavily. Team plan, roles and the API contract: [AGENTS.md](AGENTS.md).

## Features

- **Memo.** Verdict (pursue, dig deeper, pass), confidence, summary, facts, risks and questions to ask. Quick (1 search round) or Deep (2 rounds: the second goes after the gaps). Code drops any line without a valid citation.
- **Live research feed.** Each query as it finishes, the engines Telem's router chose for it, every engine's latency, pages found and the Telem session id.
- **Trail.** Click any line or source chip to see the searches, engines and pages behind it.
- **Live Room** (`/live`). Chrome speech recognition plus claim checks: Checks out, Contradicted or Unclear, with sources.
- **Chrome extension** (`extension/`). The same checks from Meet or Zoom web captions in a side panel, plus Research this company. See [extension/README.md](extension/README.md).
- **Watch.** A Telem monitor agent per company. Check now runs it on demand and lists changes with sources.

## How Proven uses Telem

- `auto_routing: "accuracy"` on every search; the per-query routing is shown live.
- Batch search per round; per query, pages are merged by URL and ranked by how many engines found them, then best rank, then routing order.
- Hiring, customer and social queries also run on pinned platform engines (LinkedIn, X, TikTok, YouTube, Trustpilot, Product Hunt, Quora, WeChat).
- News queries use `published_after` (last 365 days).
- One Telem session per memo: both rounds and the page fetches share the first `session_id`.
- `/v1/fetch` for pages Tavily extract misses; `/v1/monitors` with the agent (`agent/ticks`, `agent/changes`) for Watch.

Details: [docs/TELEM_NOTES.md](docs/TELEM_NOTES.md).

## Architecture

```
 Browser (Next.js pages)          Chrome extension (Meet / Zoom captions)
   /  memo + research feed           side panel: claim cards,
   /live  Live Room                  Research this company
   /memo/[id]  shared memo
          |                                   |
          +----------------+------------------+
                           |  HTTP (NDJSON stream for memos, CORS for the extension)
                           v
                Next.js API routes (app/api/)
     /api/memo  /api/live  /api/trail/[id]  /api/watch  /api/memos  /api/health
                           |
                           v
                 Brain (lib/brain/, Claude Opus 5.5, JSON schema output)
     memo.ts: plan -> search round 1 -> find gaps -> round 2 -> read pages -> write -> drop uncited lines
     live.ts: find claims -> search -> judge
                           |
                           v
                 Search layer (lib/search/)
     Telem: routed batch search, platform engines, news date filter,
            one session per memo, fetch, monitor agents
     Tavily: search (one call per query) and extract
                           |
                           v
                 Store (lib/store.ts): memory, plus memos and trails as JSON in .data/
```

## Setup

```sh
npm install
cp .env.example .env.local   # add TELEM_API_KEY, TAVILY_API_KEY, ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Offline, no keys: set `MOCK=1` in `.env.local` (or run `MOCK=1 npm run dev`). Every API route then returns fixtures from `fixtures/`, and a **Demo data** badge shows next to the logo. Never present mock results as real.

Telem hackathon keys use `https://hack.telem.ai/api`; set `TELEM_BASE_URL` to change it.

## Scripts

Run with `npx tsx`:

| Command | What it does |
|---|---|
| `npx tsx scripts/check-parse.ts` | Offline tests of the search layer: Telem and Tavily parsing, merge, batches, failures. No network, no keys. |
| `npx tsx --env-file=.env.local scripts/try-search.ts` | Real-key smoke test: four queries through all three Telem batches plus Tavily, one extract, prints sources and the trail. |
| `npx tsx --env-file=.env.local scripts/warm-cache.ts deep Stripe Figma Rivian` | Runs real memos ahead of a demo; they appear under Recent memos. First argument `quick` or `deep`. |

## Team

- Rishith: lead, AI brain, integration
- Aarav: search layer (Telem, Tavily)
- Mario: product, UI, Chrome extension, demo

## License

See [LICENSE](LICENSE).
