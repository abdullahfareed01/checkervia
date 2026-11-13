# System Architecture

## Layers
1. **Engine** (`src/engine`): pure TypeScript. Board, moves, legal move generation, applying a move, win detection. No UI, no network.
2. **State** (`src/state`): game state and transitions (reducer). Holds board, current player, selection, mode, status. Calls the engine.
3. **UI** (`src/ui`): React components. Render state, dispatch actions. No rule logic.
4. **AI** (`src/ai`): builds the prompt from engine output, calls the proxy, validates the reply against the legal list, handles retries.
5. **Leaderboard shared** (`src/leaderboard`): pure rules used by both the browser and the leaderboard functions: username rules, UTC periods, the ranking order, the country list and the wire format (D56). Imports only the engine and `src/ai` (the word lists and the level type).

Dependency direction: `ui` → `state` → `engine`; `ai` → `engine`; `leaderboard` → `ai`, `engine`; `state`/`ui` trigger `ai`. The engine imports nothing from other layers. Server code in `netlify/` may import `src/engine` and `src/leaderboard`; nothing in `src/` imports `netlify/`.

## Folder structure
```
.
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── netlify.toml
├── .env.example              # names only: OPENROUTER_API_KEY, LLM_MODEL (real .env is never committed)
├── netlify/
│   ├── aiMoveHandler.ts      # proxy request handling (pure, tested with a fake fetch)
│   ├── rateLimiter.ts        # best-effort per-instance rate limit
│   └── functions/
│       └── ai-move.ts        # thin Netlify wrapper; reads the key from the environment
├── src/
│   ├── main.tsx
│   ├── engine/
│   │   ├── types.ts          # Board, Piece, Move, Player
│   │   ├── board.ts          # initial setup, helpers
│   │   ├── moves.ts          # legal move generation, forced capture
│   │   ├── apply.ts          # applyMove, crowning
│   │   ├── status.ts         # winner / no moves detection
│   │   ├── index.ts          # public API
│   │   └── *.test.ts
│   ├── state/
│   │   ├── gameReducer.ts    # state + transitions: click, newGame, setMode, AI actions (pure)
│   │   ├── routes.ts         # choosing between routes to the same square
│   │   ├── selectors.ts      # highlights, counts, "game in progress"
│   │   ├── aiController.ts   # runs one AI turn, dispatches the result (no React)
│   │   ├── history.ts        # position on screen, arrows enabled or not, move list
│   │   ├── moveFacts.ts      # engine-checked facts about a move (for the AI reason popup)
│   │   ├── useGame.ts        # the only React code in state/
│   │   └── *.test.ts
│   ├── learn/
│   │   ├── lessons.ts        # the Learn script: scenes, moves, captions
│   │   ├── frames.ts         # script -> frames; every move checked against the engine
│   │   ├── playback.ts       # autoplay timing, Back/Next/scene targets (pure)
│   │   └── *.test.ts
│   ├── ai/
│   │   ├── prompt.ts         # all prompt text, version label, board and move list
│   │   ├── parseReply.ts     # model text -> move number (+ optional model reason), or why not
│   │   ├── chooseMove.ts     # retry loop + validation, model call injected
│   │   ├── index.ts          # public API
│   │   ├── client.ts         # callModel: POST to /.netlify/functions/ai-move, with timeout
│   │   ├── health.ts         # GET health check: ready / offline / unreachable
│   │   ├── difficulty.ts     # the four AI levels: turns ahead, moves offered, Easy slips
│   │   ├── candidates.ts     # the level's best few moves (deterministic, for the server too)
│   │   ├── language.ts       # word lists, language rules, the dash sanitizer and the 140 character cap
│   │   ├── lines.ts          # local line banks: picking without repeats (banks in linesGentle.ts, linesFierce.ts)
│   │   ├── endgame.ts        # proven loss (resign hint) and tips after the AI wins
│   │   ├── search.ts         # look-ahead: negamax + alpha-beta, scores every legal move
│   │   ├── searchWorker.ts   # runs the search in a Web Worker
│   │   ├── analyzer.ts       # worker with timeout and fallbacks; never fails a turn
│   │   ├── judge.ts          # engine verdict on the player's move (blunder / great) for AI reactions
│   │   └── *.test.ts
│   └── ui/
│       ├── Root.tsx          # screens: splash, home, rules, game
│       ├── Splash.tsx        # splash + logo (same markup as index.html)
│       ├── Home.tsx          # home menu with AI status
│       ├── HowToPlay.tsx     # rules page
│       ├── Learn.tsx         # Learn mode screen
│       ├── useLessonPlayer.ts # Learn playback state and autoplay timer
│       ├── learn.css         # Learn styles
│       ├── useAiStatus.ts    # health check at start, splash fade
│       ├── ConfirmButton.tsx # button that asks first (New game, Menu)
│       ├── LevelDialog.tsx   # asks for the AI level when Play vs AI is chosen
│       ├── LevelOptions.tsx  # the four levels as a radio list (dialog and Menu sheet)
│       ├── MenuSetup.tsx     # mode and level at the top of the game's Menu sheet
│       ├── consent.ts        # 18+ consent steps and the stored acceptance (version, time)
│       ├── ConsentDialog.tsx # the consent steps, and the gate in front of Strongest
│       ├── TermsDialog.tsx   # Terms and notices (draft text, contact email)
│       ├── TopBar.tsx        # back arrow, crowned title (GameTitle), Menu list
│       ├── ConfirmDialog.tsx # "are you sure?" popup for actions that lose a game
│       ├── RulesDialog.tsx   # the rules over the game (from the Menu)
│       ├── chrome.css        # the look from mockup/mockup_design.png
│       ├── sheet.css         # the Menu sheet (bottom sheet on phones), loaded last
│       ├── ChatBubble.tsx    # the AI's chat bubble in a fixed slot, with a live region
│       ├── bubble.ts         # what the bubble shows: typing, idle, hint, reaction, greeting
│       ├── usePersonality.ts # greeting, idle lines, resign hint, end of game line and tips
│       ├── idleTimer.ts      # 30 and 60 second idle timer; the tips reveal
│       ├── session.ts        # this tab's wins and losses (sessionStorage)
│       ├── ResignButton.tsx  # Resign with a confirmation sheet
│       ├── LanguageInfo.tsx  # what the 18+ badge explains
│       ├── useMediaQuery.ts  # phone and landscape phone queries
│       ├── useAiExplanation.ts # the AI move on screen: label, reason, engine facts
│       ├── gameView.tsx      # helpers: board view, player cards, win reason
│       ├── useAiLevel.ts     # remembers the chosen level in the browser
│       ├── menu.css          # home and rules styles
│       ├── App.tsx           # the game screen
│       ├── Board.tsx
│       ├── Square.tsx
│       ├── Piece.tsx
│       ├── StatusBar.tsx     # turn, winner, "AI is thinking", fallback with Retry
│       ├── ModeSelector.tsx  # Two players / Play vs AI
│       ├── PlayerCard.tsx    # card above/below the board: icon, name, pieces, to move
│       ├── ResultDialog.tsx  # end-of-game popup with stats
│       ├── AiMoveNote.tsx    # "AI played E3 → D4" and "Why?" in the side panel
│       ├── WhyContent.tsx    # what "Why?" shows, inline or as a phone sheet
│       ├── aiReason.css      # styles for the two above
│       ├── HistoryControls.tsx # history arrows, "Move x of y", move list
│       ├── useHistoryView.ts # when to animate (one step forward only); arrow keys
│       ├── notation.ts       # move text for the list, e.g. "8,3 → 6,5 → 4,7 ×2"
│       ├── useResultPopup.ts # opens the popup after the last move; game time
│       ├── devScenarios.ts   # DEV ONLY: ?scenario=win|lose|duel (not in production)
│       ├── icons.tsx         # inline SVG person, robot, trophy, crown
│       ├── RouteOverlay.tsx  # last move: route line, numbered landings, crossed captures
│       ├── MovingPiece.tsx   # last move animation (Web Animations API)
│       ├── moveGeometry.ts   # pure route and keyframe maths (tested)
│       ├── NewGameButton.tsx
│       └── styles.css
├── tests/                    # cross-layer tests
├── assets/
├── docs/
└── references/
```

