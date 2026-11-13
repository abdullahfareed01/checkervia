# Technical Decisions Log

Format: decision, reason, consequence.

## D1. Black moves first
- Reason: standard convention.
- Consequence: initial `currentPlayer = black`.

## D2. Regular pieces move and capture forward only; Kings both ways
- Reason: matches the chosen rule set.
- Consequence: direction lists differ by piece type and color.

## D3. Crowning during a capture chain ends the turn
- Reason: common rule, simpler to implement and explain.
- Consequence: chain generator stops after a non-King lands on the far row.

## D4. With several captures available, the player may choose any
- Reason: no "maximum capture" rule.
- Consequence: legal move list contains all captures; no length filtering. Capture is still mandatory over plain moves.

## D5. No draw rule
- Reason: keep scope small.
- Consequence: a game could in theory loop with Kings; accepted risk.

## D6. Stack: React, TypeScript, Vite, Vitest; deploy to Netlify
- Reason: chosen stack; one platform for hosting and functions.
- Consequence: new dependencies need approval.

## D7. LLM key stays server-side via serverless proxy
- Reason: anything in the browser bundle is public.
- Consequence: `netlify/functions/ai-move.ts`; env vars `OPENROUTER_API_KEY` and `LLM_MODEL`, without `VITE_` prefix (see D19); local dev needs `netlify dev`.

## D8. Four separate layers: engine, state, UI, AI
- Reason: testability and explainability; rules must not depend on React.
- Consequence: engine is pure TS; import direction enforced by review.

## D9. AI chooses from a code-generated legal move list; code verifies
- Reason: LLMs make illegal moves; the engine is the single source of truth.
- Consequence: moves have ids; reply parsed and checked; max 3 retries, then fallback message.

## D10. Orientation: white on rows 0-2 moving down, black on rows 5-7 moving up
- Reason: matches the UI mockup (`mockup/Draft_Game_UI_Sample.png`), which has white at the top and black at the bottom. Supersedes the earlier layout (black on top).
- Consequence: black crowns on row 0, white on row 7. Black still moves first. Dark squares stay where `row + col` is odd.

## D11. Move shape: `from`, `to`, `path`, `captured`
- Reason: the UI needs the destination, the AI prompt needs a readable summary, and `applyMove` needs the captured squares.
- Consequence: `path` lists landing squares only (not the start). One Move per complete capture chain.

## D12. Captured pieces stay on the board until the move ends; the start square counts as empty
- Reason: stops a piece being jumped twice or landed on in one chain; lets a King finish a loop on its own start square.
- Consequence: `jumpsFrom` checks a `captured` list; `applyMove` clears the start square before placing the piece.

## D13. Crowning ending the chain needs no special code
- Reason: regular pieces jump forward only, so on the far row no jump remains. An explicit check changed no result (tested by breaking it on purpose).
- Consequence: `applyMove` crowns; a test with a King in the same position shows the chain would continue for a King.

## D14. Winner is decided by legal moves only
- Reason: no pieces implies no legal moves, so one check covers both win conditions.
- Consequence: `getWinner(board, playerToMove)` returns the opponent when `getLegalMoves` is empty.

## D15. Several routes to one square: ask for the next landing square
- Reason: two different capture chains from one piece can end on the same square (for example around a diamond of four enemy pieces). Guessing would remove the wrong pieces.
- Consequence: clicking that square does not play yet. The UI highlights the first landing squares where the routes differ; the player clicks one. If still ambiguous it asks again, otherwise the move plays. Logic is in `src/state/routes.ts`. Routes always differ at some landing square, so this always terminates.

## D16. State layer: one `click` action, selectors for display
- Reason: components must stay thin and the UI must never decide legality.
- Consequence: `gameReducer.ts` decides what a click means using only `state.legalMoves` from the engine; `selectors.ts` derives highlights and counts; `useGame.ts` is the only React code in `state/`.

