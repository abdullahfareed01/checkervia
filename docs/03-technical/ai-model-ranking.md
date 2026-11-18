# AI model evaluation

Checked `2026-11-18T10:15:07.768Z`. Run `npm run eval:ai`; it uses process environment only and never opens .env. Repeating the command resumes checkpoints. Prompt changes invalidate quality samples by hash while preserving recent quota history. Use `npm run eval:ai -- --report-only` to refresh this report without API calls.

42 unique positions replayed by the engine, seven each of openings, midgame, forced captures, multi jumps, kings and endgames, at all four levels (168 move cases), plus 42 event/level taunt cases. Seed 0x5eed123. Easy includes a deterministic slip sample.

## Moves

| Model | Status | Move samples | First valid | In level candidates | Best engine score | Reason checked | Median / max ms | Mean total tokens (usage coverage) | Score |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `cloudflare-large`: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | complete | 168 | 100.0% | 100.0% | 98.8% | 99.4% | 753 / 7492 | 717.6 (168/168) | 99.5 |
| `cloudflare-small`: `@cf/meta/llama-3.1-8b-instruct-fp8-fast` | complete | 168 | 100.0% | 100.0% | 96.4% | 98.2% | 438 / 1134 | 720.1 (168/168) | 98.6 |
| `groq-large`: `openai/gpt-oss-120b` | complete | 168 | 98.8% | 98.8% | 98.2% | 98.2% | 377 / 10607 | 824.6 (166/168) | 98.5 |
| `groq-small`: `openai/gpt-oss-20b` | complete | 168 | 98.8% | 98.8% | 97.6% | 96.4% | 496 / 10621 | 797.9 (166/168) | 98.0 |
| `gemini`: `gemini-3.1-flash-lite` | complete | 168 | 95.8% | 95.8% | 95.8% | 95.2% | 1602 / 15147 | 711.9 (161/168) | 95.7 |
| `sambanova`: `Meta-Llama-3.3-70B-Instruct` | incomplete (402) | 1 | 0.0% | 0.0% | 0.0% | 0.0% | 1235 / 1235 | unknown (0/1) | unranked |
| `vercel`: `reflection/beam-free` | incomplete (403) | 2 | 0.0% | 0.0% | 0.0% | 0.0% | 1760 / 2457 | unknown (0/2) | unranked |
| `openrouter`: `openrouter/free` | incomplete (DAILY_SAFETY_STOP) | 84 | 34.5% | 34.5% | 34.5% | 34.5% | 5259 / 15026 | 1237.4 (49/84) | unranked |

## Taunts

| Model | Status | Taunt samples | Clean valid | Median / max ms | Mean total tokens (usage coverage) | Score |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `cloudflare-small`: `@cf/meta/llama-3.1-8b-instruct-fp8-fast` | complete | 42 | 92.9% | 414 / 673 | 205.0 (42/42) | 92.1 |
| `gemini`: `gemini-3.1-flash-lite` | complete | 42 | 97.6% | 1783 / 15010 | 178.1 (41/42) | 87.1 |
| `groq-small`: `openai/gpt-oss-20b` | complete | 42 | 61.9% | 477 / 10645 | 289.8 (41/42) | 68.4 |
| `vercel`: `reflection/beam-free` | incomplete (403) | 0 | n/a | n/a | n/a | n/a |
| `cloudflare-large`: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | complete | 42 | 100.0% | 470 / 5319 | 191.0 (42/42) | 97.1 |
| `groq-large`: `openai/gpt-oss-120b` | complete | 42 | 61.9% | 525 / 10661 | 274.1 (41/42) | 68.2 |
| `sambanova`: `Meta-Llama-3.3-70B-Instruct` | incomplete (402) | 0 | n/a | n/a | n/a | n/a |
| `openrouter`: `openrouter/free` | incomplete (DAILY_SAFETY_STOP) | 16 | 75.0% | 5764 / 15020 | 681.8 (13/16) | unranked |

Only complete runs with at least 40 samples affect automatic order. Incomplete rows stay unranked. Rates use all attempts as the denominator, so transport failures reduce the operational score; they do not establish reasoning quality, and missing usage does not establish token cost. Candidate membership is constrained by the offered list (all legal moves on Easy); best score accuracy distinguishes stronger picks. Truth passes only exact statements proved by the engine; other prose is unverified. Tokens include rejected replies when usage is returned. Completion tokens already include reasoning, which is recorded separately without double counting. Usage coverage below 100% cannot establish actual whole chain token consumption. OpenRouter's free router is a changing pool, not a pinned model.

