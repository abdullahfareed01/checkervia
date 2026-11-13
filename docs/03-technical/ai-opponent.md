# AI Opponent Design and Prompt Log

## Design
- The model never invents moves. The engine computes all legal moves for the AI player (`getLegalMoves`).
- The model only answers with the number of one move from a numbered list.
- Our code checks the number against the list before anything is played. The move that comes back is always an object from the engine's list, and the reducer plays it only if it is in the state's legal moves.
- `src/ai` has no React and no API key. The only network code is `client.ts`, which talks to our own function. The model call is injected into `chooseMove`, so tests use fake models.
- Provider: OpenRouter (`https://openrouter.ai/api/v1/chat/completions`), model `openai/gpt-oss-120b`. Variables: `OPENROUTER_API_KEY` and `LLM_MODEL`, read only by the Netlify function.
- In the game the human plays Black and the AI plays White.

## Flow of one AI turn
1. The human moves. The reducer sets `aiPhase = "thinking"` with a new `aiRequestId`; the board is locked.
2. `chooseMove` builds the prompt (same text for every attempt) and calls `callModel`.
3. `callModel` POSTs `{ prompt, retryNote? }` to `/.netlify/functions/ai-move`. The function calls OpenRouter and returns `{ text }`.
4. `parseReply` extracts a move number, or says why it cannot.
5. Valid: `moves[number - 1]` is dispatched as `aiMoved` with the request id. Invalid or error: record the reason, build a retry note, go to step 2.
6. After 1 + 3 attempts with no valid answer: dispatch `aiFailed`. The UI shows the fallback message and a Retry button. Nothing is played and the board stays locked.
7. A reply for an old request id (New game, mode change, Retry) is ignored by the reducer.

## Difficulty levels and look-ahead (prompt v3; square names since v4)
- Levels: Beginner (no look-ahead), Casual (2 turns), Strong (4 turns), Expert (6 turns). See D36.
- For levels 2 to 4 the prompt gets a block before the move list ("Engine look-ahead: for every move below, the game engine tried every possible sequence of moves for the next N turns ..."), and each move line ends with `| score +1.0` (material lead in pieces after best play) or `| forced win in 3 turns`, `| forced loss in 2 turns`, `| wins the game at once`.
- Example line: `5: (3,4) -> (5,2) | captures (4,3) | score +1.0`.
- The search runs in a Web Worker. Fallbacks: a worker error or a 10 s timeout gives a 2-turn search on the page; any other look-ahead problem gives a Beginner prompt. A turn never fails because of the look-ahead.
- The proxy accepts prompts up to 8000 characters (the tested worst case is well below).

## Prompt format (version v2, still the base of v3)
All prompt text lives in `src/ai/prompt.ts` (`PROMPT_VERSION = "v3"`). v2 differed from v1 only in the reply instruction: `{"move": <number>, "reason": "<why>"}`, the reason being one short sentence of at most 20 words. The example below is v1; apart from that one line it is unchanged. Order:
1. Rules summary and the reply instruction.
2. The position as a text grid.
3. Legend, direction of play, and which side the model plays.
4. The numbered legal moves.

Example for the opening position, black to move:

```
You are playing checkers on an 8x8 board.

Rules:
- A piece moves one step diagonally forward onto an empty square.
- A capture jumps diagonally over an opponent piece into the empty square behind it. A capture may continue with more jumps in the same turn.
- Capturing is mandatory. Kings move and capture both forward and backward.
- A piece that reaches the far row becomes a King.
- You win when the opponent has no pieces or no legal moves.

The legal moves are already worked out for you. Choose exactly one move from the list.
Reply with exactly {"move": <number>}, where <number> is the number of your chosen move. Write nothing else.

Position (rows 1 to 8 from the top, columns 1 to 8 from the left):
  1 2 3 4 5 6 7 8
1 . w . w . w . w
2 w . w . w . w .
3 . w . w . w . w
4 . . . . . . . .
5 . . . . . . . .
6 b . b . b . b .
7 . b . b . b . b
8 b . b . b . b .

b = black piece, B = black king, w = white piece, W = white king, . = empty square.
Black moves up toward row 1. White moves down toward row 8.
You are playing Black.

Legal moves, as (row,column):
1: (6,1) -> (5,2)
2: (6,3) -> (5,2)
3: (6,3) -> (5,4)
4: (6,5) -> (5,4)
5: (6,5) -> (5,6)
6: (6,7) -> (5,6)
7: (6,7) -> (5,8)
```

