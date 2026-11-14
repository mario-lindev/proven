# Telem API notes (read 2026-11-14)

Facts only. Sources: H = https://hack.telem.ai/doc/llms-full.txt (the hackathon copy of the docs, base `https://hack.telem.ai/api`), with the section named. Public docs (https://docs.telem.ai) say the same with base `https://router.telem.ai`.

## Search `POST /v1/search` (H: API Reference > Search; Search parameters)

- Body: `user_input` (one `{query}` or a list for a batch), `search{...}`, `session_id`, `metadata`.
- `search.auto_routing`: **`"accuracy"` is the only mode.** Any other value (e.g. `"speed"`) is a 422. Omit it to turn routing off. (H: Auto-routing)
- `routing` in the response: with auto-routing, one entry per query **in batch order**, `{ "providers": [...] }`, **best first**. Without auto-routing: `null`. If routing is unavailable, every query runs on the default providers and each run's `warnings` has `routing_unavailable`. (H: Search parameters > The routing block)
- Auto-routing chooses only from what `providers.include` / `exclude` allow. If a chosen provider fails, the others still answer; all fail = 503. (H: Auto-routing)
- `providers.include` **replaces** the default set (it does not add). `pinned_providers` in the response echoes it. Unknown name = 400. (H: Search parameters > Providers)
- `GET /v1/preprocessors` (no auth) is the live roster with `active_by_default` and `auto_routed`. On hack.telem.ai today: defaults = brave, ceramic, exa, parallel, seltz, tavily, you; auto-routable also linkup, perplexity, tinyfish.
- `num_results` 1 to 20, default 5, **per provider**. exa clamps at 10.
- `tier`: `minimalist` (url, title, rank) < `default` (+summary) < `extended` (+excerpt, publish_date, usage; costs more on tavily and parallel, slower on parallel) < `max`. (H: Search best practices > Choose a tier)
- `fields`: explicit list instead of a tier (cannot send both). Only `excerpt` / `full_content` engage paid options. We send `["url","title","rank","summary","publish_date"]`: dates at base price. (H: Search parameters > Tier; Search best practices)
- Date field is **`publish_date`** (empty/null when unknown). Not `published_date`.
- `published_after` / `published_before` (ISO date or datetime, UTC if no zone): keep results in the window; undated results are kept; with either set every result has `publish_date` at every tier. Per search only. A date filter can drop providers that cannot filter. (H: Search parameters > Publication date)
- `include_domains`: 1 to 20 host names, subdomains included; providers that cannot filter by domain are skipped unless named. (H: Search parameters > Domains)
- `provider_overrides`: native options per named provider, 16 KB cap. `include_raw`, `include_full_content` (only at extended/max).
- `rank` is per provider, not a cross-provider score. Results are not merged for you. The docs' own merge: **pages more providers found first, then best rank.** (H: Telem skill > Step 3; Search best practices merge example)
- Batch: one run per (query x provider), tagged `batch_index` + `query`. Search options apply to the whole batch, so different options mean separate calls.
- Response also has `status` (`succeeded` / `partially_succeeded` / `failed`), `interaction_id`, `session_id`, `created_at`, `completed_at`.
- Run `warnings[]` = `{code, message}`: `capability_gap` (field not supplied, normal), `count_clamped`, `routing_unavailable`, `providers_excluded`, `paid_knob_engaged`.
- Errors: 400 bad request, 401 key, 402 cannot pay, 403, 409 `missing_snapshots`, 422 schema (`detail[].loc` names the field), 429 `Retry-After`, 503 `all_providers_failed`, 504 `deadline_exceeded`. 400/422 run nothing.

## Sessions (H: Search best practices > Keep a task's searches together; API Reference)

- Send the first response's `session_id` with later searches (and fetches) so the console shows them as **one session / trajectory**. Search, fetch and monitor poll all take `session_id`.
- `metadata` = "query lineage" keys (conversation, turn, tool call); the SDK builds them (`buildMetadata`), the REST shape is not spelled out.

## Platforms (H: Supported platforms)

- **Every platform search provider is pinnable only: auto-routing and the default set never choose it.** Name it in `providers.include`. With `auto_routing` on, Telem chooses among the named ones.
- Ids we use: `apify_linkedin` (LinkedIn), `socialdatax_x` (X), `fetchlayer_tiktok` (TikTok), `socialdatax_youtube`, `fetchlayer_trustpilot`, `fetchlayer_producthunt`, `apify_quora`, `socialdatax_wechat`. Many more (Weibo, Zhihu, Xiaohongshu, Bilibili, Google Maps/Reviews, Amazon, Substack...).
- Fetch side: platform links often route to the platform provider automatically. `brightdata` (pin only) reads LinkedIn company/job/post pages; `fetchlayer_glassdoor` reads Glassdoor company pages.
- Billing is per provider meter (e.g. apify_linkedin per post, up to 20 a call; socialdatax 10 points a call). Empty results are not billed.
- On the hack deployment `/v1/preprocessors` also lists `sec_edgar`, `coresignal_company`, `coresignal_people`, `fetchlayer_reddit`, `tianyancha`, `patsnap`, `uspto_applications` (not in the docs; untested).

## Fetch `POST /v1/fetch` (H: API Reference > Fetch)

- `urls` up to 5 (6 = 400 `over_url_cap`). `options`: `content_format` (markdown|text), `inline_max_chars` (default 20000; `content_truncated`), `inline_content`, `tier`, `providers` (ordered chain), `max_age_seconds`, `no_cache`. Plus `session_id`, `metadata`.
- One row per URL in `fetched_results[]` with its own `status`, `provider`, `error`.

## Monitors (H: Monitors; API Reference)

- Create: `{ query, options: { frequency: 1h|6h|12h|1d|7d, include_domains? }, ttl (max "30d"), agent?: bool (default true), webhook_url?, metadata? }`.
- A monitor has an **agent** by default that checks each result against the query. `agent_state.status`: `compiling` then `ready`.
- **`POST /v1/monitors/{id}/agent/ticks` runs the agent now** (202, `job_id`), outside the schedule. 409 `tick_in_progress` / `budget_exhausted`.
- **`GET /v1/monitors/{id}/agent/changes?cursor=N`**: what the agent found, oldest first; each change has `seq`, `kind` (`entity_added`, `value_changed`, `fact_status_changed`, `alert`, `run`, `plan_changed`), `subject {entity_id, name}`, `before`, `after` (with the quote and `url`), `at`; page has `next_cursor`, `watermark`.
- Also: `/agent/events` (newest first), `/agent/objects` (latest findings), `/agent/chat` (ask the agent), `/agent/jobs`.
- `POST /v1/monitors/{id}/poll` is now the **legacy** read: results new since the last poll, search-response shape. Only the creating key may poll; 409 `poll_in_progress` / `monitor_ended`.

## What Proven does with this (lib/search)

- Every search: `auto_routing: "accuracy"`, `fields` with `publish_date`; routing parsed onto each `search` trail step (`routing`), run warnings onto `Engine.warnings`.
- Per query, Telem hits are merged by URL and ordered: consensus, then best rank, then routing order; credited to the best-routed provider.
- News-style queries ("latest", "news", "recent"...) go in their own batch with `published_after` = 365 days ago (step gets `published_after`).
- `opts.platforms` (memo only): hiring / customer / social queries (max 4) also go in a batch pinned to the platform providers above, auto-routed among them.
- One Telem session per trail: later searches and Telem fetches send the first `session_id`.
- If a richer body gets 400/422, one retry with the docs' plain body (tier default).