## D17. New game asks for confirmation only while a game is in progress
- Reason: avoids losing a game by accident, but no pointless prompt at the start or after a win.
- Consequence: "in progress" means at least one move played and no winner yet (`isGameInProgress`). The confirmation is an inline panel, not a browser popup.

## D18. AI module: injected model call, numbered moves, JSON reply, no fallback move
- Reason: keeps `src/ai` pure and testable with fake models, and makes it impossible to play a move the engine did not list.
- Consequence: `chooseMove(board, player, callModel, maxRetries = 3)` returns a move from the legal list or a failure with reasons. Reply format is `{"move": <number>}`. A thrown error counts as a failed attempt. On failure nothing is played: no random move, no first-move fallback. A multi jump line in the prompt also shows its route, so two chains with the same start and end are not identical lines.

## D19. Provider OpenRouter, model `openai/gpt-oss-120b`, two environment variable names
- Reason: chosen provider and model. One fixed pair of names avoids confusion between docs, code and `.env.example`.
- Consequence: the key is `OPENROUTER_API_KEY` and the model is `LLM_MODEL`, in the function, `.env.example`, README, architecture and tech stack. `LLM_API_KEY` is not used anywhere. `.env.example` has empty values and is the only env file allowed in git (`!.env.example` after `.env*` in `.gitignore`).

## D20. Reasoning-model settings and structured output
- Reason: gpt-oss is a reasoning model. Reasoning tokens count against `max_tokens`, so a small limit can leave an empty answer.
- Consequence: the proxy sends `max_tokens` 1500, `reasoning: { effort: "low" }`, `response_format` as a JSON schema for `{ move: integer }` and `provider: { require_parameters: true }` (only route to providers that support every parameter). If the provider answers 400, 404 or 422 (it refuses `response_format`), the proxy asks once more without it, keeping the other parameters. An empty or missing message is an error (502), so the client throws and `chooseMove` retries. `parseReply` stays the final guard in every case.

## D21. Proxy limits, timeouts and rate limiting
- Reason: the endpoint is public and each call costs money.
- Consequence: POST only; body limited to `prompt` (at most 4000 characters) and `retryNote` (at most 500); generic errors only. Netlify's synchronous function limit is 60 s and is not configurable (current Netlify docs), so the provider call times out at 55 s and the browser at 65 s. The rate limit is an in-memory per-client counter (20 requests per 60 s), best effort only: it is per function instance, so it slows casual abuse but is not a guarantee. The hard limits are a spending cap on the OpenRouter key and, at deploy time, optionally Netlify's code-based rate limiting.

## D22. AI mode state: request ids, locked board, fallback with Retry
- Reason: a reply can arrive after the player has started a new game; the AI must never play a move the engine did not list.
- Consequence: the human is Black and the AI is White. State has `aiPhase` (idle, thinking, failed) and `aiRequestId`. The id changes on every new request, New game, mode change and Retry; the reducer ignores `aiMoved` and `aiFailed` with any other id. The AI's move goes through the same `playMove` as a human move and only if it is in `legalMoves`. While thinking or failed the board is locked. Switching mode starts a new game and asks for confirmation if a game is in progress.

## D23. The retry note travels as its own field
- Reason: the proxy limits `prompt` and `retryNote` separately.
- Consequence: `callModel(prompt, retryNote?)` sends `{ prompt, retryNote }` and the proxy appends the note to the prompt it forwards.

## D24. Engine checked against an independent implementation
- Reason: BUG-001 claimed illegal AI moves. A second implementation written separately is the strongest cheap evidence that the engine follows our rules.
- Consequence: `tests/engine-crosscheck.test.ts` (seeded, about 2.5 s) runs on every `npm test`. Any future rule change must update both implementations, which is deliberate: it forces the change to be thought through twice.