- Rows count from the top and columns from the left, starting at 1, the same as the UI labels.
- Move line format: `N: (row,col) -> (row,col)`, then ` | captures (r,c), (r,c)` if it captures. A multi jump also gets ` | route (r,c), (r,c)` listing every landing square, because two chains can start and end on the same squares.
- v1 has no strategy hints on purpose. Hints are a later prompt change, so their effect can be measured.

## Reply format
- Exactly `{"move": <number>}` and nothing else.
- `parseReply` is forgiving about wrapping and strict about the value:

| Reply | Result |
|---|---|
| `{"move": 3, "reason": "Takes a piece."}` | accepted; the reason is kept for the "Why this move?" popup |
| `{"move": 3}` (no reason, or a reason that is not text) | accepted; the popup says no reason was given |
| JSON inside a code fence, or with words before or after it | accepted |
| Extra fields in the JSON, e.g. `{"move": 3, "why": "..."}` | accepted (only `reason` is read) |
| A reason longer than 200 characters | accepted; the reason is cut to 200 characters. Whitespace is collapsed. |
| Same move stated twice | accepted |
| `3.0` | accepted (it is a whole number) |
| Number below 1 or above the list length (0, -2, 99) | rejected: not in the list |
| Decimal such as `2.5` | rejected: must be a whole number |
| `"3"` (string), `null`, `true`, `[3]` | rejected: must be a number |
| No JSON, broken JSON, no `"move"` field, empty text | rejected: no `"move"` field found |
| Two different moves in one reply | rejected: more than one move |

## Retry rule
- Total calls: 1 plus up to 3 retries, so at most 4 (`maxRetries = 3`).
- A rejected answer and a thrown error (network, timeout, server error, empty answer) both use up one attempt.
- On a retry after a rejected answer, `callModel(prompt, retryNote)` also gets a note:
  `Your previous answer was rejected: <reason> Reply with exactly {"move": <number>} using a number from 1 to <count>, and nothing else.`
- After an error there is no answer to explain, so the next call has no note.
- The client sends the note as its own field and the proxy appends it to the prompt it forwards.
- After the last attempt fails, `chooseMove` returns `{ ok: false, reasons, attempts }`. The UI shows the fallback message with Retry. Nothing is played, and there is never a random or guessed move.

## Provider request (reasoning model)
`openai/gpt-oss-120b` is a reasoning model, so:
- `max_tokens: 1500`. Reasoning tokens count against this limit, so it must leave room for thinking plus a tiny `{"move": n}` answer. If reasoning uses it all, OpenRouter returns an empty `content` with `finish_reason: "length"`.
- `reasoning: { effort: "low" }` to keep replies fast.
- An empty `content`, no choices, or a missing message is treated as a failed attempt (the proxy answers 502, the client throws, `chooseMove` retries).

### Structured output and providers that refuse it
- The request asks for `response_format` as a JSON schema for `{ move: integer }` (`strict: true`, `additionalProperties: false`).
- `provider: { require_parameters: true }` tells OpenRouter to route only to providers that support every parameter in the request, instead of silently ignoring some.
- If no provider supports the combination, or the provider rejects it (the proxy treats status 400, 404 and 422 this way), the proxy asks once more without `response_format`, keeping the other parameters. This is logged on the server only.
- If that also fails, the proxy answers 502 and the attempt counts as failed.
- `parseReply` is the final guard in every case: it does not care whether the provider honoured the schema.
- Not confirmed from the OpenRouter docs: whether `openai/gpt-oss-120b` is served by a provider that supports both `response_format` and `reasoning.effort`. The first real test will show; see "Testing with a real key".

