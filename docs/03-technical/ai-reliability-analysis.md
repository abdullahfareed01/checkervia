# AI reliability, limits, alternatives and hosting

Analysis only, written 17 Nov 2026. No code, config or setting was changed. Every external fact below names its source and the date it was read (all sources were read on 17 Nov 2026 unless stated). "Not verified" means I could not confirm it from an official page.

Handoff update (17 Nov 2026): this report describes the earlier behavior. D91 now implements safe error categories, permanent failure detection, bounded retries with backoff, a total 12 second turn deadline, request cancellation and provider metadata readiness checks. The automatic engine fallback, model change and lower token budget remain proposals. A fresh metadata check confirmed that the account balance is exhausted; model measurements remain pending funding.

## The short answer

**The live AI fails today because the OpenRouter account is out of credits.** On 17 Nov 2026 at about 02:19 Pakistan time (16 Nov, 21:19 UTC) I sent 16 real move requests to the live function (4 turns, one per level, 4 calls each). All 16 failed in about 0.4 s, and two more probes about 11 hours later (17 Nov, 08:47 UTC) failed the same way. The live function log shows the same provider error for every one: `ai-move: provider returned status 402: {"error":{"message":"This request requires more credits, or fewer max_tokens. You requested up to 1500 tokens, but can only afford 432. ...`. OpenRouter checks the price of the largest possible answer (`max_tokens` 1500) before it runs a request and refuses with 402 when the balance (or the key's own credit limit) cannot cover it. The function turns every provider error into a generic `502 "The AI service is unavailable."`, the browser retries 4 times in about 2 s, and the player sees **"The AI could not make a move"** with Details that say "The model call failed: The AI service answered with status 502." four times. The splash and home menu still say the AI is ready, because the health check (`GET`) only checks that the key and model are set, not that the account can pay. This cause is **confirmed**, not inferred. After it is fixed, the next most likely causes, in order, are: (2) slow replies, since nothing in the code gives up before 55 s per call and 4 calls can keep "AI is thinking…" on screen for about 4 minutes (earlier live checks in `ai-opponent.md` measured 1.0 to 14.4 s per reply); (3) an empty answer, either `finish_reason: "length"` (reasoning used the 1500 token budget) or a `200` whose body holds only an `error` object, both of which the function reports as `502 "The AI service returned no usable answer."`; (4) the in memory limit of 20 requests per minute per IP, which a failing turn (4 calls) plus a few Retry presses, or several players behind one shared IP, can reach; (5) provider side 429 or 503 from OpenRouter. Causes 2 to 5 are possible from the code but I did not see them happen today, because every request stopped at the 402. The phrase "AI is not responding" does not exist in the code: the game says "The AI could not make a move", and the home menu says "AI unreachable" only when the health check fails.

**What to do before launch, in one line:** add credits and a low balance alert on OpenRouter now, then add an engine fallback so a turn can never stall (Part 5, fix 1), give the model a budget of about 10 s, and send `max_tokens` around 600 instead of 1500.

## Part 1: the AI flow in the code

### One AI move, step by step

| Step | Where | What happens | Time limit |
|---|---|---|---|
| 1 | `src/state/gameReducer.ts` | The player's move makes it the AI's turn: `aiPhase` becomes `"thinking"` and `aiRequestId` changes. The board is locked. "AI is thinking…" shows (`StatusBar.tsx`, `AiThinking`). | none |
| 2 | `src/state/useGame.ts` → `startAiTurn` in `src/state/aiController.ts` | Starts the turn. | none |
| 3 | `provenLost` in `src/ai/endgame.ts` | If every AI move loses by force, the AI resigns (D89) and no model call is made. | Web Worker 10 s (`WORKER_TIMEOUT_MS`), then the same search on the page |
| 4 | `lastOpponentMove` → `judgeMove` (`src/ai/judge.ts`) | The engine judges the player's last move (blunder, great or nothing) at depth 4 and collects the AI's last 3 lines. | worker 10 s, then on the page |
| 5 | `chooseMove` → `offerFor` (`src/ai/chooseMove.ts`) | The engine scores every legal move at the level's depth (1, 2, 4 or 6 turns) and keeps the best 5, 4 or 3 (all at Easy). Easy leaves out the scores 3 turns in 10 (a slip). If the search fails at Medium, Hard or Strongest the turn fails at once with "The engine's look ahead failed, so the AI's moves could not be listed." | worker 10 s, then on the page |
| 6 | `buildPrompt` (`src/ai/prompt.ts`, `PROMPT_VERSION` `v11`) | One user message: rules and reply format, the board grid, the side, the look ahead explanation, the reaction instructions (clean or strong persona, last 3 lines), the numbered moves with scores. Measured size: 2,388 to 3,472 characters, about 630 to 930 tokens (see Part 2). | none |
| 7 | `callModel` from `createCallModel` (`src/ai/client.ts`) | `POST /.netlify/functions/ai-move` with `{ prompt }` (plus `retryNote` on a retry). Anything but a `200` with non empty `text` throws. | **65 s** per call (`CLIENT_TIMEOUT_MS`) |
| 8 | Netlify | Routes the request to the function in `us-east-2` (Ohio; from the Netlify API for this site). | **60 s**, not configurable (Netlify "Configuration for functions", https://docs.netlify.com/build/functions/optional-configuration/, read 17 Nov 2026) |
| 9 | `netlify/functions/ai-move.ts` | Builds the handler's inputs: the client id is the `x-nf-client-connection-ip` header; the limiter lives in the memory of this instance. | none |
| 10 | `handleAiMove` (`netlify/aiMoveHandler.ts`) | In order: `GET` = health check; non `POST` = 405; rate limit (20 per 60 s per IP, `netlify/rateLimiter.ts`) = 429; body check (only `prompt` up to 8,000 characters and `retryNote` up to 500) = 400; key or model missing = 500. | none |
| 11 | `handleAiMove` → OpenRouter | `POST https://openrouter.ai/api/v1/chat/completions` with `model` from `LLM_MODEL` (`openai/gpt-oss-120b` per `docs/07-deployment/deployment-guide.md`), one user message, `max_tokens: 1500`, `reasoning: { effort: "low" }`, `provider: { require_parameters: true }`, `response_format` = strict JSON schema `{ move: integer, reason: string, reaction: string }`. Not streamed. | **55 s** for everything (`PROVIDER_TIMEOUT_MS`, one `AbortSignal.timeout`) |
| 12 | same | If OpenRouter answers 400, 404 or 422, it asks once more without `response_format`, inside the same 55 s. | shares the 55 s |
| 13 | `readProviderResponse` | Not OK status = 502 "The AI service is unavailable." (status and the first 200 characters go to the log, key removed). Body not JSON = 502 (same text). No `choices[0].message.content` = 502 "The AI service returned no usable answer." (logs `finish_reason`). Otherwise `200 { text }`. A thrown timeout = 504 "The AI service took too long."; any other throw = 502 "The AI service is unavailable." | none |
| 14 | `parseReply` (`src/ai/parseReply.ts`) | Finds the JSON object with `move`, checks it is a whole number in range. Failures: `No JSON object with a "move" field was found.`, `The reply contains more than one different move.`, `"move" must be a number...`, `"move" must be a whole number...`, `Move N is not in the list. Choose a number from 1 to M.` A rejected reply gets a retry note (`buildRetryNote`). | none |
| 15 | `chooseMove` loop | Up to 4 calls (1 + `maxRetries` 3, set in `aiController.ts`). **No wait between calls.** A thrown error retries with no note; a bad reply retries with a note. | 4 × step 7 |
| 16 | `aiController.ts` → reducer | Success: `aiMoved` (the move is checked against the legal list again). Failure: `aiFailed` with every reason; `aiPhase` becomes `"failed"`. | none |
| 17 | `StatusBar.tsx` (`AiFailed`) and `useFeedback.ts` | Shows **"The AI could not make a move"**, the hint "It did not give a valid answer, so no move was played and the board stays locked. Retry to ask again, or start a new game.", a Retry button and Details (the reasons, dashes removed). An error sound plays. Retry starts all of steps 3 to 17 again under a new request id. | none |

Worst case before the player sees anything: steps 3 to 5 normally take well under 1 s, then 4 calls of up to about 55 to 60 s each, so **about 4 minutes of "AI is thinking…"** before "The AI could not make a move". The 65 s browser timeout only fires if the connection hangs after Netlify gives up.

### Every place a turn can fail, and what the player reads

The headline is always "The AI could not make a move". The Details list shows one line per call, each starting "The model call failed: " for errors thrown by `callModel`.

| Failure | Server status and text | Details line the player sees | Retries help? |
|---|---|---|---|
| OpenRouter out of credits (402) **(today)** | 502 "The AI service is unavailable." | "The AI service answered with status 502." | No |
| Invalid or revoked key (401), forbidden (403) | 502 same | same | No |
| Provider rate limit (429) or no provider meets the routing rules (503) | 502 same | same | Sometimes, after a wait |
| Provider error (500, 502) | 502 same | same | Usually |
| Model refuses `response_format` (400, 404, 422) | second call without it; then as above | as above | handled |
| Reasoning used all 1500 tokens (`finish_reason: "length"`) | 502 "The AI service returned no usable answer." | "The AI service answered with status 502." | Rarely (OpenRouter says retrying does not help) |
| OpenRouter `200` with only an `error` object in the body | 502 "...no usable answer." (logged as `finish_reason: unknown`) | same | Sometimes |
| Provider slower than 55 s | 504 "The AI service took too long." | "The AI service answered with status 504." | Sometimes, but each costs up to 55 s |
| Network error from the function to OpenRouter | 502 "...unavailable." | status 502 | Usually |
| In memory rate limit (more than 20 calls a minute from one IP on one instance) | 429 "Too many requests. Please wait a moment." | "The AI service answered with status 429." | No, not within the minute |
| Key or model not set | 500 "The AI service is not configured." | status 500 | No |
| Prompt over 8,000 characters or bad body | 400 "Invalid request." | status 400 | No (cannot happen today: prompts are under 3,500) |
| Netlify kills the function at 60 s, or a platform error | Netlify's own error page (status not verified) | "The AI service answered with status N." | Sometimes |
| No answer in 65 s in the browser | none | "The AI request timed out." | Sometimes |
| No network in the browser | none | "Could not reach the AI service." | When back online |
| Reply not JSON or move out of range | 200 | the `parseReply` reason, for example `Move 7 is not in the list. Choose a number from 1 to 3.` | Yes, with the retry note |
| Engine look ahead fails (Medium and up) | none, no call is made | "The engine's look ahead failed, so the AI's moves could not be listed." | Retry button |

**What does not catch any of this in advance:** the health check (`src/ai/health.ts`, `healthCheck` in `aiMoveHandler.ts`) only reports whether `OPENROUTER_API_KEY` and `LLM_MODEL` are set. Today it answered `{"ready":true}` eight times while every real call failed with 402.

**Wording problem:** the hint says the AI "did not give a valid answer", but for a 402, 429 or timeout the model never answered at all. The real reason is only visible under Details, as a status number.

## Part 2: the live site

### What I could read

- Live site: https://checkervia.netlify.app (site name `checkervia`, no custom domain, functions in `us-east-2`, last production deploy 16 Nov 2026 12:01 UTC). Read with `netlify api getSite`; no secrets printed.
- Netlify account: the **legacy Free plan** (`type_slug` `free-is-free`, account created 15 Jun 2025, before the 4 Sep 2025 switch to credits). Its limits, from the Netlify API for this account: 125,000 function invocations a month, 100 GB hours of function time, 100 GB bandwidth, 300 build minutes. This matters for Part 6.
- Function logs: the Netlify CLI (`netlify-cli/23.9.1`) can only **stream** logs live (`netlify logs:function`); it has no history. So I could not summarise past errors. I streamed the log while I ran my own requests; everything in this part comes from that window.

### The measurement run

Script: the app's own `chooseMove`, `judgeMove`, `buildPrompt` and engine, calling the live function exactly as the browser does (same body, 65 s timeout, 3.5 s pause between turns), one game per level, the other side played by a scripted random player. Kept in the session scratchpad only, not in the project.

| Batch | Time (UTC, 16 Nov 2026) | Calls | Succeeded first call | Needed retries and then succeeded | Failed | Failure type |
|---|---|---|---|---|---|---|
| 1 | 21:19:38 to 21:19:44 | 16 (4 turns × 4 calls) | 0 | 0 | 16 (100%) | OpenRouter 402, insufficient credits |
| 2 | 17 Nov 2026, about 08:47 | 2 (single probes) | 0 | 0 | 2 (100%) | the same 402, still "can only afford 432": no credit was added or spent in the 11 hours between |

- Latency of the failed calls: median 409 ms, 90th percentile 536 ms, maximum 637 ms (round trip from Karachi to Ohio plus a function time of 43 to 182 ms in the log).
- Batch 2 latency: 2,555 ms for the first probe (a cold start: the function had been idle for hours) and 789 ms for the second.
- I stopped at 18 of the 40 calls you approved. Until credits are added every call returns the same 402, so the rest would have measured nothing new. The remaining 22 calls are best spent after the top up (to do item 6). A 402 is refused before the model runs, so these calls cost nothing.
- **Not measured, because of the 402:** the success latency (median, 90th percentile, maximum), the share needing retries, timeouts, 429s, empty answers, and the reasoning tokens against answer tokens. To measure tokens you would also need the key or the OpenRouter Activity page, which lists the tokens of each generation, including reasoning. The function only returns `text`, by design.
- **Best available latency evidence** (from `docs/03-technical/ai-opponent.md`, live checks through `netlify dev` on 12 and 13 Nov 2026, about 90 calls): 1.0 to 14.4 s per reply, typical 1.3 to 5.6 s, median about 3 s; in one run 3 of 10 turns took about 14 s; no retries, no rejected answers.

### Cold start against warm

The health check (`GET`, no model call) was measured twice, 4 requests each:

| | First request (cold) | Next 3 (warm) |
|---|---|---|
| Browser round trip | 1,241 ms and 1,003 ms | 357 to 391 ms |
| Function duration in the log | 46 ms and 15 to 31 ms | 4 to 9 ms |

A cold start adds about 0.6 to 0.9 s, mostly connection setup and starting the instance. That is small next to a model call, so **warming the function is not worth doing**. Most of the warm time is the distance from Pakistan to Ohio.

### Prompt and reply sizes (measured from the code)

Built offline with the app's own code over 24 random games (708 AI turns, no network). Tokens are counted roughly (words, digits and punctuation marks), so treat them as an estimate within about 15%.

| Level | Prompt characters, median (max) | Tokens, median (max) | AI turns per game |
|---|---|---|---|
| Easy | 3,098 (3,290) | about 843 (933) | 21 to 40 |
| Medium | 3,142 (3,260) | about 847 (884) | 19 to 40 |
| Hard | 3,122 (3,235) | about 838 (870) | 20 to 40 |
| Strongest | 3,326 (3,472) | about 872 (905) | 20 to 27 |

(Games were capped at 40 AI turns.) Including the chat format, an input of **about 1,000 tokens per call**. The visible answer (`{"move", "reason", "reaction"}`, each text at most 20 words) is about 50 to 90 tokens. Reasoning tokens at `low` effort: **not verified**; I assume 100 to 400. So output is about **150 to 500 tokens per call**. A game is about **30 AI turns, about 32 calls**.

## Part 3: OpenRouter limits and pricing

Sources: https://openrouter.ai/docs/api/reference/limits, https://openrouter.ai/docs/guides/routing/provider-selection, https://openrouter.ai/docs/guides/routing/model-fallbacks, https://openrouter.ai/docs/api/reference/errors-and-debugging, https://openrouter.ai/docs/guides/best-practices/reasoning-tokens, https://openrouter.ai/api/v1/models/openai/gpt-oss-120b/endpoints, all read 17 Nov 2026.

### Limits that apply to you

- `openai/gpt-oss-120b` is a paid model. Paid variants "have no platform level request cap"; per IP burst limits and provider side 429s can still apply.
- Free (`:free`) models: 20 requests a minute, and 50 a day if you have bought less than 10 credits in total, 1,000 a day otherwise. The page still shows an unrendered placeholder for the exact threshold, so it is not fully verified. `openrouter.ai/openai/gpt-oss-120b:free` returned 404, so I could not confirm a free variant of your model.
- **Credits:** before a request runs, OpenRouter checks that the balance can pay for the prompt plus `max_tokens` of output. If not, it answers 402. That is today's error ("You requested up to 1500 tokens, but can only afford 432"). With `max_tokens` 1500 this happens a little before the balance reaches zero. The 402 can also come from a per key credit limit or from `in_flight_budget_exhausted` (too many requests running at once for a small balance; that one has a `Retry-After` header). The key's state can be read with `GET https://openrouter.ai/api/v1/key` (`limit`, `limit_remaining`, `usage_daily`, `usage_monthly`).
- A negative balance can make even free models fail (limits page).
- Fee for buying credits: 5.5% with a minimum of $0.80 by card, 5% by crypto. These figures come from third party pages (for example https://apicostcalc.com/blog/openrouter-credit-fee-is-5-5-not-5-percent.html); **not verified** on an OpenRouter page.

### Price of `openai/gpt-oss-120b` per provider (per million tokens)

From the endpoints JSON. "Schema" = supports `response_format` and structured outputs; every endpoint supports the reasoning parameters. Latency and throughput were empty (`null`) in the JSON on 17 Nov 2026, so per provider speed is **not verified**.

| Provider | Input | Output | Schema | Max output | Uptime, last day |
|---|---|---|---|---|---|
| Near AI (fp4) | $0.03 | $0.15 | yes | 117,964 | 99.93% |
| Venice (int4) | $0.03 | $0.15 | **no** | 32,768 | 100% |
| CoreWeave (fp4) | $0.03 | $0.17 | yes | 117,964 | 100% |
| DekaLLM (bf16) | $0.03 | $0.18 | yes | 117,964 | 99.04% |
| AkashML (fp4) | $0.03 | $0.187 | yes | 117,964 | 100% |
| DeepInfra (bf16) | $0.037 | $0.17 | yes | 117,964 | 97.29% |
| Prime Intellect (fp4) | $0.043 | $0.091 | yes | 65,536 | 100% |
| Crusoe (bf16) | $0.05 | $0.25 | yes | 117,964 | 100% |
| Sail Research, DigitalOcean (no schema), Mancer | $0.06 to $0.08 | $0.375 to $0.42 | mixed | | |
| Google Vertex | $0.09 | $0.36 | yes | 117,964 | 99.93% |
| BaseTen, Parasail | $0.10 | $0.50 to $0.75 | yes | | 99.3 to 99.7% |
| SambaNova | $0.14 | $0.95 | **no** | | 99.92% |
| Groq, Together, Nebius, SiliconFlow, Amazon Bedrock (no schema) | $0.15 | $0.60 | mostly yes | | 91.9 to 100% |
| Cerebras (fp16) | $0.35 | $0.75 | yes | 40,960 | 100% |

Because the proxy sends `require_parameters: true` with `response_format`, OpenRouter skips the providers marked "no" (Venice, DigitalOcean, SambaNova, Bedrock).

### How routing works

- **Default:** OpenRouter weighs each provider's measured price, throughput, latency and reliability; providers near the best share most of the traffic at random, and a provider with many errors or 429s gets none until it recovers. If an attempt fails before any token is sent, OpenRouter tries another provider by itself (`allow_fallbacks`, default `true`).
- **Sorting:** `provider.sort` can be `"price"`, `"throughput"` or `"latency"`. Model suffixes do the same: `:nitro` sorts by throughput, `:floor` by price. `preferred_max_latency` and `preferred_min_throughput` (p50 to p99, over a rolling 5 minutes) move slow providers to the end of the list rather than removing them. `order`, `only` and `ignore` pin or exclude providers. `max_price` refuses providers above a price.
- **Fallback models in one request:** yes, a `models` array in priority order; "any error can trigger" the next one, including rate limits and downtime, and you pay for the model that answered (named in the response's `model`). The page's examples use the Responses API; that `models` works on the Chat Completions endpoint this project uses is **not verified** on that page.
- **Reasoning effort:** levels `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. Where an effort is turned into a token budget, `low` is about 20% of the output limit and `minimal` about 10%. Reasoning tokens count against `max_tokens` and are **billed as output tokens**, even when hidden with `exclude`. If reasoning uses the whole limit, the answer is empty with `finish_reason: "length"`. Whether `gpt-oss-120b` accepts `minimal` or `none` is **not verified** (OpenRouter says to check the model's `reasoning.supported_efforts`). Lower effort means fewer output tokens: lower cost and lower latency, roughly in proportion.
- **Errors:** body `{ "error": { "code", "message", "metadata" } }`. 400 bad request, 401 bad key, 402 credits, 403 moderation or a budget limit, 408 timeout, 429 rate limit, 502 model down or invalid response, 503 no provider meets your routing rules. `Retry-After` comes with 429, 503 and the in flight 402. **Important for this code:** a non streamed request can get a `200 OK` whose body holds only an `error` object and no `choices`, and OpenRouter tells you to check for `error` even on a `200`. `readProviderResponse` treats that as "no usable answer" and logs `finish_reason: unknown`, so the real cause is lost.

### Monthly cost estimate

Per game: about 32 calls × 1,000 input tokens = 32,000 input tokens, and 32 × 150 to 500 = about 5,000 to 16,000 output tokens.

| Route | Cost per game | 100 games | 1,000 games | 10,000 games |
|---|---|---|---|---|
| Cheapest providers (`:floor`, about $0.03 / $0.17) | $0.002 to $0.004 | $0.20 to $0.40 | $2 to $4 | $20 to $40 |
| Mid price ($0.15 / $0.60, for example Groq) | $0.008 to $0.015 | $0.80 to $1.50 | $8 to $15 | $80 to $150 |
| Fastest, most expensive (Cerebras, $0.35 / $0.75) | $0.015 to $0.023 | $1.50 to $2.30 | $15 to $23 | $150 to $230 |

Add about 5.5% for the credit purchase fee. Default routing will land somewhere between the first two rows; I could not measure where. Shorter output (lower `max_tokens`, less reasoning, shorter `reason`) is the biggest saving.

## Part 4: alternatives

Prices per million tokens, from the official pages read on 17 Nov 2026: OpenAI https://developers.openai.com/api/docs/pricing; Anthropic https://platform.claude.com/docs/en/about-claude/pricing; Google https://aistudio.google.com/docs/pricing; Groq https://console.groq.com/docs/models and https://console.groq.com/docs/structured-outputs; DeepSeek https://api-docs.deepseek.com/quick_start/pricing; Together https://www.together.ai/pricing; Cerebras https://www.cerebras.ai/pricing. "Per game" is my arithmetic for 32 calls of 1,000 input tokens and about 80 visible output tokens, plus 200 reasoning tokens for reasoning models.

| Option | Input / output | Per game | Typical latency for this prompt | JSON reliability | Free tier |
|---|---|---|---|---|---|
| `gpt-oss-120b` via OpenRouter (today) | $0.03 to $0.35 / $0.09 to $0.95 | $0.002 to $0.023 | 1 to 14 s measured earlier | strict schema on most providers | no |
| `gpt-oss-20b` on Groq | $0.075 / $0.30 | about $0.005 | under 1 s expected (about 1,000 tokens/s per Groq; my estimate) | strict schema supported | not verified (Groq's rate limit tables conflict) |
| `gpt-oss-120b` on Groq directly | $0.15 / $0.60 | about $0.012 | about 1 s expected (about 500 tokens/s) | strict schema supported | not verified |
| Claude Haiku 5.5 (Anthropic) | $0.10 / $0.50 | about $0.004 | not verified | structured output not verified on the pricing page | not verified |
| OpenAI `gpt-5-nano` (reasoning) | $0.05 / $0.40 | about $0.005 | not verified | not verified on the pricing page | none listed |
| OpenAI `gpt-4o-mini` (no reasoning) | $0.15 / $0.60 | about $0.006 | not verified | not verified on the pricing page | none listed |
| Gemini 2.5 Flash Lite (Google) | $0.10 / $0.40 | about $0.004 | not verified | not verified | "free of charge" free tier; its rate limits **not verified**; price from a summary of the page |
| Gemini 3.5 Flash Lite | $0.30 / $2.50 | about $0.016 | not verified | not verified | free tier listed |
| DeepSeek `deepseek-flash` | $0.15 / $0.60 off peak, double at peak | about $0.006 to $0.012 | not verified | JSON output mode; schema not verified | not verified |
| Together `gpt-oss-120b` | $0.15 / $0.60 | about $0.012 | not verified | not verified | not verified |
| Cerebras | direct price not listed; $0.35 / $0.75 through OpenRouter | about $0.02 | fastest class (not measured) | schema yes (via OpenRouter) | one time $5 credit, card required |
| Your own open model | see Part 8 | GPU $300+ a month (estimate) | depends on hardware | weaker without constrained decoding | n/a |

**Recommendation for a move picker where the engine already ranks the moves:** the model's real job is the personality line; the move choice adds very little, because it only chooses among the engine's best 3 to 5 moves and picked a top scored move almost every time in earlier tests. So choose for speed and price, not reasoning power. Best fit: **keep OpenRouter, but switch to a small fast model with a fallback list**, for example `openai/gpt-oss-20b` (reasoning low) first, with `openai/gpt-oss-120b` or a non reasoning small model second, sorted by latency. Second choice: Groq directly with `gpt-oss-20b` and strict JSON schema. A Gemini or Haiku model is a good third option if their latency proves better. In every case, the engine fallback in Part 5 matters more than the model you choose.

## Part 5: reliability fixes to recommend (not implemented)

Ranked by effect on "the AI could not make a move".

| Rank | Fix | Expected effect | Complexity | Money |
|---|---|---|---|---|
| 1 | **Keep the OpenRouter account funded:** add credits now; set a low balance email alert; check the key has no small per key limit. | Ends today's failure at once. | none | the credits |
| 2 | **Engine fallback:** if the model has not given a valid move within the time budget, or any call fails, play the engine's move at once (top candidate; at Easy a random one from the list), and take the reaction from the local line banks (`src/ai/lines.ts`, `linesGentle.ts`, `linesFierce.ts`, already used for idle lines). Keep Retry only for impossible cases. | The game can never stall. A model outage becomes a quieter AI, not a broken game. | small to medium: `chooseMove` and `aiController.ts` already have every input; tests exist to extend | saves money (fewer retries) |
| 3 | **A total time budget per turn of 8 to 12 s**, enforced in the browser across all attempts, then fix 2. Lower `PROVIDER_TIMEOUT_MS` to about 10 s to match. | Worst wait drops from about 4 minutes to about 10 s. | small | none |
| 4 | **Do not retry errors that cannot recover** (401, 402, 403, 500 "not configured", 429 from our own limiter); say so to the player. Pass a reason code (for example `credits`, `timeout`, `rate`) from the function instead of one generic 502, and log the real OpenRouter `error` object, including on a `200`. | No wasted calls; the log names the real cause; the player sees the right text. | small | none |
| 5 | **`max_tokens` about 600 instead of 1500** (still room for reasoning at low effort; keep the empty answer check). | OpenRouter's pre check needs a smaller balance; fewer tokens can be spent on runaway reasoning. | trivial | small saving |
| 6 | **A faster or non reasoning model plus a `models` fallback list, sorted by latency** (Part 4). | Typical reply under 2 s instead of about 3 s, fewer long tails, one provider outage no longer fails a turn. | small (config plus a test with a real key) | similar or lower |
| 7 | **Retry with a short backoff** (for example 0.5 s, then 1.5 s, honouring `Retry-After`) and only for timeouts, 429, 5xx and empty answers. | Rides out short provider blips without hammering. | small | none |
| 8 | **Clearer player messages:** "The AI is taking a short break, so it played the engine's move" for fallbacks; separate texts for offline, service down and busy. Make the health check report "not ready" when the last real calls failed (or when `GET /api/v1/key` shows no credit), so the home badge stops saying ready. | Players understand what happened; you notice problems sooner. | small | none |
| 9 | **Shorter prompt:** move the fixed rules to the start (already the case) and cut repeated text; drop the full rules list for levels where only the engine's best 3 to 5 moves are offered. | Perhaps 20 to 30% fewer input tokens; small latency gain. | small, needs a new prompt version and live checks | small saving |
| 10 | **Shared rate limit in Supabase** (the leaderboard already has `rate_limits` and a counting function in `leaderboard-migration.sql`), or Netlify's platform rate limiting. | Real abuse protection across instances; today's per instance memory resets often. | medium; adds one database round trip per move (about 50 to 150 ms) | none on the free plan |
| 11 | **Hedged requests:** if the first call has no answer after about 4 s, send a second in parallel and use whichever answers first. | Cuts the slow tail. | medium | up to double the model cost on slow turns |
| 12 | **Streaming** | Little for this app: the reply is a 3 field JSON object, so nothing useful can be shown early. | medium | none |
| 13 | **Warming the function** | Saves about 0.6 to 0.9 s on a cold start only (measured above). Not worth it. | small | uses invocations |

## Part 6: where to host at launch

Sources, all read 17 Nov 2026: Netlify https://www.netlify.com/pricing/, https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/, https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-legacy-plans/legacy-pricing-plans/; Cloudflare https://developers.cloudflare.com/workers/platform/pricing/, https://developers.cloudflare.com/workers/platform/limits/, https://developers.cloudflare.com/pages/platform/limits/; Vercel https://vercel.com/pricing, https://vercel.com/docs/functions/limitations; Render https://render.com/docs/free; Fly.io https://docs.fly.io/about/pricing; Railway https://railway.com/pricing; Hetzner https://www.hetzner.com/cloud/cost-optimized/; domains https://cfdomainpricing.com/ (third party, updated 16 Nov 2026) and https://porkbun.com/products/domains.

### What your app uses per game

About 32 AI calls, 1 health check and 2 to 4 leaderboard calls: **about 37 function invocations per game**. AI calls wait about 3 s on the model at 1,024 MB, so about 0.03 GB hours of function time per game. First visit downloads about 0.75 MB before compression (`index` JS 536 KB, CSS 173 KB, font 18 KB). For the player columns below I assume **3 AI games per player per month**.

### Platforms

| Platform | Free tier | What it can and cannot do for you | 100 players (300 games) | 1,000 players (3,000 games) | 10,000 players (30,000 games) |
|---|---|---|---|---|---|
| **Netlify, your legacy Free plan** | 125k invocations per site a month, 100 GB hours of function time, 100 GB bandwidth (hard limit), 300 build minutes (hard limit); sync functions 60 s | Works as today. The limits are reached at about **3,400 games a month** (both the invocation and the time limits). Above that, a legacy site moves to a paid functions level (forum: 2M invocations, then $19 to $25 add ons; **not verified** on an official page) or gets functions disabled; other users report sites disabled. No WebSockets. | $0 | $0 (about 110k invocations: close to the limit) | over the limit: paid level, price not verified |
| Netlify, credit plans (what you would get if you switch; you cannot switch back) | Free: 300 credits a month, then the **whole site is paused** until the next cycle. Compute 10 credits per GB hour, 2 credits per 10k requests, 20 per GB, **15 per production deploy** | About 0.3 credits per game plus deploys: Free runs out near **800 to 1,000 games** if you deploy 5 times a month. Personal $9 (1,000 credits), Pro $20 (3,000 credits), extra 1,500 credits for $10 on Pro. | $0 | Personal $9 to Pro $20 | Pro, about $40 to $60 (estimate) |
| **Cloudflare Workers + static assets** | 100,000 requests a day; 10 ms CPU per request (waiting on `fetch` does not count); no wall clock limit while the client is connected; static asset requests free and unlimited; no bandwidth charge | Fits this app well: your functions already use Web `Request`/`Response`. Durable Objects (SQLite) and WebSockets on the free plan for online rooms later. Needs a port from the Netlify wrappers and a new rate limit approach. | $0 | $0 | $0 (about 37k requests a day) or $5 paid for safety |
| Vercel Hobby | 1M invocations, 4 hours active CPU (I/O waiting does not count), 100 GB transfer, 300 s max duration; cannot buy more | Technically fits. Whether Hobby forbids commercial use (ads, payments) is **not verified** from the pages read. Pro $20 per seat. | $0 | $0 | $0 if non commercial, else $20 |
| Render | Free web service sleeps after 15 minutes idle, about 1 minute cold start, 750 hours a month; static sites free | A 1 minute cold start breaks an AI move; only a paid instance (price **not verified**) is usable. | $0 static, paid for API | paid | paid |
| Fly.io | No free tier for new accounts; bills under $5 a month are waived | Always on `shared-cpu-1x` 256 MB at $2.19 a month runs a small Node server and WebSockets. You manage it. | about $2 to $4 (waived under $5) | about $4 to $7 | about $7 to $15 |
| Railway | Free $1 credit a month; Hobby $5 including $5 of usage | Fine for a small server with WebSockets. | $0 to $5 | $5 | $5 to $10 |
| Hetzner VPS | none; CX23 (2 vCPU, 4 GB, 20 TB traffic) €5.99 a month before VAT, shown "unavailable" on 17 Nov 2026 | Full control, cheapest at scale, but you handle TLS, updates, restarts, backups and attacks. | €6 | €6 | €6 |
| Oracle Cloud Always Free | page returned 403 | **not verified** | | | |

**Custom domain:** a `.com` costs about $10.46 a year at Cloudflare Registrar (at cost; third party price list) or $11.81 at Porkbun. Netlify Free includes custom domains with SSL. To connect: buy the domain, add it under Netlify Domain management, then either point the registrar's nameservers to Netlify DNS, or keep the registrar's DNS and add a `CNAME` for `www` to `checkervia.netlify.app` and the apex records Netlify shows; SSL is issued automatically.

### Recommended launch setup

1. **Launch on Netlify as is.** Do **not** move this account to a credit plan: the legacy Free plan gives you about 3,400 games a month, while credit Free would pause the whole site at about 1,000.
2. Add a custom domain (about $10 to $12 a year).
3. Watch invocations in the Netlify dashboard. With fix 2 and fix 3 from Part 5 there are fewer calls per game.
4. When you pass about 2,500 games a month, or when you build online rooms, move the functions (and the static site) to **Cloudflare Workers**: free up to about 100,000 requests a day, $5 a month after that, and Durable Objects for live rooms. Supabase Realtime is the alternative for rooms if you stay on Netlify.

## Part 7: Supabase pricing and limits

Sources, read 17 Nov 2026: https://supabase.com/pricing, https://supabase.com/docs/guides/platform/billing-on-supabase, https://supabase.com/docs/guides/realtime/limits, https://supabase.com/docs/guides/platform/compute-and-disk, https://supabase.com/docs/guides/platform/free-project-pausing.

| | Free | Pro ($25 a month, includes $10 compute credit = one Micro project) |
|---|---|---|
| Database | 500 MB per project, Nano compute (shared, up to 0.5 GB RAM) | 8 GB disk included, then $0.125 per GB |
| File storage | 1 GB | 100 GB, then about $0.021 per GB |
| Egress | 5 GB plus 5 GB cached | 250 GB plus 250 GB cached, then $0.09 per GB |
| Auth users (MAU) | 50,000 | 100,000, then $0.00325 each |
| Realtime | 200 concurrent connections, 2M messages a month, 100 messages a second | 500 connections, 5M messages, then $10 per 1,000 connections and $2.50 per million messages |
| Connections | 60 direct, 200 pooled | Micro: same |
| Pausing | **paused after 1 week of inactivity**; restorable from the dashboard (the docs say both 90 days and 1 year; not verified which is current) | never paused |
| Backups | **none** | daily, kept 7 days; point in time recovery $100 a month extra |
| Projects | 2 active | per compute |
| Spend cap | quotas only | on by default |

### When your usage would reach each limit

Tables from `docs/07-deployment/leaderboard-migration*.sql`. A win row holds the full move list as `jsonb` (`moves`, about 60 moves of 2 to 4 square numbers), `stats` `jsonb`, a 64 character hash and UUIDs: about **2 to 4 KB with its indexes** (estimate). A `game_results` row is about 0.3 KB. With about half of games won (the live database had 20 player wins in 36 games), 1,000 games add about 2 MB.

- **Database 500 MB:** about 250,000 games. Not a launch concern. Check that `rate_limits` rows are cleaned up over time (I did not verify a cleanup job).
- **Egress 5 GB:** leaderboard pages are a few KB each, so hundreds of thousands of views. Not a concern.
- **Realtime (online rooms later):** a 60 move room game is about 120 delivered messages plus presence, so 2M messages is about 15,000 room games a month, and 200 connections is about 100 games at the same moment. The first real limit for rooms.
- **Pausing:** the real launch risk. A quiet week (for example before launch, or between promotions) pauses the database and the leaderboard stops working.
- **No backups:** one bad migration or deletion loses every profile and win.

### Before launch

1. Keep the project awake: a scheduled job that makes a tiny database request each day (a Netlify scheduled function or a free GitHub Actions cron calling `get-ai-stats`), or move to Pro at $25 a month once there is income.
2. Take a manual backup (`pg_dump` or `supabase db dump`) weekly, and before every migration.
3. Make sure the service role key is only in Netlify's environment, never in the browser (already the design).

## Part 8: can I run my own server?

**What really costs money:** the model calls, and even they are small: about $0.002 to $0.02 per game. Hosting the static site and eight small functions is free on Netlify (legacy) or Cloudflare up to thousands of games a month. Today's outage was not a hosting problem at all: an empty OpenRouter balance.

**Can a self hosted server or free tier VPS replace Netlify functions?** Yes, technically: a small Node server on Fly.io ($2 to $4), Railway ($5) or Hetzner (about €6) can run the same handlers and WebSockets for rooms. But you take on TLS, restarts, updates, logs, abuse and backups, for a saving of $0 compared with the free tiers. Cloudflare Workers gives the same "free forever" result without a server to look after.

**Hosting an open model yourself:**
- **GPU:** an always on cloud GPU that can serve an 8B to 20B model is roughly $300 to $600 a month (my estimate; GPU prices **not verified** in this report). At 10,000 games a month you would pay about $20 to $230 through OpenRouter instead. Not worth it below hundreds of thousands of games.
- **CPU VPS:** a 1B to 3B model on 2 to 4 shared vCPUs reads a 1,000 token prompt and writes 80 tokens in roughly 10 to 30 s per move (estimate, **not measured**), and small models follow JSON instructions less reliably without constrained decoding. Too slow for one player, and much worse for many.
- **Could a small local model play well enough?** For the move, yes: the engine already picks the best 3 to 5 moves, so even a random choice among them plays at about the level's strength. The model mainly adds the reaction line. The local line banks already cover that in a simpler way.

**What can be free forever:** the engine and the look ahead (they run in the player's browser); the static site; the functions on Netlify legacy Free or Cloudflare Workers Free; Supabase Free with a keep awake job (and your own backups); the local reaction lines. The only cost that grows with players is the model, and with the engine fallback even that becomes optional: if the money runs out, the game still plays.

**Recommendation:** do not run your own server or model now. Launch on Netlify (legacy Free) with Supabase Free (kept awake, backed up by hand) and OpenRouter with a funded balance and the engine fallback. Expected monthly cost: **$0 to $3 at 100 players, about $3 to $25 at 1,000 players, about $25 to $250 at 10,000 players** (almost all of it model calls; the low end with a cheap or small model, the high end with the fastest providers), plus about $1 a month for a domain. Move the functions to Cloudflare Workers ($0 to $5) when you pass about 2,500 games a month or start online rooms; consider Supabase Pro ($25) once the leaderboard matters to paying users.

## Recommended plan for launch, with costs

| Item | Choice | Monthly cost |
|---|---|---|
| AI model | OpenRouter, a small fast model with a fallback list, `max_tokens` about 600, balance alert | about $0.005 to $0.01 per game |
| Turn safety | engine fallback after 8 to 12 s or any error; local reaction lines | $0 |
| Site and functions | Netlify legacy Free (stay off credit plans) | $0 up to about 3,400 games |
| Database | Supabase Free, daily keep awake ping, weekly manual backup | $0 |
| Domain | `.com` at Cloudflare Registrar or Porkbun | about $1 ($10 to $12 a year) |
| Later | Cloudflare Workers for functions and rooms; Supabase Pro | $0 to $5; $25 |

## Ranked to do list

1. Add OpenRouter credits now and set a low balance alert; check the key's own credit limit. (Fixes today's failure.)
2. Engine fallback with local lines, so a turn never ends in "The AI could not make a move".
3. A total turn budget of 8 to 12 s and a matching provider timeout.
4. Stop retrying 401, 402, 403 and our own 429; pass a reason code; log OpenRouter's `error` object, also on a `200`.
5. Lower `max_tokens` to about 600.
6. Try `gpt-oss-20b` or another small fast model with a `models` fallback list; measure latency with the 22 unused test calls.
7. Make the health check reflect real calls or the credit balance.
8. Supabase: keep awake job and a backup routine.
9. Custom domain.
10. Plan the move to Cloudflare Workers before about 2,500 games a month or online rooms.

## What I could not determine

- Success latency, retry rate, timeout rate, empty answer rate and the reasoning against answer token split on the live site: every live call failed with 402. Run the measurement again after adding credits.
- Past function errors: the Netlify CLI only streams logs, it does not keep history.
- Whether the 402 comes from the account balance or a per key limit (the error text allows both; reading it would need the key).
- Per provider latency and throughput for `gpt-oss-120b` (OpenRouter's endpoints JSON had `null` values on 17 Nov 2026).
- Whether `models` fallback works on Chat Completions, and whether `gpt-oss-120b` accepts `minimal` or `none` effort.
- The exact Netlify behaviour and price when a legacy Free site passes 125k invocations.
- Free tier rate limits for Gemini Flash Lite, Groq and Together; OpenAI and Anthropic structured output support from their pricing pages; Render paid prices; Oracle Always Free; Vercel Hobby's commercial use rule; OpenRouter's purchase fee from an official page.
- Real token counts (my counts are an estimate from word and symbol counts).
