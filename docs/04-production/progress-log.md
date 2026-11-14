# Progress Log

## 12 Nov 2026: Task 1 done (board rendering)
- Project set up by hand (not the Vite template) to match `architecture.md`: Vite, React 19, TypeScript strict, Vitest. Plain CSS, no Tailwind.
- Engine: `src/engine/types.ts` (Player, Piece, Position, Board, Move), `board.ts` (`BOARD_SIZE`, `isDarkSquare`, `initialBoard`), `index.ts` public API. No React imports.
- Tests: `src/engine/board.test.ts`, 12 passing (12 pieces each, dark squares only, black rows 0 to 2, white rows 5 to 7, rows 3 and 4 empty, all men, fresh board per call).
- UI: `App`, `Board`, `Square`, `Piece` render the starting position; pieces are CSS discs.
- Checks: `npm test` passes, `npm run build` passes (about 69 KB gzipped JS), dev server serves on port 5173.
- `.gitignore` covers `node_modules`, `dist`, `.env*`.

## 12 Nov 2026: Tasks 2 to 6, rules engine (UI not wired yet)
- Part A: orientation changed to match the mockup. White on rows 0 to 2 moving down (crowns row 7); black on rows 5 to 7 moving up (crowns row 0). Updated `initialBoard`, `board.test.ts`, `core-mechanics.md`, `decisions-log.md` (D10 to D14). No UI code changed; the board renders from engine data.
- `Move` is now `{ from, to, path, captured }`.
- New engine files: `moves.ts` (`getLegalMoves`), `apply.ts` (`applyMove`), `status.ts` (`getWinner`), plus helpers in `board.ts` and `testUtils.ts` (test only board builder).
- Tests: 49 passing across `board`, `moves`, `apply`, `status`. Covers every case in the brief, plus a white capture, a King loop back to its start square, and a King contrast case for mid chain crowning.
- Mutation check: I broke three rules on purpose. Allowing rejumps and blocking the start square were both caught. Stopping on the crown row changed nothing, because a regular piece has no forward jump left there. I removed that redundant check (D13).
- Backlog: engine parts of tasks 2 to 6 ticked. Still open: click to move UI with turn alternation (task 2) and winner announcement with board lock (task 6).

## 12 Nov 2026: Playable two player game (finishes tasks 2, 6 and 7)
- State layer (pure TS, `src/state`): `gameReducer.ts` (state, `click` and `newGame` actions), `routes.ts` (choosing between routes to one square), `selectors.ts` (highlights, counts, in progress), `useGame.ts` (React hook, the only React file in the layer). State holds board, current player, selected square, legal moves, winner, mode (`"two-player"` only), plus pending routes, last move and moves played.
- UI: `App`, `Board`, `Square` (dark squares are buttons), `Piece`, `StatusBar`, `NewGameButton`. Components only render state and forward clicks. Legality always comes from `getLegalMoves`.
- Features: select and move, whole capture chain on one click, red glow on pieces that must capture, pieces without a legal move cannot be selected, deselect on same piece or elsewhere, route choice when two routes end on one square (D15), turn display, piece counts, Kings with a gold crown, winner banner with reason and locked board, New game with inline confirmation while a game is in progress.
- Tests: 106 passing in 9 files. New: `gameReducer.test.ts`, `routes.test.ts`, `selectors.test.ts`, `tests/app.smoke.test.ts` (first render), `tests/manual-script.test.ts` (the hand test click script, run against the real state layer). All 49 engine tests still pass.
- Not covered by automated tests: real clicks and styling in a browser (no DOM test library installed; adding one needs approval). To be checked by hand.
- Decisions: D15 to D17. Docs updated: `ui-ux-design.md`, `architecture.md`.

## 12 Nov 2026: AI opponent logic, no real API (part of task 8)
- New `src/ai` (pure TypeScript, no React, no network, no API key): `prompt.ts` (all prompt text, `PROMPT_VERSION = "v1"`, board grid, numbered moves, retry note), `parseReply.ts` (model text to a move number or a reason), `chooseMove.ts` (retry loop, model call injected), `index.ts`.
- `chooseMove(board, player, callModel, maxRetries = 3)`: 1 call plus up to 3 retries. Returns a move taken from the engine's legal list, or a failure with one reason per attempt. Never random, never unverified. A thrown error counts as a failed attempt. No legal moves means no call.
- Tests: 169 passing in 12 files (63 new in `src/ai`: prompt, parser, chooseMove with fake models, including exactly 4 calls on total failure and the retry note containing the reason). Engine, state and UI tests unchanged and passing.
- Mutation check: I broke four guarantees on purpose (an extra call, no upper range check, accepting decimals, never sending a retry note). Each made tests fail. Restored.
- Added to the prompt format beyond the brief: multi jump lines also show their `route`, so two chains with the same start and end are not identical lines (D18).
- Docs: `ai-opponent.md` filled in (flow, prompt format with example, reply table, retry rule, prompt log with a v1 row), `architecture.md` and `decisions-log.md` (D18) updated.
- Still open for task 8: real model client, serverless proxy, mode toggle and AI turn UI lock, UI fallback message.