## Serverless proxy (`netlify/`)
- Health check: `GET /.netlify/functions/ai-move` answers `{ "ready": true }` or `{ "ready": false }` (key and model set or not). It never calls the provider and is not rate limited. The splash screen and home menu use it (D34).
- `netlify/functions/ai-move.ts` is a thin wrapper. The logic is `handleAiMove` in `netlify/aiMoveHandler.ts`, a pure function that takes a fake-able `fetch`.
- POST only (405 otherwise). Body: `{ prompt: string, retryNote?: string }` and nothing else. `prompt` is required, non-empty, at most 4000 characters; `retryNote` at most 500. Anything else gets 400 `Invalid request.`
- Returns `{ text }` (the model's message content) or `{ error }` with a short generic message. Never the key, never a raw provider error. Provider details go to the function log only, with the key blanked out.
- Statuses: 400 bad body, 405 wrong method, 429 rate limited, 500 not configured, 502 provider problem or empty answer, 504 provider timed out.
- Each request is a single user message. Nothing from earlier turns is stored.

### Timeouts (checked against the current docs)
- Netlify synchronous functions: 60 s, shown as not configurable in the "Default values" table of docs.netlify.com "Configuration for functions". The plan does not change it there, so there is nothing to raise.
- Older Netlify forum threads mention 10 s (26 s on Pro). These conflict with the current docs and are probably out of date. If a real call ever dies near 10 s or 26 s, that is why.
- Provider call: gives up at 55 s (`PROVIDER_TIMEOUT_MS`), 5 s before Netlify would kill the function, so we can still answer with a clean 504. One deadline covers the optional second call.
- Browser: waits 65 s (`CLIENT_TIMEOUT_MS`), longer than the function, so the function's own error arrives first.
- These are ceilings. With low reasoning effort a normal answer should take a few seconds. A turn can take up to 4 attempts, so the worst case is long; that is why the UI shows "AI is thinking" and can fall back.

### Rate limiting: what it can and cannot do
- What it is: an in-memory counter per client, 20 requests per 60 s. The client is identified by the `x-nf-client-connection-ip` header, which Netlify sets itself. Refused requests are not counted, and memory is capped at 1000 clients.
- Why only best effort: Netlify runs functions as short-lived instances that do not share memory. Each instance has its own counter, a new instance starts at zero, and instances are recycled when idle. A determined caller who spreads requests across instances, or waits for a restart, gets past it. It slows a casual flood of requests from one address; it is not a guarantee and not a budget control.
- Real protection, in order of strength: (1) a spending cap or credit limit on the OpenRouter key, which holds no matter what; (2) at deploy time, Netlify's code-based rate limiting, which runs at the platform edge (config `rateLimit` with `windowLimit`, `windowSize`, `aggregateBy`; it needs a `path` in the function config, cannot live in `netlify.toml`, and can take up to 10 s to start blocking). It was not added now because it needs a custom path and I cannot verify it without deploying; (3) the size and shape limits above, which stop one request being expensive.

## Testing
- Fake models in `src/ai/*.test.ts`: valid first reply, invalid then valid, out of range, decimal, zero, negative, garbage, JSON with extra text, four bad replies (exactly 4 calls), a model that throws, and the retry note containing the reason.
- Fake fetch in `tests/aiMoveHandler.test.ts` (proxy: validation, limits, empty answers, fallback without `response_format`, timeouts, key never returned or logged, rate limit) and `src/ai/client.test.ts` (client).
- `src/state/aiMode.test.ts` and `aiController.test.ts`: AI turn flow, lock while thinking, fallback with Retry, stale replies after New game or a mode change.
- No test calls a real API.

## Testing with a real key (by hand)
See the README for setup (`netlify dev`). Things to look at:
- The terminal running `netlify dev` prints server-side messages from the function (for example "structured output refused" or "reply had no usable content"). They never contain the key.
- The fallback panel has a "Details" section with the reasons for each failed attempt.
- Count how many AI turns needed a retry, and how long a turn takes. Those go in the prompt log.

## Metrics for the write up
- Rejected-answer rate per prompt version.
- Average latency per move.
- Subjective play quality.

## Prompt log
Add a row for every prompt version. Fill in the result after real testing.

| Version | Date | Change | Result |
|---|---|---|---|
| v1 | 2026-11-12 | Baseline: rules summary, board grid, direction statement, numbered legal moves, JSON reply `{"move": <number>}`. No strategy hints. | First live check (10 AI turns, scripted Black, through `netlify dev`): 10 calls, 0 rejected answers, 0 retries, 0 illegal moves, 0 fallbacks. The proxy never needed the "without response_format" fallback. Latency 1.0 to 14.4 s, median about 3 s; 3 of 10 turns took about 14 s. Play strength not judged yet (the AI always picked a legal move, forced captures included). Needs a longer game and a human opponent. |
| v2 | 2026-11-12 | Reply asks for `{"move": <number>, "reason": "<why>"}`, the reason one short sentence (max 20 words). Proxy schema now requires `move` (integer) and `reason` (string). The reason is never checked and never decides anything: a reply is judged by its move alone. | Not run live yet. Tested with fake models only. To check: whether the reasons are sensible, and whether latency or the rejection rate changed compared with v1. |
| v3 | 2026-11-12 | Difficulty levels. Levels 2 to 4 add an "Engine look-ahead" block and a score per move line (2, 4 or 6 turns of full search by the engine). Prompt limit raised to 8000 characters. | Live check in headless Edge through `netlify dev`: 42 AI turns (3 per level, then 15 at Strong and 15 at Expert, scripted Black): 0 failures, 0 page errors, 2.0 to 5.6 s per turn. At levels 2 to 4 the model picked a top-scored move every time (36 of 36); after 15 turns the Strong and Expert AIs were 3 pieces ahead. |
| v4 | 2026-11-13 | Squares named as on the board: columns A to H, rows 8 (top) to 1 (bottom), e.g. `1: A3 -> B4`; the board grid has letters on top and rows 8 to 1; directions now "Black moves up toward row 8". Nothing else changed. | Live check (headless Edge, `netlify dev`): 8 AI turns at Beginner and Expert, 0 failures, 0 page errors; Expert chose a top-scored move 4 of 4. Replies took 3.7 to 13 s (v3 had 2.0 to 5.6 s); the prompt is the same size, so this is most likely provider speed varying between runs; keep watching. |
| v5 | 2026-11-13 | Reply is `{"move", "reason", "reaction"}`. Before the move list, one line about the opponent's last move: after an engine-judged blunder, ask for a gentle playful tease (max 15 words, never insulting); after a great move, warm praise; otherwise `set "reaction" to ""`. | Live check (headless Edge, `netlify dev`, `?scenario=react`): 3 blunders, 3 friendly teases ("Oops, a little slip there, huh?", "Nice try, but that slip cost you a piece!", "Oops, that slip lost you a piece!"); 2 safe moves, no reaction. 0 failures, replies in 1.4 to 2.9 s. |
| v6 | 2026-11-13 | Trash-talking rival persona; a reaction after every player move (engine verdict added when there is one); the AI's last 3 lines quoted so it does not repeat itself; no "Nice try", no "pawns"; limits: about the game only (no slurs, hate, real-world personal topics, sex or threats). | Live check (headless Edge, `?scenario=react`, real model): first try had 6 of 6 lines opening with "Nice try" and used "pawn"; after the variety rules, 6 different, much sharper lines (e.g. "What a brain-fart, moving into my capture—now you'll eat dust!", "Your move was as stale as week-old coffee, time to brew some real trouble."), all about the game; 0 failures, replies in 1.2 to 2.7 s. The model's lines are not checked: one called a forward move "stepping back". |