## D25. Layout: board column plus sidebar on desktop, one column on narrow screens
- Reason: the user asked for no page scroll on desktop and a mobile-friendly game. Building the layout before the new panels avoids redoing it.
- Consequence: on screens at least 900x600 the page is exactly the window height and never scrolls; the board size is computed from the space left after the player cards and sidebar (`--board-size` in `styles.css`); only the sidebar may scroll inside itself. Narrower screens stack header, game and sidebar and may scroll.

## D26. Player cards with drawn SVG icons
- Reason: show who plays which side, like chess.com; the AI gets a robot. Inline SVG needs no image files and no licences, scales cleanly and can animate.
- Consequence: White's card is above the board and Black's below. The robot blinks and scans while the AI is thinking. The cards also show pieces left and pieces taken (replacing the old counts list).

## D27. Last move shown as a route and animated
- Reason: a multi jump that only highlights start and end looks like an illegal teleport (the likely cause of BUG-001).
- Consequence: an SVG overlay draws every square of the last move, numbers the landings of a multi jump and crosses out captured pieces. The move is animated hop by hop with the Web Animations API (no library); the destination piece is hidden until the hop ends. Clicks are not blocked during the short animation, because the board underneath already shows the final position. Reduced motion: route only, no animation. State keeps `previousBoard` so the animation knows which piece moved and what it captured.

## D28. Neon visual style for moves and highlights
- Reason: user feedback: the animation should look more professional, "a little neon", with no solid borders.
- Consequence: the route is an SVG neon trail (blur-glow filter, soft halo, thin core, flowing dashes, breathing start ring, hollow numbered rings, neon-red crosses with a burst). The moving piece glows in its side's colour. Solid borders were replaced by glows on the selected square, last-move squares, capture rings and the card of the side to move (which pulses gently). All pulsing and flowing stops for reduced motion. The moving-piece glow uses CSS `:has()`; in a browser without it the piece simply has no coloured glow.

## D29. End of game: a result popup with stats instead of a green glow
- Reason: user feedback: the green neon on the winner's card did not look good; they want a designed winner popup with stats, and an AI winner popup when they lose.
- Consequence: `ResultDialog` opens after the final move's animation (plus 0.45 s). Three looks: "You win!" (gold, trophy, confetti), "AI wins" (cyan, robot, no confetti), "<side> wins!" for two players. It shows the reason, a stats table for both sides (pieces left, pieces captured, Kings made, best multi jump, moves), total moves and game time, and the buttons Play again and View board. Esc or clicking outside also closes it; "Show result" in the sidebar reopens it. The winner's card now just gets a gold crown. The state counts stats per side in `playMove` (pure); game time is measured in the UI (`useGameDuration`), because the reducer must not read the clock.

## D30. Player cards redesigned
- Reason: user feedback: the AI card (small robot on a white tile, "0 left, took 5" as plain text) could look better.
- Consequence: dark glass avatar with a neon ring in the side's colour (gold Black, cyan White), a glowing cyan robot for the AI, a BOT badge, side and status ("To move" in the side colour, "Thinking" with animated dots), 12 piece markers (lit = still on the board) next to the number, and captured pieces as small overlapping discs. On very small phones the markers are hidden and only the number stays.

## D31. Development-only preview scenarios
- Reason: checking the result popup by hand otherwise needs a whole game.
- Consequence: on the dev server, `?scenario=win`, `?scenario=lose` or `?scenario=duel` starts one move from the end (`src/ui/devScenarios.ts`). `main.tsx` loads it only when `import.meta.env.DEV` is true, so it is not in the production build (checked: no trace in `dist`). A test proves each scenario really ends in one move.

## D32. History: view-only review, like chess.com
- Reason: the user asked for back and forward arrows like chess.com, with forward disabled at the latest position. View-only review keeps the rules simple (no take-backs to explain or to abuse against the AI).
- Consequence: state keeps `history` (every position: board, move, who moved) and `viewIndex` (null = live). The `history` action handles first, back, forward, latest and a move number; it only changes what is on screen. While reviewing, `canHumanAct` is false, so the board is locked and shows no hints; "Back to the game" or the latest arrow returns. An AI reply that arrives while reviewing is added to the history and the reviewer stays put. Only a single step forward animates (new move or forward arrow); going back or jumping does not (`nextAnimationKey`). Keyboard: Left and Right arrows, Home and End (ignored while a popup is open). The move list shows every move ("6,1 → 5,2", "×2" for captures, a crown for crowning) and jumps to it when clicked. `previousBoard` was removed from the state: the history now provides the board before the shown move.