## Key engine API
- `initialBoard(): Board`
- `getLegalMoves(board, player): Move[]`
- `applyMove(board, move): Board`
- `getWinner(board, playerToMove): Player | null`

## Data flow (human move)
Click → UI dispatch `select` / `move` → reducer asks engine for legal moves → engine validates and applies → new state → UI rerenders.

## Data flow (AI move)
1. The human (Black) plays a move. The reducer sets `aiPhase = "thinking"` and a new `aiRequestId`. The board is locked.
2. `useGame` sees the new request id and calls `startAiTurn` (`state/aiController.ts`).
3. `chooseMove(board, "white", callModel)` builds the prompt and calls `callModel` (`ai/client.ts`).
4. `callModel` POSTs `{ prompt, retryNote? }` to `/.netlify/functions/ai-move`.
5. The function (`netlify/aiMoveHandler.ts`) validates and rate limits the request, adds the retry note, and calls OpenRouter with the key from `OPENROUTER_API_KEY` and the model from `LLM_MODEL`. It returns `{ text }` only.
6. `parseReply` checks the number against the legal list. Invalid answer or error: retry up to 3 times.
7. Success: dispatch `aiMoved` with the request id. The reducer plays the move through the same `playMove` as a human move, only if it is in `legalMoves`.
8. Failure: dispatch `aiFailed`. The UI shows the fallback message and a Retry button; the board stays locked; no move is played. Retry dispatches `aiRetry` (new request id) and runs the flow again.