## 12 Nov 2026: Task 8 finished, real AI mode (no real API call made)
- Proxy: `netlify/functions/ai-move.ts` (thin wrapper), `netlify/aiMoveHandler.ts` (pure `handleAiMove`), `netlify/rateLimiter.ts`. OpenRouter chat completions, model and key from `LLM_MODEL` and `OPENROUTER_API_KEY`. POST only, body limited to `prompt` (4000 chars) and `retryNote` (500), generic errors, key never returned or logged. Request uses `max_tokens` 1500, `reasoning.effort` low, JSON schema `response_format`, `provider.require_parameters`. Empty reply is an error. If the provider answers 400, 404 or 422 the proxy asks once more without `response_format`. Timeouts: Netlify 60 s (fixed per docs), provider 55 s, browser 65 s.
- Client: `src/ai/client.ts` (`callModel`, `createCallModel`), throws on any non 200 or empty text.
- State: `gameReducer` gained mode `vs-ai`, `aiPhase` (idle, thinking, failed), `aiRequestId` and actions `setMode`, `aiMoved`, `aiFailed`, `aiRetry`. New `aiController.ts` runs one AI turn; `useGame` starts it when a new request id appears and cancels it on cleanup.
- UI: `ModeSelector` (Two players or Play vs AI, with confirmation if a game is in progress), `StatusBar` shows "AI is thinking" and the fallback panel with Retry and Details, board locked while thinking or failed.
- Setup: `.env.example` (empty values), `!.env.example` added to `.gitignore` after `.env*`, `netlify.toml`, README steps for `netlify dev`. I did not open or read `.env`.
- Existing tests: two New game tests in `gameReducer.test.ts` now compare the reset state ignoring `aiRequestId` and also assert it moved on, because New game must change the request id to make stale replies detectable. No other existing test changed.
- Tests: 293 passing in 17 files (124 new). Fake model and fake fetch only. Mutation check: I broke ten guarantees on purpose (stale check, request id on New game, board lock, legality check of the AI's move, cancel, key redaction, empty answer check, fallback without `response_format`, `require_parameters`, prompt size cap). Each was caught. Restored.
- Not covered by tests: the real hook running in a browser, the real OpenRouter response, and whether `openai/gpt-oss-120b` is served with both structured output and reasoning effort. To be checked by hand with a real key.
- Decisions D19 to D23. Docs updated: `ai-opponent.md`, `architecture.md`, `tech-stack.md`, `risks-and-issues.md`, README.

## 12 Nov 2026: First live run with the real key
- Started `netlify dev` (port 8888; Netlify CLI 23.9.1 was already installed). It injected `OPENROUTER_API_KEY` and `LLM_MODEL` from `.env` (names only printed) and loaded the `ai-move` function. I stopped the plain Vite server on 5173 first, because `netlify dev` starts its own.
- Played 10 AI turns through the real state code (reducer, `startAiTurn`, real client, proxy, OpenRouter) with a temporary script (deleted). Result: 10 model calls, 0 rejected answers, 0 retries, 0 fallbacks, every AI move legal, including forced captures. No server warnings, and the proxy's "without response_format" fallback was never needed.
- Latency: 1.0 to 14.4 s per turn, median about 3 s, 3 of 10 turns near 14 s.
- Not done: a human game in the browser. The script stood in for the human and only ran the state and network path, not the React rendering.

## 12 Nov 2026: User feedback round 1
- The user played in the browser: "the board is working".
- Reported bug `BUG-001`: "AI is using illegal moves". Logged in `docs/06-qa/bug-tracker.md`, not reproduced yet.
- 8 feature requests, planned as task 10 in 8 phases (see backlog). Nothing built yet; waiting for the user's answers to 8 decisions.
- Started using `docs/06-qa/bug-tracker.md`; back filled three problems found and fixed during development (`DEV-001` to `DEV-003`).

## 12 Nov 2026: Task 10, phases 0 to 2
- User said to start; the open decisions were taken with my recommended defaults (listed in the backlog). No new libraries were added.
- **Phase 0 (`BUG-001`):** new `tests/engine-crosscheck.test.ts`: a second, independent rules implementation compared with the engine over 300 random games and 5,000 random boards (0 differences), invariant checks on every applied move, and 100 random vs AI games through the real reducer (every AI move legal). Breaking the engine on purpose in three ways made it fail, so the check works. Conclusion: the engine and AI path do not play illegal moves; the report is most likely the multi jump display (fixed in Phase 2) or a rules expectation. Waiting for the user to confirm.
- **Phase 1 (layout, cards, icons):** new layout in `App.tsx` and `styles.css`: desktop is two columns (board column, sidebar) sized to the window with no page scroll; narrow screens are one column. New `PlayerCard` above (White) and below (Black) the board: icon, name, side, pieces left, pieces taken, "To move", "Thinking…", "Winner". New inline SVG `HumanIcon` and `RobotIcon` (robot blinks and scans while thinking). In vs AI the cards say "AI" (robot) and "You"; in two player "White" and "Black".
- **Phase 2 (route and animation):** `RouteOverlay` draws the last move: a line through every square, an arrow, numbered landings for a multi jump, a red cross on each captured piece, in the mover's colour. `MovingPiece` animates the move with the Web Animations API: the piece hops along each landing, rising over each captured piece, which fades as it is jumped. The real piece on the destination stays hidden until the hop ends. Reduced motion users get the route without the animation. Geometry is pure and tested (`moveGeometry.ts`). State gained `previousBoard` (the board before the last move).
- Tests: 318 passing in 20 files. Typecheck and build clean (76 KB gzipped JS).
- Not verified: how it looks and moves in a real browser (no browser tool in this session; Playwright needs approval as a new dev dependency).

## 12 Nov 2026: Neon restyle (user feedback on the animation)
- User: the animation should look more professional, "a little neon", not solid borders.
- Route overlay redrawn as a neon trail (glow filter, halo, thin core, flowing dashes, breathing start ring, hollow numbered rings, neon red crosses with a burst). Moving piece glows in its side's colour. Solid borders replaced by glows on the selected square, last move squares, capture rings and the "to move" card (gentle pulse). Reduced motion turns all of it static. Decision D28.
- A test timed out once under load (`DEV-004`); fixed by giving the heavy cross check tests a 30 s limit.
- Tests: 318 passing. Build clean. Still not seen in a real browser by me.

## 12 Nov 2026: Result popup and new player cards (user feedback with two screenshots)
- User: "AI looks good". The win display was only sidebar text, the green neon on the winner's card was not good, and the AI card could look better.
- New `ResultDialog` (D29): opens after the final move's animation. "You win!" with trophy and confetti; "AI wins" with the robot; "<side> wins!" for two players. Stats table for both sides, total moves, game time, Play again and View board, plus "Show result" in the sidebar to reopen. The green winner glow is gone; the winner's card gets a gold crown.
- State now counts per side stats in `playMove` (moves, captured, Kings made, best multi jump); `src/state/stats.test.ts`. Game time is measured in the UI.
- `PlayerCard` redesigned (D30): neon ringed glass avatar, glowing robot and BOT badge for the AI, status with animated dots, 12 piece markers, captured pieces as small discs.
- Dev only scenarios `?scenario=win|lose|duel` (D31) to see the popup without a full game; not in the production build; tested.
- Tests: 340 passing in 23 files. Build clean (78 KB gzipped JS). One test writing slip on the way (I scripted an illegal move; the engine correctly ignored it and I fixed the test). Not seen in a real browser by me.

## 12 Nov 2026: Crown bug and Phase 3 (history)
- **`DEV-005`, huge yellow crown** (reported by the user): a generic `.icon { width: 78% }` rule, later in the stylesheet, overrode the 18px winner crown. Scoped it to `.avatar .icon`; the crown has its own `.card-name .icon-crown` size. Also made the King crown on pieces a bit smaller. Regression test `tests/css-icons.test.ts` reads the real stylesheet and fails if a bare `.icon` size rule comes back (checked by putting it back on purpose). On the way I found that a `?raw` CSS import is empty under Vitest, which would have made the test pass on nothing; it reads the file directly instead, with a two line type declaration (`tests/node-fs.d.ts`) instead of adding `@types/node`.
- **Phase 3, history (D32):** state keeps every position (`history`) and the one on screen (`viewIndex`); new `history` action; `src/state/history.ts` for the on screen position, arrow states and move list. UI: `HistoryControls` (first, back, forward, latest arrows; disabled ones greyed out; "Move x of y"; "Back to the game" while reviewing; clickable move list) and keyboard arrows. Reviewing is view only and locks the board. Only one step forward animates (`nextAnimationKey`, tested). `previousBoard` removed from state.
- Tests: 376 passing in 28 files (new: history state, history UI, notation, animation key, CSS icons). Build clean (79 KB gzipped JS). Not seen in a real browser by me.

## 12 Nov 2026: Phase 4 (AI reason popup)
- **Prompt v2:** the model replies `{"move": n, "reason": "..."}` (one short sentence). The proxy schema requires both fields. `parseReply` returns the reason as tidy plain text (cut at 200 characters). A missing reason never rejects a reply, and a reason never rescues a bad move. `chooseMove` and `aiController` pass the reason on, and the reducer stores it on the AI's history entry (D33).
- **Engine facts:** new `src/state/moveFacts.ts` works out from the board whether the move wins, captures (and that it was mandatory), crowns, how many legal moves there were, and whether the moved piece or others can be captured next turn.
- **UI:** `AiMoveNote` (a sidebar card after an AI move, with a reason preview and a "Why this move?" button) and `AiReasonDialog` (the popup: "In its own words", marked unchecked, and "Checked by the game engine"). They follow the history. Styles are in a new `aiReason.css` so `styles.css` does not grow further. The `DEV-005` icon test now covers that file too.
- Tests: 401 passing in 30 files (new: moveFacts, the reason in parser/chooseMove/controller/reducer, UI render incl. HTML escaping). Typecheck and build clean (80 KB gzipped JS). Mutation check: matching the danger square against the move's start instead of its end made a moveFacts test fail; restored.
- Not verified: the look in a real browser (Playwright MCP failed to connect this session), and real model reasons (no live call made; prompt v2 row in `ai-opponent.md` says so).

## 12 Nov 2026: `BUG-001` closed, Phase 5 (splash and home menu)
- User reviewed the game and asked to move on: `BUG-001` closed as fixed by Phase 2 (bug tracker updated).
- **Health check:** `GET` on the `ai-move` function answers `{ ready }` without calling the model and without counting against the rate limit. `src/ai/health.ts` turns it into ready, offline or unreachable and never throws.
- **Splash:** static copy in `index.html` (shows before the JavaScript), then `Splash.tsx` waits for the health check and fades out. No timer (D34).
- **Home menu** (`Home.tsx`): Play vs AI with an AI status badge and "Check again", 2 Players, How to play (`HowToPlay.tsx`). `Root.tsx` switches screens. Games have a Menu button. New game and Menu now share `ConfirmButton`. Dev scenarios still open straight on the game.
- Tests: 426 passing in 32 files (new: health check on the server and in the browser, splash, home, rules page, Menu button, and a test that the `index.html` splash matches the React one, which fails when the logo is changed in one place only; checked on purpose).
- Typecheck and build clean (82 KB gzipped JS).
- Not verified: the look in a real browser (no browser tool this session).

## 12 Nov 2026: Phase 6 (Learn mode)
- Four recorded lessons played by Gold Bot (Black) and Cyan Bot (White): first moves and forced capture (from the real opening, with a recapture), multi jump plus crowning plus a win by capture, a King capturing backward, and a win by blocking (no legal moves). Every move is checked against the engine when the frames are built. A wrong script throws with the scene and move number (D35).
- Learn screen: the game layout with a view only board (route, animation, red must capture glow), robot cards, a caption per move, engine facts (shared with the AI reason popup), Previous / Play Pause / Next, a lesson list and keyboard arrows. Reached from the home menu and the rules page.
- `boardFrom` moved from the test helpers into the engine (the lessons need it in production); the test helpers reexport it, so no test changed.
- Tests: 446 passing in 35 files (new: lesson frames incl. what each scene must show and four ways a bad script is rejected, playback timing and targets, Learn render; the CSS icon guard now covers every stylesheet). Typecheck and build clean (85 KB gzipped JS). All four scripts were legal on the first run.
- Not verified: the look and the autoplay in a real browser.

## 12 Nov 2026: AI reason not showing (`DEV-007`) and popup stacking (`BUG-002`)
- User saw "No reason given." on every AI move. One direct call to the function returned `{"move": 4, "reason": "Advances central piece towards promotion"}`, so model, proxy and schema were fine. In headless Edge the running `netlify dev` served an in between `parseReply.ts` that dropped the reason (missed file save, as in `DEV-006`). Resaved all sources and checked every served module. Now the note and popup show the reason.
- The same check found `BUG-002`: the route line was drawn over the popup. Fixed with a portal to `<body>`, plus a regression test.
- A nice example for the write up: the model said a move kept the piece "safe from immediate captures"; the engine fact next to it said "The moved piece can be captured next turn", and the engine was right.
- Tests: 447 passing. First real browser checks done this session (headless Edge over the DevTools protocol, since the Playwright tool cannot connect).

## 12 Nov 2026: AI difficulty levels with engine look ahead
- User asked for difficulty levels on a bar, for `gpt-oss-120b` to use every possible future outcome of each move, and for it to work without failing.
- New: `src/ai/difficulty.ts` (four levels), `search.ts` (scores every legal move by trying every sequence of moves 2, 4 or 6 turns ahead; continues through pending captures), `searchWorker.ts` and `analyzer.ts` (background thread, 10 s timeout, fallbacks), prompt v3 (a score per move), `DifficultyBar` (home menu and vs AI sidebar, remembered in the browser), look ahead lines in the "Why this move?" popup. Proxy prompt limit 4000 to 8000 characters (D36).
- Speed measured before choosing depths: 6 turns up to 0.66 s, 8 turns up to 6.1 s (left out).
- Tests: 484 passing in 38 files. New: the search gives exactly the same scores as a plain search without pruning (3 random games, depths 1 to 4), finds wins and forced losses, sees recaptures, avoids hanging a piece, Expert speed; prompt v3 and score wording; every level in `chooseMove`; a broken, slow or malformed look ahead never stops a turn; the worker fallback; no prompt can exceed the proxy limit; level in state (kept by New game and mode change); bar rendering. Two old tests changed: the version label, and a test helper that assumed the model is called at once (it now waits for the look ahead).
- Live check (my own `netlify dev` on port 8890, headless Edge, real model): 42 AI turns across all levels, 0 failures, 0 page errors, 2.0 to 5.6 s per turn. Expert popups said "Looking 6 turns ahead", so the worker ran (the fallback would say 2). At levels 2 to 4 the model chose a top scored move every time.
- Note: the user's own `netlify dev` on port 8888 had stopped; a plain Vite server was still on 5173. I did not touch it.

## 12 Nov 2026: Feedback round 2 (look, level popup, jank, speech bubble)
- **Calm look (D37):** every glow, pulse, breathing ring, flowing dash and burst removed from the four stylesheets, the splash and the route overlay. Flat accents instead.
- **Level popup (D38):** the slider is gone; Play vs AI (home, rules page, in game mode switch) opens `LevelDialog`. The AI's card shows the level badge (e.g. BOT · Expert).
- **Jank (`DEV-009`):** measured, fixed and measured again in headless Edge (details in the bug tracker).
- **Speech bubble (D39):** the AI's reason appears in a white bubble with a tail under its card; typing dots while it thinks; hides when you pick up a piece. Shared hook `useAiExplanation`; the popup moved to App (still a portal under `<body>`).
- `App.tsx` split: view helpers moved to `gameView.tsx` (file size rule).
- Tests: 494 passing in 39 files (new: level dialog, level badge, no slider anywhere, speech bubble incl. HTML escaping and reading time, explanation helper, long game guards). Typecheck and build clean.
- Browser check (my own `netlify dev` on 8890, real model, Expert level), desktop 1280x760 and phone 390x844: home has no slider; Play vs AI opens the level dialog; Expert gives the "BOT · Expert" badge; typing dots while the AI thinks; the bubble then shows the model's reason; "Why?" opens the popup with "Looking 6 turns ahead"; picking up a piece hides the bubble; no page errors. Screenshots looked right. Learn mode checked too.
- The user's own `netlify dev` (8888) still has its Vite on 5174 and needs a restart (`DEV-008`). My test servers and browsers were all stopped afterwards, including child processes.

## 12 Nov 2026: Speech bubble timing, readability and motion (D40)
- Bubble: stays until the player moves (or 20 to 40 s), see through and click through while a piece is held, bigger text with an "AI" label, curved tail under one shadow, pop in and shrink out animations. `SpeechBubble` now takes a `message` (key and text, or null), keeps the old text while it animates out, and can show "Why?" or not (ready for the planned reactions).
- Motion back without glow: route draw in (restarted per move with a key), landing numbers and crosses pop in, piece lift, hint pop in, route choice pulse, must capture ring breathing, turn bar slide in, emblem float, menu card lift. All off with reduced motion.
- Tests: 497 passing (bubble tests rewritten for the new API: no message, faded, optional Why?, 20 to 40 s timing). Typecheck and build clean.
- Browser check (headless Edge, my own `netlify dev` on 8890, real model): typing dots then the reason after 2.6 s; picking up a piece left the bubble at opacity 0.28 and a click on its text reached the board square underneath; playing the move replaced the reason with typing dots for the next turn; left idle, a 7 word reason disappeared after 20.2 s. Animations seen running: speech pop, typing, route draw, bar in, pop in small, piece lift. No page errors. Test server stopped afterwards (child processes too).

## 12 Nov 2026: Small screens, Phase 7 and release prep
- **Bubble on small screens:** on upright phones it now sits above the AI's card (over the header) with the tail pointing down, compact, buttons beside the text, so the board stays fully visible. On short landscape screens it is compact over the board's top edge.
- **Phone held sideways:** new two column layout (board sized from the height, slimmer cards without markers, sidebar scrolls; sections no longer squeeze on top of each other). A first version did nothing for some rules because the block sits before the base rules in the file and media queries add no specificity; fixed with selectors that start with `.app`.
- **Phase 7 sweep:** home, level dialog, game, bubble, "Why" popup, rules and Learn at 320x568, 360x740, 390x844, 414x896, 667x375, 844x390, 768x1024, 1024x768, 1024x640, 1366x768 and 1920x1080 in headless Edge with the real AI: no sideways scrolling, nothing sticking out, no page errors; screenshots reviewed.
- **Release prep:** browser tab icon (`public/favicon.svg`; the old 404 is gone, with a test), production build checked with `vite preview` (no console errors, no long tasks in 40 moves), deployment guide, release checklist, test plan, test cases, submission checklist and the write up drafted. Scope doc notes the items added by user feedback.
- Tests: 498 passing in 39 files. Typecheck and build clean.
- Left for the owner: GitHub push, Netlify deploy (accounts and key), a human game against the live AI, and the screen recording.

## 12 Nov 2026 and 13: Redesign after the mockup (D41)
- Built the look of `mockup/mockup_design.png`: top bar with back arrow, crowned title and Menu; segmented mode switch; richer player cards; framed board with A to H and 8 to 1; last move tint and ring; "Black to move" banner; AI move card; ornamental corners. New: `TopBar`, `ConfirmDialog`, `RulesDialog`, `chrome.css`, new icons (robot portrait, back, menu dots, two players, info, sparkle, laurel).
- Square names now follow the board labels everywhere, including the AI prompt (v4); `squareName` moved into the engine; Learn captions updated (D6, A5).
- Checked in headless Edge at 11 sizes (320x568 to 1920x1080, portrait and landscape): no sideways scrolling, nothing cut off, no page errors; menu, rules over the game and the back arrow work. Fixed on the way: a double space in "Black to move"; cramped cards on phones held sideways.
- Performance (`DEV-010`): development mode had slowed down again after the redesign; found with a trace and fixed (details in the bug tracker). Production: 9 to 11 ms per move.
- Live AI with prompt v4: 8 turns, 0 failures (see the prompt log).
- Tests: 500 passing in 39 files (updated for the new cards, square names and menu; new tests for the captured stack, "Your turn", the back arrow and the menu). Typecheck and build clean.

## 13 Nov 2026: AI reactions (D42) and the end of the redesign work
- Development mode smoothness after the redesign (`DEV-010`): the move list is computed only when the history changes, the history panel is memoised, and its scroll waits for the next frame. Cost per move no longer grows (66 ms at move 10 and move 30 in development; production 9 to 11 ms).
- **AI reactions:** `src/ai/judge.ts` judges the player's move with the engine (blunder or great move, else nothing); prompt v5 asks for one line in the same model call; the reaction is stored with the AI's move and shown first in the speech bubble (red tease, green praise); the popup shows the engine's verdict. Dev only `?scenario=react`.
- Tests: 525 passing in 41 files (new: judge rules with given scores and with the real engine, prompt v5, parser, chooseMove keeps a reaction only when asked, the whole path from a blunder to the bubble and popup, the bubble's reaction line, the react scenario). Typecheck and build clean.
- Live (headless Edge, real model): 3 blunders, 3 friendly teases; 2 safe moves, no reaction; 0 failures, 1.4 to 2.9 s per reply. Prompt v4 also checked live: 8 turns, 0 failures.

## 13 Nov 2026: Trash talk (D43)
- User asked for more aggressive replies with a free hand. Prompt v6: cocky rival persona, a reaction after every move, limits only to keep it about the game. The AI sees its last 3 lines so it does not repeat itself.
- Live check found the first version repetitive (every line opened with "Nice try") and using the chess word "pawn"; fixed with variety rules; the next 6 lines were all different and sharper.
- Tests: 530 passing in 41 files. Typecheck and build clean.

## 13 Nov 2026: Leaderboard work, phase 1: difficulty levels (D44)
- Git repository created; baseline commit on `main`; work on `feature/leaderboard`.
- Levels Easy (1 turn, all moves, random slips), Medium (2 turns, best 5), Hard (4, best 4), Strongest (6, best 3). The model only sees the offered moves; its number is checked against them. Prompt v7. A level is fixed per game; stored on AI history entries; chip on the AI card; Menu sheet with mode and level.
- Search time measured: up to 268 ms at 6 turns (median 25 ms).
- Tests: 559 passing in 43 files. Typecheck clean. Live: 8 real AI turns across the four levels, 0 failures.

## 13 Nov 2026: Leaderboard work, phase 2: 18+ consent, language rules, notices (D45)
- Language rules in code (`src/ai/language.ts`): clean at Easy to Hard; at Strongest insults, and mild swearing only after an engine verified blunder; the hard line everywhere; disguised spellings normalised; clean fallback lines. Prompt v8.
- Two step 18+ consent before Strongest, stored with time and notice version; "18+ · Strong language" label on the AI card; Terms and notices sheet (draft) from the Menu, home screen and the notice. Contact checkvia.games@gmail.com.
- No hyphens or dashes in player visible text: test over every screen; two old ones fixed; dashes stripped from the AI's lines.
- Browser checks (headless Edge): the consent flow at 1280x800 and 375x667 (No, Cancel, Terms over the notice, accept, not asked again); the 18+ label at 10 sizes from 320x568 to 1920x1080 and two landscape phones.
- Live: 8 real AI turns at Strongest and Medium, rules held; a non breaking hyphen slipped through once and is now caught.
- Tests: 666 passing in 46 files. Typecheck and build clean.

## 13 Nov 2026: Changes 1 to 4 from `docs/phases/Changes.md` (D46, D47, D48)
- Change 1: one dash sanitizer for all AI text (ranges, arrows, every hyphen and dash character, awkward cases); the engine's verdict and failure details cleaned; the prose of the README and 23 docs reworded (about 330 places; code, paths and identifiers left alone); tests for the UI and the docs.
- Change 2: only the compact line and the reaction show; "Why?" opens the engine's facts and the AI's own words.
- Change 3: chat bubble in a fixed slot under the AI card; checked at 320, 360, 375, 390, 430, 768, 1024 and 1440 wide and two landscape phones: the board never moved and the bubble never covered a square; everything fits at 375x667 (not at 320x568, as before).
- Change 4: line banks, greeting with a tab record, idle lines, resign in both modes, the engine proven resign hint, the game over panel with tips, the voice chip and the 18+ badge.
- Tests: 812 passing in 52 files. Typecheck and build clean; no secret or key name in the build.

## 13 Nov 2026: Owner's review of Changes 1 to 4 (D49)
- Idle lines no longer stop after two: the AI speaks every 30 seconds while the player waits (`?idle=fast`: every 3 seconds).
- The bubble is never red: after a blunder it stays neutral with the "Your slip" label; a line with 18+ words shows in red text, in the bubble and the game over panel.
- "Why?" opens as a floating card on every screen size, so the side panel no longer grows or shows a scroll bar.
- Browser check (headless Edge, the running dev server, real model) at 1180x882, 1024x700 and 375x667, Medium and Strongest: 4 different idle lines in 12 seconds; roast bubbles neutral (#f4efe6); red text only on lines with "crap", "hell" or "damn", a clean Strongest roast stayed dark; Why card 480px wide on desktop and a bottom sheet on the phone; the side panel never scrolled; no page errors.
- Second round: only the first idle line of a turn is read out by screen readers; the Why card closes with Esc (wherever focus is) and a tap outside, and gives focus back to the Why button (Esc and tap outside already worked; the focus return and Esc with focus off the card are new); the Terms show the leaderboard as "Coming soon" and say nothing is stored on our server today; a test builds the production bundle and checks that `?scenario=` and `?idle=fast` are not in it (it caught that Vite builds in development mode under Vitest, so the test forces production).
- Browser check (headless Edge) at 1180x882 and 375x667: idle lines changed every 3 seconds while the live region kept the first; Enter opened the card with focus on its close button; Esc (also with focus off the card) and a tap outside closed it with focus back on the Why button that opened it, for both Why buttons; the Terms show "Leaderboard · Coming soon"; no page errors.
- Tests: 819 passing in 53 files. Typecheck and build clean.

## 13 Nov 2026: Phone layout review (D50)
- One action bar (Menu, Previous, Next, Resign or Result, New game), same order at every width: fixed at the bottom on one column layouts, the bottom of the side panel on two. Header shows only "Checkervia"; no back arrow in the game (Main menu is in the Menu); hamburger icon.
- One level chip; the 18+ badge in the name row (11px). Coordinates in the squares' corners and a 3px frame: 44.1px squares at 375 wide. "Why?" 44 x 44. Last move: gold ring, no blue.
- Renamed Draft to Checkervia (header, home, splash, tab title, meta tags, favicon title, Terms, README, write up, docs).
- Browser check (headless Edge, the running dev server): 23 sizes from 327x650 to 1440x900 and five phones held sideways, every check passing (see D50); a real game at 375x650 and 1245x800: the bar never moved, Resign became Result in the same place, Previous and Next reviewed the game, the Menu sheet opened fully on screen with How to play, Terms and Main menu, the Resign sheet and the result panel covered the bar, two player mode the same; Learn and the home screen show the new name and corner coordinates. Problems found and fixed on the way: the dev server served a stale module once (touched the files); the side panel clipped the Menu sheet on desktop; phones held sideways squeezed the cards and the bar labels; a 568px wide phone held sideways got the upright phone rules; 540x720 pushed the status line under the bar; Learn kept room for a bar it does not have.
- Tests: 831 passing in 54 files (new `tests/action-bar.test.ts`; updated card, menu, history, Learn and level tests). Typecheck and build clean.

## 13 Nov 2026: Splash and winner screens after the mockups (D51)
- Splash rebuilt after `mockup/splash_screen_mockup.png`: gold corner frame, warm light, glossy logo pieces with sparkles, "Checkervia" in Fraunces Black, crown divider, CHECKERS, a gold progress bar with honest steps, board scenery with corner pieces. The static HTML and React show the same art (files in `public/art`).
- End of game panel rebuilt after `mockup/winner_screen.png` for all four results: crown, gold ring and laurels, a ribbon per result (red, green, dark, ivory), cream pill line, reason between gold lines, icon per stat with side coloured value pills, hourglass and stopwatch, gold Play Again and brown Review Game, bulb tips link, board scenery.
- Problems found and fixed on the way: the desktop scenery squares stretched very wide and the corner pieces crowded short screens; the panel scrolled to Play Again on phones held sideways, hiding the result; two player headings wrapped at 375 and the table was too wide at 327; the panel lost D49's red ink for 18+ words (its own colour loaded later); "1 moves in total".
- Tests: 834 passing in 54 files (splash bar steps and parity with index.html, the font file and licence, the four panels, the mockup's parts, "1 move"). Typecheck and build clean; the font and art are in the build.

## 13 Nov 2026: Feel work, phase A: settings, sound and haptics (D52)
- Settings store, Web Audio sound engine with one config file, haptics engine, the event map, hooks for the game and the app, and a development audition page at `?sounds`.
- Checked iOS Safari support for vibration (web search): still not implemented; some versions define navigator.vibrate as a function that does nothing, so iPhone and iPad are treated as unsupported.
- Browser check (headless Edge, a stand in for navigator.vibrate and a counter on the audio graph): a real sequence of taps gave a tick and 8 ms for a pick up, a softer tick for a put down, a thud and 15, 40, 15 for White's piece, the clack and 12 ms when the moved piece landed (about 220 ms after the tap, in step with the animation), the AI's capture with a heavy clack and 25 ms, a click, 6 ms and a whoosh for the Menu and a whoosh on closing it; no errors. Found: the AI's bubble pops about 300 ms before its piece lands (phase B moves it after the landing).
- Not verifiable here: how the sounds feel and their loudness (a headless browser has no speakers), real phone vibration, iPhone behaviour (the silent switch mutes Web Audio; audio needs a tap first).
- Tests: 905 passing in 55 files (new `tests/sound-haptics.test.ts`: settings defaults, save, load, corrupt data, version change, reduced motion default; the sound engine with a fake AudioContext: unlock, suspended state, hidden page, limiter, the 6 sound limit, envelopes, variation bounds, pan, ducking, a recording replacing a sound; haptics scaling, hidden page, iPhone detection; the event map for every event; click and move classification). The production build has no audition page and no audio files. Typecheck and build clean.

## 13 Nov 2026: Feel work, phase B: the move animation (D53)
- Pure planner, a small Web Animations player, the move layer, level and speed in the CSS, the input lock, the bubble after the landing, the shake, and the result panel and Learn timed by the plan.
- Browser checks (headless Edge, the running dev server): the AI's line appeared exactly when its piece landed (310 ms into a 300 ms capture hop), while the captured piece was still fading; a tap during my hop selected nothing; New game in the middle of a multi jump left no move layer, no hidden piece and 24 pieces; mid animation screenshots show the lift and the fading captures.
- Performance (headless Edge, 4x CPU throttling, 390x844, a production React build): multi jump 17.1 ms per frame on average (6 runs), single capture 16.9 ms (6 runs); target under 20 ms met. The development server is slower (about 18 to 26 ms) because of development React.
- Not verifiable here: how the animation feels (timing and easing are a matter of taste and need the owner's eye), and real phone performance (headless Edge is not a phone GPU).
- Found and fixed on the way: a stray file written outside the project twice by me (C:\NOMANT~1, left for the owner to delete; the safety check blocked my removal).
- Tests: 918 passing in 56 files (new `tests/animation.test.ts`: the planner for a step, a capture, a multi jump and crowning, step order and timing, Cinematic, speed, Off and Reduced; the player's keyframes, landings, unlock, cancel; the shake). Typecheck and build clean. Bundle since the start of the feel work: about 7 KB gzipped (114.6 KB script, 12.2 KB styles).

## 13 Nov 2026: Feel work, phase C: the AI voice (D54)
- Speech text preparation, voice choice and per level style, the voice engine with its rules, and the hooks (bubble lines, the game over taunt, Why, tips).
- The owner's dev server on 8888 stopped answering (its netlify dev process stayed alive but its proxy closed after its Vite restarted); I did not stop it and ran my own on 8890 with Vite on 5180 instead.
- Browser check (headless Edge on 8890, speech recorded by wrapping speechSynthesis, Windows voices present): no speech before the first tap; the first tap sent the silent warm up; the AI's line was spoken once, as its piece landed (about 400 ms after the capture began and 275 ms after a step began), in two games; picking up a piece cancelled it; New game cancelled it and read the new greeting. The best English voice picked was "Microsoft Sonia Online (Natural)". Found and fixed: the line was first spoken about 350 ms early and then again (see D54).
- Not verifiable here: how the voices sound (no speakers), iPhone behaviour (speech after a tap, the silent switch), and Android voices.
- Tests: 940 passing in 57 files (new `tests/voice.test.ts`: emoji, lol and lmao, haha, square names, arrows, symbols, the dash rule, the length cut; the level styles; the voice choice; never when off, hidden or before a tap; only the latest message; cancel; ducking; unavailable without speech or voices; the warm up; which switch each bubble line uses). Typecheck and build clean.

## 14 Nov 2026: Feel work, phase D: the Settings sheet (D55)
- The sheet, its controls, the board themes, piece styles, coordinate modes and highlight switches, the chat bubble switch, the Menu item and the home screen link.
- Browser check (headless Edge on my own netlify dev on 8890, at 375x650 and 1245x800): 47 controls, none under 44px, none unlabelled, no sideways scroll; changing the theme, pieces, coordinates and bubbles applied at once and was saved; Esc closed the sheet; Edge coordinates sat outside the squares (squares 44.1 to 41.4px on the phone); with bubbles off the slot went (desktop squares 64.8 to 72px); Reset asked first and restored every default; the home link opened it; no errors. Four option choices now wrap two by two on phones.
- Tests: 960 passing in 59 files (new `tests/settings-ui.test.ts` with faked vibration and voices, `tests/settings-ui-unavailable.test.ts` without them; the no dashes scan covers the sheet and the home link). Typecheck and build clean.
- Bundle since the start of the feel work: about 12 KB gzipped (118.5 KB script, 13.3 KB styles); no audio files.
- Note: during phase C the full test run once took 16 minutes and one speed test failed while the machine likely slept; the commit went through because the run was piped. It passes on its own (9.6 s) and in full runs since; runs are now checked by exit code.

## 14 Nov 2026: Leaderboard, phase 3: the server side (D56)
- SQL migration (`docs/07-deployment/leaderboard-migration.sql`), seven Netlify functions with pure handlers, the replay check of wins through the engine, rate limits per device and per hashed IP kept in the database, one storage interface with a Supabase adapter and an in memory adapter, the shared rules in `src/leaderboard` (usernames, UTC periods, ranking, countries, wire format), setup steps in the deployment guide, the Terms text rewritten (usernames, no tag, what is stored, reported counters, removal by email), still "Coming soon".
- Added `@supabase/supabase-js` for the functions only (approved by the owner); the production build test checks that it stays out of the browser bundle. A third variable, `LEADERBOARD_HASH_SALT`, keys the device and IP hashes.
- Not verifiable here: the SQL itself (no Postgres on this machine; the guide has a check query for the real project) and the functions under `netlify dev` with a real database. The Supabase adapter was tested against a fake HTTP layer instead.
- Tests: 1103 passing in 64 files (new in `tests/leaderboard/`: username rules, replay refusals, UTC week and month edges, tie breaking, every handler with the memory store, the adapter's requests, the wrappers without configuration). Typecheck and build clean. Bundle 118.8 KB gzipped script (the Terms text), 13.3 KB styles; no server code in it.

## 14 Nov 2026: Leaderboard, phase 3: the SQL tested (D56)
- Added `@electric-sql/pglite` as a dev dependency (approved by the owner) and `tests/leaderboard/migration.test.ts`: the migration runs in Postgres in process, after Supabase's roles and default grants are recreated. Checked: Row Level Security on all four tables, `anon` and `authenticated` refused on every table and function, the service role allowed, the username, country, level and move count constraints, duplicate game ids and moves, cascade on delete, the ranking order equal to `ranking.ts` (including a full tie), the week start and level filters, hidden players and wins left out, the per level stats and the rate limit function. No change to the migration was needed.
- Still not verifiable here: Supabase's API layer in front of the database (faked in the adapter test) and a real project.

## 14 Nov 2026: Leaderboard, phase 4: the screens (D57)
- The submit form in the result panel (and once more from the Menu or Settings), the leaderboard screen with tabs, periods, podium, list, pinned own row, paging and its loading, empty and offline states, the profile sheet with stats and the flag change, links from the home screen and the Menu, the Terms written as live. Flags from `flag-icons` (approved by the owner).
- Browser check (headless Edge on my own Vite server on 5180, the `?lb=` preview with the real handlers): 80 screenshots at 320x640, 360x740, 390x844, 768x1024 and 1280x800 of loading, populated, scrolled to the end, long names, two players only, empty, offline, a profile, the own profile, the new player form (empty, a taken name, a free name, saved), the one tap form, the form offline and the home screen. Each was checked by script for sideways scrolling, clipped or wrapped numbers, podium parts leaving their cards, overlapping places, targets under 44px, text under 12px and console errors: none left. A separate check switched every tab and period at all five widths and found no movement.
- Found and fixed from the screenshots: the champion chip was wider than its card and covered the neighbours; podium names were cut early (the flag now sits above the name); the profile's numbers were small (a more specific rule won); the third podium place was blank with two players (now "Open"); rows showed through the sticky header; the Skip and Save buttons stacked at 320px; the desktop frame was hidden behind the header and the pinned row (now a real border); the desktop panel moved to recentre itself when a short list loaded (now a fixed height); the flag choice label was cut; the home screen links had no space between them.
- Not verifiable here: real phones (touch, the on screen keyboard over the form, safe areas on a notched phone), VoiceOver and TalkBack (roles and labels are tested in markup), and the live Supabase project.
- Tests: 1149 passing in 66 files (new `tests/leaderboard/client.test.ts`: the stored profile and device id, broken and throwing storage, the API client for every kind of answer, which games count, the screens' markup and labels, no "reported" on screen, flags; the dash scan covers the new screens and their messages; the build test checks the preview is left out and the flags are separate files). Typecheck and build clean. Bundle 134.3 KB gzipped script, 16.5 KB styles.

## 14 Nov 2026: Fix: both kinds of Supabase secret key (D58)
- The adapter now sets `apikey` on every request itself, and the Bearer header only for a legacy JWT key; new `sb_secret_` keys are never sent as a Bearer token. The key is trimmed. Setup steps and `.env.example` name both kinds.
- Not verifiable here: the owner's real project (please run the check in the deployment guide, step 7, after deploying).

## 14 Nov 2026: Fix: offline versus a server problem (D59)
- Offline only when the device is offline or the request failed on the network; a 5xx, an unreadable answer or a timeout shows "The leaderboard is having a problem. Please try again in a moment."; a 429 shows "Too many requests. Try again in N seconds." The screen, the profile, the flag change and the submit form share the three messages.
- Browser check (headless Edge, my own Vite on 5180, `?lb=error`, `?lb=limited`, `?lb=offline`): the server problem panel, the 429 panel, the offline panel and the submit form with each message, at 320 and 390 wide; no overflow, no small targets, no console errors.

## 14 Nov 2026: Development helper: ?testwin= (D60)
- `/?testwin=easy|medium|hard|strongest` opens an already won game at that level, with the real result panel, form and `submit-win` call. 20 recorded games made by the engine (the AI side plays weak legal moves), checked by tests.
- Browser check (headless Edge, my own Vite on 5180, with the `?lb=new` and `?lb=populated` preview standing in for the server, which runs the real `submit-win` handler and its replay): `?testwin=strongest` showed "You Win!" and the username form; Save claimed a name and the replay accepted the win ("You are number 43 this week on Strongest"); `?testwin=easy` with a profile showed the one tap form and was accepted; `?testwin=nope` opened the home screen. Not run against the owner's real Supabase project (that would read `.env` and write to the owner's database).

## 14 Nov 2026: Profile first and automatic wins (D61)
- First AI game: consent, then the new Profile screen, then the board; offline notice without blocking; two players never asked. No automatic country: a custom country picker. Wins are submitted automatically from a queue with safe retries. Usernames can change once in 7 days, old names reserved for 30 days. Migration 2 in a new file (`leaderboard-migration-2.sql`).
- Tests: handlers for renames and reserved names, PGlite tests for migration 2, the queue and its retries, the gate, the picker's keys and roles, no automatic country left.
- `?testwin` (D60) checked with the new flow: without a profile the Profile screen comes first; with one the won game is added by itself ("Added. You are number 30 this week on Strongest.").

## 14 Nov 2026: Leaderboard redesign, avatars and the profile icon (D62)
- The leaderboard, the podium cards and the profile cards rebuilt after the mockups (with the medal ribbon tails, the glossy stage and the mockups' glows), one scroll, 40 original avatars, a profile icon on the home screen, Nunito and tabular numerals self hosted.
- Tests: 1231 passing in 68 files. Typecheck and production build clean.
- Browser check (headless Edge, my own Vite on 5180, `?lb=` previews, one width per batch with a fresh browser): every state at 320, 360, 390, 430, 768, 1024, 1280, 1440, 1920, 2560 and phone landscape (844 by 390), with the overflow, inner scroll, clipped number, tap target, small text and console error checks; wheel, touch and Load more scrolling; side by side with the mockups at their own width. Not run against the owner's real Supabase project.

## 15 Nov 2026: Leaderboard UI review (D63)
- Same medal on all three podium cards, crown on the first only, first card 16px higher; tier words spoken only; wins on one line; smaller avatars; flags on the avatar edge everywhere; a tie line under the podium; flatter gold for filters; smaller filters; slim rows; the list scrolls on its own from 700px tall.
- Tests: 1233 passing in 68 files (`wrappers.test.ts` needs the shell's SUPABASE variables unset, since it checks the unconfigured answer). Typecheck clean.
- Browser check (headless Edge, `?lb=` previews): 320 by 568, 375 by 667, 375 by 812, 390 by 844, 430 by 932 and 800 by 1000, populated, long names and few players; no sideways overflow; ranks 4 to 7 fully visible at 390 by 844.

## 15 Nov 2026: Profile view first, rules behind (i), clean circles, the rows scroll (D64)
- The own Profile opens as a view with a pencil on the avatar; the edit form opens on the same screen with an (i) for the username, flag and avatar rules. The ranking tie line is replaced by an (i) popup, "How the ranking works", with the full order and an example. Avatars are clean circles; leaderboard flags are round badges. Only the rows box scrolls; the screen never scrolls as a whole.
- Tests: 1235 passing in 68 files. Typecheck clean.
- Browser check (headless Edge): 320 by 568, 375 by 667, 375 by 812, 390 by 844, 1280 by 900 and 844 by 390; wheel, touch and Load more on the rows box.

## 15 Nov 2026: The AI under the board, with a face (D64)
- The bubble between the AI card and the board is gone; the robot and its bubble sit under the status line as on chess.com, replacing the "AI played ... Why?" note; the robot laughs, gets angry, smiles and thinks; the AI card is a little taller with a larger robot.
- Tests: 1247 passing in 69 files (with the shell's SUPABASE variables unset). Typecheck clean.
- Browser check (headless Edge, `?scenario=react`, playing the planted blunder against the real AI): 320 by 568, 375 by 667, 390 by 844, 1280 by 800 and 844 by 390; the face went neutral, thinking, laughing; no sideways overflow; the status line above the action bar on phones.

## 15 Nov 2026: Bubble, chance to win, title, avatar (D65)
- White chess.com style bubble with more padding and 16px text on phones; no "I played" lines; the line stays until your move is played; the status hint lines that made the bubble jump are gone; the splash style title; the chance to win bar (left of the board on wide screens, above your card on phones); your chosen avatar on your card.
- Tests: 1259 passing in 70 files (with the shell's SUPABASE variables unset). Typecheck and production build clean.
- Browser check (headless Edge, `?scenario=react&lb=populated`, playing the planted blunder against the real AI): 320 by 568, 375 by 667, 390 by 844, 1280 by 800 and 844 by 390; the robot row kept one position from the first tap to the AI's reply; the bar went from 50% to 3% for the player after the blunder; the avatar shows; no sideways overflow.

## 15 Nov 2026: Home menu after the owner's mockup (D66)
- The home menu copies the "Refined Checkervia Checkers Menu" mockup: gold rimmed frame with a checkered floor, gold title with crown and laurels, cards with icon wells, a gold line and chevrons, the green AI Online pill, Settings and Terms & Notices with gold icons; the avatar in a gold ring with a crown badge.
- Tests: 1260 passing in 70 files (with the shell's SUPABASE variables unset).
- Desktop: no frame, the menu centered, no scroll. Browser check (headless Edge, AI health answered ready): no scroll at 1920 by 920, 1366 by 657, 1280 by 720, 430 by 932 and 390 by 844; 375 by 667 scrolls 60px inside the frame only.

## 15 Nov 2026: The action bar after the owner's mockup (D67)
- Gold rimmed pill, leather tiles, gold New game; columns never narrower than their labels; labels sized by the bar's width; a floating pill on phones; a 380px side panel from 1200px wide.
- Tests: 1262 passing in 70 files (with the shell's SUPABASE variables unset). Typecheck and production build clean.
- Browser check (headless Edge, my own Vite on 5180 because the dev server on 8888 had stopped): 320 by 568, 360 by 740, 390 by 844, 700 by 1000, 1024 by 700, 1280 by 800, 1440 by 900 and 844 by 390; no label wraps or is cut at any size; the status line stays above the bar; no sideways overflow.

## 15 Nov 2026: Menu sheet, Terms and the "are you sure?" popup (D68)
- Gold scroll bar on the Terms with a fixed head and foot, a reading line and numbered sections; the Menu's actions as tiles with gold symbols; the popup with a symbol, a heading and gold and red buttons.
- Tests: 1275 passing in 71 files (with the shell's SUPABASE variables unset). Typecheck clean apart from `tests/docs-no-dashes.test.ts`, which fails since `package.json` gained the `cli` and `netlify` packages during this session (not part of this change).
- Browser check (headless Edge, my own Vite on 5180): the Menu at 1400 by 900 and 390 by 844 (no scroll), the Terms at the top and the end, opened from the game and from the home screen, New game after a move at 1400 by 900 and 390 by 844, Resign at 360 by 740; no console errors.

## 15 Nov 2026: Resign pressure, a laugh at the end, a shocked face (D69)
- After the resign hint, while the player stalls: the AI's line 15 seconds, 5 empty, then a new ask to resign, again and again; a random laugh after the AI's winning line; a stubborn ending bank; a shocked but confident face for double captures.
- Tests: 1293 passing in 72 files (with the shell's SUPABASE variables unset). Typecheck clean apart from `tests/docs-no-dashes.test.ts` (another session's new file: `readFileSync` without an encoding).

## 15 Nov 2026: Resign pressure timing and the dots wave (D70)
- The AI's resign line 10 seconds, then 5 seconds of typing dots before each new ask (10 seconds each); the dots now move in a wave.
- Tests: 1293 passing in 72 files (with the shell's SUPABASE variables unset).

## 15 Nov 2026: The AI's last words stay, a livelier robot (D71)
- The bubble keeps the AI's last line after the game; new smug, nervous and defeated faces; breathing, glancing and blinking between reactions.
- Tests: 1294 passing in 72 files (with the shell's SUPABASE variables unset).

## 15 Nov 2026: Five more robot reactions (D72)
- Wink, starstruck, proud, annoyed and sleepy; fourteen faces in all, each checked side by side in the browser.
- Tests: 1299 passing in 72 files (with the shell's SUPABASE variables unset).