## D33. AI reason: the model's words apart from engine-checked facts
- Reason: the user wanted to see why the AI played a move. A model's explanation can be wrong or made up, so on its own it would teach false things about the position.
- Consequence: prompt v2 asks for a short `reason` next to the move, and the proxy's JSON schema requires it. `parseReply` keeps it as plain text (whitespace collapsed, cut at 200 characters). A missing or broken reason never rejects a reply, and a reason can never rescue a bad move. The reason is stored on the AI's history entry. The popup shows it under "In its own words", labelled as not checked. Next to it, under "Checked by the game engine", are facts worked out by `src/state/moveFacts.ts` from the board: whether the move wins, how many pieces it captured (and that capturing was mandatory), whether it crowned a King, how many legal moves there were, and whether the moved piece or any other piece can be captured next turn. React renders the reason as text, never as HTML. The note and popup follow the history, so an older AI move can be explained while reviewing.

## D34. Splash, home menu and AI health check
- Reason: the user asked for a home menu and a splash screen. A splash on a fixed timer only makes people wait, so it should last exactly as long as real loading.
- Consequence: `index.html` holds a static splash (inline styles) that shows while the JavaScript downloads. React then renders the same splash (`Splash.tsx`), marks "Game loaded" and waits for one AI health check, then fades out (0.35 s, none for reduced motion). There is no artificial delay. The health check is a `GET` to the existing `ai-move` function: it answers `{ ready: true|false }` (key and model set or not), never calls the provider, costs nothing and is not rate limited. The browser (`src/ai/health.ts`) maps it to ready, offline (not configured) or unreachable (no function, timeout after 4 s, or the dev server's HTML), and never throws. The home menu (`Home.tsx`) offers Play vs AI with a status badge and "Check again", 2 Players, and How to play (`HowToPlay.tsx`, the rules in plain words). Play vs AI stays clickable when the AI is not ready: the in-game Retry message already handles that. Games get a Menu button (asks first if a game is in progress). `Root.tsx` switches screens; the dev scenarios open straight on the game. New game and Menu share `ConfirmButton`.

## D35. Learn mode: recorded lessons, checked by the engine
- Reason: the user wanted a teaching mode with two robots. A live LLM game would cost money on every visit, play differently each time and could not promise to show each rule. A recorded script does all three.
- Consequence: `src/learn/lessons.ts` holds four short scenes (first moves and forced capture from the real opening; multi jump, crowning and a win by taking every piece; a King capturing backward; a win by blocking). Each move is written as its path and has a caption. `buildFrames` (`src/learn/frames.ts`) looks every move up in the engine's legal list and throws if one is not there, so a script with an illegal move fails the tests. Each frame also carries the engine facts from `moveFacts` (the same as the AI reason popup) and the pieces that must capture (glowing red). Playback (`useLessonPlayer`, with pure timing in `src/learn/playback.ts`) autoplays with time to read each caption after the move animation. Any control pauses it. Left, Right, Home and End work as in the game, and the lessons can be picked from a list. The robots are Gold Bot (Black) and Cyan Bot (White). `boardFrom` moved from the test helpers into the engine, because the lessons use it in production code; the test helpers re-export it.

## D36. AI difficulty levels with an engine look-ahead
- Reason: the user asked for difficulty levels on a bar, and for gpt-oss-120b to use every possible future outcome of each move. A language model cannot reliably search game trees itself, but our engine can. Searching the whole game to the end is impossible (far too many positions), so "every possible outcome" means every possible sequence of moves up to a fixed number of turns ahead.
- Consequence: four levels (`src/ai/difficulty.ts`): Beginner (no look-ahead), Casual (2 turns), Strong (4), Expert (6). For levels 2 to 4, `src/ai/search.ts` scores every legal move with negamax and alpha-beta pruning. Every reply is tried; the pruning only skips lines that cannot change the result, and a test proves the scores equal a plain search without pruning. Scores are material in pieces (man 1.0, King 1.6) after best play by both sides, or a forced win or loss in N turns. While a capture is pending, the search goes on (up to 8 extra turns), so an exchange is never judged half way. Prompt v3 explains the scores and adds one per move line; the model still chooses, and the engine still checks the move is legal. The search runs in a Web Worker (`searchWorker.ts`) so the board never freezes; Expert takes up to about 0.7 s. It never fails a turn: if the worker fails or takes over 10 s, a 2-turn search runs on the page; if the look-ahead throws or gives bad scores, the model chooses without scores. The level is a slider (home menu and game sidebar in vs-AI). It can change at any time (applies from the next AI turn), is kept by New game, and is remembered in the browser (localStorage, guarded). The "Why this move?" popup adds the engine's score for the chosen move and whether it was a top-scored move. The proxy's prompt limit went from 4000 to 8000 characters; a test proves no prompt can exceed it. Depth 8 was measured at up to 6 s and left out.

## D37. Calm, professional look (no neon)
- Reason: the user asked to remove the "vibe coded" neon effects and make the game look more professional. Supersedes D28 (neon restyle).
- Consequence: no glows, pulses, breathing rings, flowing dashes or burst effects anywhere (checked: no `0 0 Npx` glow shadows, glow text-shadows or drop-shadow filters left in any stylesheet or the splash). The side to move gets a thin accent bar on its card; the selected square a solid ring; destinations a plain dot; captures a solid red ring; the last move a lighter square tint; the route a plain line and arrow with numbered rings and red crosses (`RouteOverlay` no longer uses an SVG blur filter). Accents are muted: gold #d9ab3a for Black, steel blue for White and the AI.

## D38. Level chosen in a popup, shown on the AI's card
- Reason: the user asked to hide the difficulty bar, choose the level in a popup when picking Play vs AI, and see the chosen level during the game.
- Consequence: the slider is gone. "Play vs AI" (home menu, rules page, and the mode switch in a game) opens `LevelDialog`: four options with a signal-bar meter and a one-line meaning, the last choice preselected (still remembered in the browser), Start game and Cancel. The AI's player card shows the level as a badge next to BOT. The level stays fixed for the game; New game keeps it. To change it, choose Play vs AI again.

## D39. The AI speaks in a speech bubble
- Reason: the user wanted the AI's reasons to look like the AI replying, in a speech bubble (reference: a white rounded box with a tail), and plans AI reactions to the player's moves later.
- Consequence: `SpeechBubble` sits under the AI's card with its tail pointing at the robot. While the AI thinks it shows typing dots; then the model's reason with "Why?" (opens the existing popup) and a close button. It closes itself after a reading time (5 to 12 s), and hides as soon as the player picks up a piece or the result popup opens, so it never blocks a move. The sidebar note now only says what the AI played, with "Why this move?". The bubble is generic (key, text, optional controls), so future reactions can use it as is.

## D40. Speech bubble timing and calm motion
- Reason: user feedback on D37 and D39: the bubble disappeared too soon and should go when the player plays their move (or after a long wait); it should be easier to read and look more like a bubble; and the animations removed with the neon should come back.
- Consequence: the AI's reason now stays until the player plays their move; if the player waits, it leaves after 20 to 40 s (longer text, longer time; `bubbleTimeMs`). While the player holds a piece it turns see-through (opacity 0.28) and clicks pass through it to the board (only its buttons catch clicks). Bigger, darker text, an "AI" label, a curved tail joined to the body under one soft shadow. Motion is back without glow: the bubble pops out of its tail, shrinks away when it leaves, and new text fades in; the route line draws itself from start to end, then the landing numbers and capture crosses pop in; a picked-up piece lifts; move hints pop in; route choices pulse; the must-capture ring breathes; the side-to-move bar slides in; the result emblem floats; menu cards lift on hover. Everything is off for users who ask for reduced motion.

## D41. Redesign after mockup/mockup_design.png
- Reason: the user asked to copy the mockup as closely as possible without hurting the UI or the user experience.
- Consequence: new top bar (back arrow, serif "Draft" title with a crown and laurels, Menu), a segmented Two Players / Play vs AI switch with "You play Black • AI plays White", richer player cards (robot portrait, BOT and a gold level badge with a crown, a status dot, a "Your turn" pill, a big pieces-left number, a stack of captured pieces with "Took: N"), a wooden board frame with A to H and 8 to 1 on all four sides, a slate tint on the last move's squares and a blue ring on the moved piece, a "Black to move" banner with gold lines and diamonds, the AI move card with an info icon and "Why this move?", and ornamental page corners. Styles are in `src/ui/chrome.css`, loaded last. Where the mockup was unclear or would hurt use:
  - Square names follow the board's labels everywhere (move list, AI card, Learn captions, AI prompt v4), e.g. "E3 → G5"; the mockup's "4.7 → 6.5" does not match its own labels.
  - The Menu opens a short list (New game, How to play, Main menu). How to play opens over the game (`RulesDialog`) so reading the rules never ends a game; the back arrow returns to the main menu. Anything that would lose a game asks first (`ConfirmDialog`, "Keep playing" has the focus).
  - On phones held sideways the BOT badge is hidden, so the AI's name fits; the robot portrait and level badge already say it is the AI.
  - In Learn, Gold Bot gets gold eyes so the two robots differ.
- `squareName` moved into the engine, so the AI module does not depend on the UI.

## D42. AI reactions to the player's moves
- Reason: the user asked for the AI to tease bad moves and praise good ones.
- Consequence: before the AI's turn, the engine judges the player's last move (`src/ai/judge.ts`, 4 turns of look-ahead, in the background worker): a **blunder** (at least 1.0 piece worse than the best move, or a forced win missed) or a **great move** (a forced win found, a multi jump, or the only good move, at least 1.0 piece better than every other). Ordinary, slightly worse and forced moves get nothing, so reactions stay rare. The verdict and its facts go into the AI's existing prompt (v5), which asks for one short line: gentle, playful teasing (never insulting) or warm praise; otherwise an empty "reaction". No extra model call. A reaction is only kept when the engine asked for one, and is stored on the AI's history entry with the verdict. The speech bubble shows it first (warm red for a tease, green for praise), then the AI's reason; the "Why this move?" popup shows the engine's verdict ("Your previous move: a blunder. ..."). The proxy schema requires `reaction` (empty when not needed). Dev-only `?scenario=react` sets up a position where E3 -> D4 is a blunder.

## D43. Trash talk: an aggressive rival with a free hand
- Reason: the user asked for more aggressive replies and a free hand for the AI to say what it likes. Supersedes the gentle tone of D42.
- Consequence: prompt v6 gives the AI a cocky, trash-talking rival persona and asks for a reaction after every player move (not only engine-judged ones): roast mistakes, brag, taunt, mock the plan, grudging respect for good moves; savage and funny; mild swearing allowed. It may still answer "" when it has nothing to say. The only limits keep it about the game: no slurs, no hate, nothing about real-world looks, family, identity or sex, no threats. The engine's verdict is still added when it found a blunder or a great move ("Roast them for it" / "grudging respect"), so those reactions are deserved, and it still appears in "Why this move?". To keep it fresh, the prompt quotes the AI's last 3 lines and asks for something new, never opening with "Nice try", and says pieces and kings, never pawns. The bubble shows plain banter in dark bold, a roast after a blunder in warm red, respect after a great move in green.