Stale replies: New game, a mode change and Retry all change `aiRequestId`. The reducer ignores any `aiMoved` or `aiFailed` whose id is not the current one, and the hook's effect cleanup also cancels the pending request.

## Serverless proxy (`netlify/`)
- `POST` only. Body `{ prompt: string, retryNote?: string }`, nothing else; prompt at most 4000 characters, retryNote at most 500. Anything else gets a short generic error.
- Reads `OPENROUTER_API_KEY` and `LLM_MODEL` from the environment. Never returns the key or raw provider errors; never logs the key.
- Request to OpenRouter: `max_tokens` 1500, `reasoning: { effort: "low" }`, `response_format` as a JSON schema for `{ move: integer }`, `provider: { require_parameters: true }`.
- If the provider refuses `response_format` (status 400, 404 or 422), the proxy asks once more without it. An empty reply or a missing message is an error, so the client throws and `chooseMove` retries.
- Timeouts: Netlify stops the function at 60 s (fixed), the provider call at 55 s, the browser request at 65 s.
- Rate limit: best effort, in function memory (see `ai-opponent.md` for what that can and cannot do).

## Leaderboard functions (`netlify/leaderboard`, D56)
- One pure handler per function in `netlify/leaderboard/handlers/`, each a one line wrapper in `netlify/functions/` through `serve()` in `netlify/leaderboard/netlify.ts`, the same split as the AI proxy.
- Storage sits behind `LeaderboardStore` (`store.ts`): `supabaseStore.ts` for Postgres (service role key, the SQL in `docs/07-deployment/leaderboard-migration.sql`) and `memoryStore.ts` for tests.
- `replay.ts` replays a claimed win through the real engine from the starting position; `security.ts` makes tokens and hashes with Web Crypto; `http.ts` holds body parsing, errors, the token check and the rate limits (kept in the store, so they hold across function instances).

## Rules
- Engine never mutates inputs.
- Moves have a stable id (index in the legal list), so the AI picks an id, not free form coordinates.
- The proxy only forwards the prompt; validation is in the app code, not in the function or model.
- The reducer never decides a move for the AI. It only plays one that is in `legalMoves`.
