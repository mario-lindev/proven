# Search layer

Server-side exports: searchAll, extract, watch, pollWatch.
Uses the shared Source, TrailRecorder, and WatchUpdate contracts.
newTrail remains in lib/store.ts.

Set TELEM_API_KEY and TAVILY_API_KEY in .env.local. Never expose them as NEXT_PUBLIC variables.
No new runtime dependencies are required.

- Search: one Telem batch and concurrent Tavily requests, deduplication, at most 20 sources, one trail step per query.
- Provider failures appear in trail engines; surviving providers can still return evidence. All-provider failure throws.
- Extraction: up to five pages, Tavily first, Telem fetch for missing pages. Partial results retain explicit trail errors.
- Watches: hourly Telem monitor, 30-day lifetime. Poll returns newly discovered pages, not agent-verified change events. Empty polls are expected before the first scheduled run.
- platforms option is reserved; callers should use explicit platform queries (for example site:linkedin.com) today.

Run deterministic tests with Node 24. Run from the repository root:
    node --test lib/search/search.test.mjs

Tests mock provider HTTP responses. They do not prove live provider credentials or availability.
Live validation requires API keys. No monitor is created by the tests.
