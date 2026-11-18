# Free AI chain setup

The application can play with no provider key: the existing engine selects its best scored legal move at the selected level. The Why card identifies that choice. External requests improve the choice/explanation and supply optional personality lines, but exhausted AI credits cannot block play.

Set credentials in the server process environment locally and in Netlify environment variables available to Functions. The default all scopes setting includes Functions and needs no upgrade; limiting a variable to a custom scope requires an eligible plan. See [Netlify's scope guidance](https://docs.netlify.com/build/environment-variables/overview/). Never use a browser variable prefix. No credential value belongs in source control, logs or the browser. Missing keys are silently skipped. No new package is needed.

## Credential variable names

| Purpose | Names |
| --- | --- |
| Groq models | `GROQ_API_KEY` |
| Cloudflare models | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| OpenRouter free router | `OPENROUTER_API_KEY` |
| SambaNova model | `SAMBANOVA_API_KEY` |
| Vercel free Beam promotion | `AI_GATEWAY_API_KEY` |
| Conditional Gemini model | `GEMINI_API_KEY`, `AI_ENABLE_GEMINI_FREE` |
| Shared cooldown storage | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |

Only keys for providers you want are needed. Keep Cloudflare on its Free plan for a hard free allocation. OpenRouter defaults to its free router; Vercel defaults to the model whose free suffix stops serving when its promotion ends. Gemini requires the explicit eligibility flag in addition to a key because its unpaid terms do not suit every public game. See the [provider audit](../03-technical/ai-providers.md). The old `LLM_MODEL` variable is unnecessary for the new chain.

## Latest configuration check: 18 Nov 2026, Asia/Karachi

The owner subsequently authorized private reading of the local environment file and synchronizing the selected AI settings. Six variables passed format checks and were uploaded to the linked Netlify project `checkervia` as protected, write only secrets. Values stayed in memory and were never printed or copied into artifacts. Existing OpenRouter and Supabase settings were preserved.

| Variable | Netlify status |
| --- | --- |
| `OPENROUTER_API_KEY` | Present and authorized; today's 50 refreshed requests used, zero remaining; 100 of 210 benchmark cases recorded |
| `SUPABASE_URL` | Present and matches the configured project |
| `SUPABASE_SERVICE_ROLE_KEY` | Present; newer secret format supported and shared writes verified |
| `GROQ_API_KEY` | Protected secret; both configured models returned valid replies |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Protected secrets; both models completed the full benchmark |
| `SAMBANOVA_API_KEY` | Protected secret; evaluation stopped on account response 402 |
| `AI_GATEWAY_API_KEY` | Protected secret; evaluation stopped on access response 403 |
| `GEMINI_API_KEY` | Protected secret; configured model returned valid replies |
| `AI_ENABLE_GEMINI_FREE` | Set to **1** during verification; available to Functions in all contexts |

The Gemini enable variable is **1**; it is separate from the API key. Protected provider secrets have explicit production, deploy preview and branch deployment contexts with Functions availability. They are not exposed through a dev context or post processing. See [Netlify protected secrets](https://docs.netlify.com/build/environment-variables/secrets-controller/). Outside Netlify's hosted systems their values are masked, so live function responses verify availability. Do not send credential values in chat or put them in browser code.

The updated [AI draft](https://6afd79a4badc3fe12806e8e5--checkervia.netlify.app) is deployed with the protected preview context and measured order. Production is unchanged. Readiness, invalid input and existing statistics/leaderboard endpoints passed. Six live model moves were legal: openings at all four levels and real midgame positions on both fast levels, in 1.2 to 1.8 seconds. A standalone taunt passed validation. The HTML, JavaScript and CSS exactly match the previously verified assets; concurrent marketplace and robot changes were not included. Earlier draft checks verified best legal engine fallback at all four levels, local taunt fallback and a persisted OpenRouter 429 cooldown.

## Configuration variable names

| Purpose | Names |
| --- | --- |
| Global manual order | `AI_PROVIDER_ORDER` |
| Hard/Strongest and all opening moves | `AI_MOVE_PROVIDER_ORDER` |
| Later Easy/Medium moves | `AI_FAST_PROVIDER_ORDER` |
| All standalone personality lines | `AI_TAUNT_PROVIDER_ORDER` |
| Entire provider list | `AI_PROVIDERS_JSON` |
| Optional restricted OpenRouter routing | `AI_OPENROUTER_REQUIRE_ZDR` |
| Per model overrides | `AI_<ID>_MODEL`, `AI_<ID>_BASE_URL`, `AI_<ID>_TIMEOUT_MS` |

An order is a list of IDs separated by commas. A specific job's nonempty order overrides the global order; listed providers come first and remaining configured providers follow. Unknown/repeated IDs do not duplicate calls. Model IDs are `groq-small`, `groq-large`, `cloudflare-small`, `cloudflare-large`, `sambanova`, `vercel`, `openrouter`, `gemini`. For variable prefixes, uppercase the ID and replace its hyphen with an underscore.

Adding a provider is configuration: the JSON array follows the `Provider` interface in `netlify/ai/providers.ts`, including ID, quota group, base address, model, key variable name, attempt timeout and reset rule. The optional `tier` is `fast` for lightweight models or `quality` for heavier models. The adapter appends the completion path. Configure quota group names to match shared account pools. Only choose models with a currently confirmed free entitlement for this launch; overriding a model can change billing and privacy. No automatic recharge or paid upgrade is configured by this project.

## Supabase migration

[Migration 6](ai-migration-6.sql) has been applied to the configured Supabase project through authenticated MCP after the owner's explicit instruction. It is recorded as `20261117125608`, `ai_6_provider_cooldowns`; no manual SQL Editor step remains for this project. It creates the private cooldown table and an atomic RPC that keeps the longer cooldown when functions write concurrently. Browser roles cannot read the table or call the RPC. Live checks verified permissions and rollback only RPC behavior, with unchanged player/game checksums. No leaderboard or game table changes.

Both shared reads and writes are bounded. Missing variables, a missing table, permission errors and database outages fall back to memory in that function instance. The chain continues; a new instance cannot know another instance's cooldown until shared storage is available. Expired records are ignored automatically. Unexpired local records are retained if a shared read fails.

New Supabase secret keys are sent only through the API key header; legacy JWT service keys keep their Bearer header. See [Supabase's key guidance](https://supabase.com/docs/guides/getting-started/api-keys). Live draft checks exposed that the original storage deadlines could miss ordinary network latency. Reads now allow up to 500 milliseconds and writes 750 milliseconds, clipped to the same total chain budget. A regression test covers successful sharing across 300/350 millisecond network delays, and the full budget/outage tests remain in place.

## Deadlines, routing and privacy

Each provider normally gets 3.5 seconds; a final attempt is shortened to the remaining budget. The server chain gets 10 seconds, the browser request 11 seconds, and the existing whole turn 12 seconds including search. Cached engine results are available for immediate fallback when the network fails or the whole turn expires. Search depth, candidate filtering, legal move verification and game rules are unchanged. Cancellation after a new game never plays a fallback into that game.

The move server rebuilds prompts from a validated board, legal candidate indexes, level and engine scores. It ignores arbitrary prompt text and player/profile fields. Model replies pass the same numbered candidate parser on the server and again in the browser. A model cannot forge engine provenance. Logs contain provider ID, safe error code and attempt count only; upstream bodies, credentials and prompts are never logged. Legacy proxy tests retain their original protections with a stronger assertion that entire error messages are discarded.

Limit responses set account group cooldowns. Retry/reset headers and structured response details take priority; known UTC or Pacific midnight rules follow. Missing minute reset advice waits five minutes; unknown daily limits wait until UTC midnight. A request never sleeps waiting for a cooldown. Groq's model variants conservatively share one group; Cloudflare's variants share their daily neuron pool. This avoids counting the same allowance twice.

Greetings, rematches, ordinary idle lines, move reactions and endings request the faster route. Local banks speak immediately and survive any remote failure. Reporting warnings and proved loss instructions keep their exact local text. Late lines are cancelled on a changed turn/game. An engine fallback's move line stays local. No layout is changed.

## Repeatable evaluation

Run `npm run eval:ai` from a process with the desired provider key variables. It never loads an environment file. The same 42 positions are replayed from legal games, with seven examples in each required category and all four levels, plus 42 taunt cases. Cases interleave categories/jobs so small quotas sample several tasks early. Limits stop a provider instead of crashing the run. Checkpoints resume later; prior requests remain in quota accounting when fixtures change.

After the owner authorized private use of the local settings, the local Gemini enable switch was also verified as **1**. For an explicit local file run, Node can load the existing file privately with `node --env-file=.env scripts/run-ai-eval.mjs`; values remain inside the process. The evaluator itself still uses process environment only. Checkpoint restarts retain the previous call's minute spacing as well as daily usage, including when fixtures change.

The generated [model ranking](../03-technical/ai-model-ranking.md) distinguishes measurements, incomplete runs and planning estimates. Complete measurements update `netlify/ai/model-ranking.json`, which the function uses after its next build/deployment. A model whose median exceeds its attempt deadline is demoted, and manual order always wins. Run `npm run eval:ai -- --report-only` for a report refresh without calls.

Easy/Medium moves and standalone taunts exhaust the lightweight tier before reaching quality models, even when a heavier model has a better taunt score. Measurements rank models within each fast tier; Hard/Strongest and openings use the measured move score across all models. Latency demotion applies before the tier preference and manual configuration wins over both.

Five models have completed the same 210 cases: both Groq models, both Cloudflare models and Gemini. OpenRouter stopped at today's 50 request allowance, with 100 cumulative cases; it can resume after the next UTC midnight and stays unranked. SambaNova's 402 and Vercel's 403 keep those accounts incomplete. The report includes usage coverage and games/day calculations including thinking tokens, and distinguishes complete comparisons from partial evidence. Transport failures reduce operational first try scores and unknown token use remains explicit.