Move score = 30% validity + 20% candidate membership + 30% best score + 20% reason truth. Taunt score = 75% clean valid taunts + 25% speed (linear to zero at 4s). Median latency for the current job at/above the configured attempt deadline demotes a model before scoring. Fast jobs try the configured lightweight tier before quality models and use measured taunt scores within each tier. This reserves the best models for Hard/Strongest and openings, even if a heavy model has a better taunt score. Evaluation allows 15s to identify slow models. No partial run is promoted.

## Current order

Complete measurements are applied below.

- Hard/Strongest and opening moves: `cloudflare-large` → `cloudflare-small` → `groq-large` → `groq-small` → `gemini` → `sambanova` → `vercel` → `openrouter` → engine.
- Easy/Medium subsequent moves: `cloudflare-small` → `gemini` → `groq-small` → `vercel` → `cloudflare-large` → `groq-large` → `sambanova` → `openrouter` → engine.
- All standalone taunts: `cloudflare-small` → `gemini` → `groq-small` → `vercel` → `cloudflare-large` → `groq-large` → `sambanova` → `openrouter` → local line.

Only keyed, eligible providers participate at runtime. Gemini needs its policy flag. Manual lists of IDs separated by commas win: AI_PROVIDER_ORDER, AI_MOVE_PROVIDER_ORDER, AI_FAST_PROVIDER_ORDER, AI_TAUNT_PROVIDER_ORDER. A nonempty override for the job takes precedence over the global override.

The runner spaces calls using RPM/TPM with a safety margin, stops on 402/429, honors retry/reset advice and checkpoints counts without response text. Permanent HTTP/configuration errors and three consecutive transport failures also stop a run. It proactively stops before known daily request/token caps using the documented UTC/Pacific day, or conservative rolling accounting over 24 hours when the reset boundary is unknown. Restarts retain minute spacing and resume later without repeating completed cases. Shared account traffic can exhaust quota sooner. Missing keys are skipped. No paid models are selected by default.

## Capacity at 30 AI turns per game

Real generated move prompts average **2504 bytes** in `UTF-8`. Without provider usage, input is estimated as ceil(bytes/3) = **835 tokens**, plus the full completion budget of **768 tokens** including thinking. This is a planning scenario, not a tokenizer measurement or a bound for every tokenizer. Reply byte counts include rejected responses when captured; earlier missing response metadata remains unknown.

| Model | Evidence | Input tokens/call | Output including thinking/call | Mean reply bytes | Games/day with moves only |
| --- | --- | ---: | ---: | ---: | ---: |
| `groq-small` | returned usage (166/168 calls) | 731 | 67 | 77 | 8 |
| `groq-large` | returned usage (166/168 calls) | 731 | 94 | 76 | 8 |
| `cloudflare-small` | returned usage (168/168 calls) | 693 | 27 | 90 | 87 |
| `cloudflare-large` | returned usage (168/168 calls) | 693 | 25 | 80 | 14 |
| `sambanova` | planning estimate only | 835 | 768 | 0 | 0 |
| `openrouter` | returned usage (49/84 calls) | 667 | 570 | 26 | 1 |
| `vercel` | planning estimate only | 835 | 768 | 0 | unknown account/promotion cap |
| `gemini` | returned usage (161/168 calls) | 689 | 23 | 76 | unknown account/promotion cap |

Known numeric pools combined: **96 games/day with model assistance in this planning scenario** for 30 move calls and local lines; **67/day** for 30 moves plus 32 standalone taunts (one per move, start and end). Use returned move and taunt usage when available, reserving the full output cap only for unmeasured replies; incomplete usage coverage remains an estimate. Count Groq and Cloudflare only once each, take the pool for each smaller model, and exclude conditional Gemini and unknown Vercel caps. Routing to larger models costs more; failures, other traffic and extra idle taunts also reduce capacity. Rounding separately for each provider leaves unused calls, which can combine across a game.

Complete benchmarks with full move and taunt usage coverage establish **87 move only games/day**, or **61 games/day with 32 standalone taunts**, as token based capacity scenarios for the tested numeric pools: `cloudflare`. Each shared pool is counted once using its first eligible model above. Selecting the highest ranked complete model per shared pool for quality moves instead gives **14 move only games/day**. These scenarios use fresh daily allowances and average measured usage, include thinking and rejected responses, assume no other account traffic, and describe attempt capacity rather than guaranteed valid answers. They are not today's remaining allowance after this evaluation. Mixed difficulty, quality openings, failover and extra idle chatter change the consumption. Unknown account caps and inaccessible providers add no measured capacity.

The exact whole chain daily total remains unknown when a configured provider has no numeric account cap. These are capacity scenarios, not guarantees of successful responses. Providers attempted in this checkpoint: `openrouter`, `groq-small`, `groq-large`, `vercel`, `cloudflare-small`, `sambanova`, `gemini`, `cloudflare-large`. Providers without keys contribute no measured quota. Games using only the engine have no provider quota.
