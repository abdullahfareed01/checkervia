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
- Consequence: chain generator stops after a non King lands on the far row.

## D4. With several captures available, the player may choose any
- Reason: no "maximum capture" rule.
- Consequence: legal move list contains all captures; no length filtering. Capture is still mandatory over plain moves.

## D5. No draw rule
- Reason: keep scope small.
- Consequence: a game could in theory loop with Kings; accepted risk.

## D6. Stack: React, TypeScript, Vite, Vitest; deploy to Netlify
- Reason: chosen stack; one platform for hosting and functions.
- Consequence: new dependencies need approval.

## D7. LLM key stays server side via serverless proxy
- Reason: anything in the browser bundle is public.
- Consequence: `netlify/functions/ai-move.ts`; env vars `OPENROUTER_API_KEY` and `LLM_MODEL`, without `VITE_` prefix (see D19); local dev needs `netlify dev`.

## D8. Four separate layers: engine, state, UI, AI
- Reason: testability and explainability; rules must not depend on React.
- Consequence: engine is pure TS; import direction enforced by review.

## D9. AI chooses from a code generated legal move list; code verifies
- Reason: LLMs make illegal moves; the engine is the single source of truth.
- Consequence: moves have ids; reply parsed and checked; max 3 retries, then fallback message.

## D10. Orientation: white on rows 0 to 2 moving down, black on rows 5 to 7 moving up
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
- Consequence: `chooseMove(board, player, callModel, maxRetries = 3)` returns a move from the legal list or a failure with reasons. Reply format is `{"move": <number>}`. A thrown error counts as a failed attempt. On failure nothing is played: no random move, no first move fallback. A multi jump line in the prompt also shows its route, so two chains with the same start and end are not identical lines.

## D19. Provider OpenRouter, model `openai/gpt-oss-120b`, two environment variable names
- Reason: chosen provider and model. One fixed pair of names avoids confusion between docs, code and `.env.example`.
- Consequence: the key is `OPENROUTER_API_KEY` and the model is `LLM_MODEL`, in the function, `.env.example`, README, architecture and tech stack. `LLM_API_KEY` is not used anywhere. `.env.example` has empty values and is the only env file allowed in git (`!.env.example` after `.env*` in `.gitignore`).

## D20. Reasoning model settings and structured output
- Reason: `gpt-oss` is a reasoning model. Reasoning tokens count against `max_tokens`, so a small limit can leave an empty answer.
- Consequence: the proxy sends `max_tokens` 1500, `reasoning: { effort: "low" }`, `response_format` as a JSON schema for `{ move: integer }` and `provider: { require_parameters: true }` (only route to providers that support every parameter). If the provider answers 400, 404 or 422 (it refuses `response_format`), the proxy asks once more without it, keeping the other parameters. An empty or missing message is an error (502), so the client throws and `chooseMove` retries. `parseReply` stays the final guard in every case.

## D21. Proxy limits, timeouts and rate limiting
- Reason: the endpoint is public and each call costs money.
- Consequence: POST only; body limited to `prompt` (at most 4000 characters) and `retryNote` (at most 500); generic errors only. Netlify's synchronous function limit is 60 s and is not configurable (current Netlify docs), so the provider call times out at 55 s and the browser at 65 s. The rate limit is an in memory per client counter (20 requests per 60 s), best effort only: it is per function instance, so it slows casual abuse but is not a guarantee. The hard limits are a spending cap on the OpenRouter key and, at deploy time, optionally Netlify's code based rate limiting.

## D22. AI mode state: request ids, locked board, fallback with Retry
- Reason: a reply can arrive after the player has started a new game; the AI must never play a move the engine did not list.
- Consequence: the human is Black and the AI is White. State has `aiPhase` (idle, thinking, failed) and `aiRequestId`. The id changes on every new request, New game, mode change and Retry; the reducer ignores `aiMoved` and `aiFailed` with any other id. The AI's move goes through the same `playMove` as a human move and only if it is in `legalMoves`. While thinking or failed the board is locked. Switching mode starts a new game and asks for confirmation if a game is in progress.

## D23. The retry note travels as its own field
- Reason: the proxy limits `prompt` and `retryNote` separately.
- Consequence: `callModel(prompt, retryNote?)` sends `{ prompt, retryNote }` and the proxy appends the note to the prompt it forwards.

## D24. Engine checked against an independent implementation
- Reason: `BUG-001` claimed illegal AI moves. A second implementation written separately is the strongest cheap evidence that the engine follows our rules.
- Consequence: `tests/engine-crosscheck.test.ts` (seeded, about 2.5 s) runs on every `npm test`. Any future rule change must update both implementations, which is deliberate: it forces the change to be thought through twice.

## D25. Layout: board column plus sidebar on desktop, one column on narrow screens
- Reason: the user asked for no page scroll on desktop and a mobile friendly game. Building the layout before the new panels avoids redoing it.
- Consequence: on screens at least 900x600 the page is exactly the window height and never scrolls; the board size is computed from the space left after the player cards and sidebar (`--board-size` in `styles.css`); only the sidebar may scroll inside itself. Narrower screens stack header, game and sidebar and may scroll.

## D26. Player cards with drawn SVG icons
- Reason: show who plays which side, like chess.com; the AI gets a robot. Inline SVG needs no image files and no licences, scales cleanly and can animate.
- Consequence: White's card is above the board and Black's below. The robot blinks and scans while the AI is thinking. The cards also show pieces left and pieces taken (replacing the old counts list).

## D27. Last move shown as a route and animated
- Reason: a multi jump that only highlights start and end looks like an illegal teleport (the likely cause of `BUG-001`).
- Consequence: an SVG overlay draws every square of the last move, numbers the landings of a multi jump and crosses out captured pieces. The move is animated hop by hop with the Web Animations API (no library); the destination piece is hidden until the hop ends. Clicks are not blocked during the short animation, because the board underneath already shows the final position. Reduced motion: route only, no animation. State keeps `previousBoard` so the animation knows which piece moved and what it captured.

## D28. Neon visual style for moves and highlights
- Reason: user feedback: the animation should look more professional, "a little neon", with no solid borders.
- Consequence: the route is an SVG neon trail (blur glow filter, soft halo, thin core, flowing dashes, breathing start ring, hollow numbered rings, neon red crosses with a burst). The moving piece glows in its side's colour. Solid borders were replaced by glows on the selected square, last move squares, capture rings and the card of the side to move (which pulses gently). All pulsing and flowing stops for reduced motion. The moving piece glow uses CSS `:has()`; in a browser without it the piece simply has no coloured glow.

## D29. End of game: a result popup with stats instead of a green glow
- Reason: user feedback: the green neon on the winner's card did not look good; they want a designed winner popup with stats, and an AI winner popup when they lose.
- Consequence: `ResultDialog` opens after the final move's animation (plus 0.45 s). Three looks: "You win!" (gold, trophy, confetti), "AI wins" (cyan, robot, no confetti), "<side> wins!" for two players. It shows the reason, a stats table for both sides (pieces left, pieces captured, Kings made, best multi jump, moves), total moves and game time, and the buttons Play again and View board. Esc or clicking outside also closes it; "Show result" in the sidebar reopens it. The winner's card now just gets a gold crown. The state counts stats per side in `playMove` (pure); game time is measured in the UI (`useGameDuration`), because the reducer must not read the clock.

## D30. Player cards redesigned
- Reason: user feedback: the AI card (small robot on a white tile, "0 left, took 5" as plain text) could look better.
- Consequence: dark glass avatar with a neon ring in the side's colour (gold Black, cyan White), a glowing cyan robot for the AI, a BOT badge, side and status ("To move" in the side colour, "Thinking" with animated dots), 12 piece markers (lit = still on the board) next to the number, and captured pieces as small overlapping discs. On very small phones the markers are hidden and only the number stays.

## D31. Development only preview scenarios
- Reason: checking the result popup by hand otherwise needs a whole game.
- Consequence: on the dev server, `?scenario=win`, `?scenario=lose` or `?scenario=duel` starts one move from the end (`src/ui/devScenarios.ts`). `main.tsx` loads it only when `import.meta.env.DEV` is true, so it is not in the production build (checked: no trace in `dist`). A test proves each scenario really ends in one move.

## D32. History: view only review, like chess.com
- Reason: the user asked for back and forward arrows like chess.com, with forward disabled at the latest position. View only review keeps the rules simple (no takebacks to explain or to abuse against the AI).
- Consequence: state keeps `history` (every position: board, move, who moved) and `viewIndex` (null = live). The `history` action handles first, back, forward, latest and a move number; it only changes what is on screen. While reviewing, `canHumanAct` is false, so the board is locked and shows no hints; "Back to the game" or the latest arrow returns. An AI reply that arrives while reviewing is added to the history and the reviewer stays put. Only a single step forward animates (new move or forward arrow); going back or jumping does not (`nextAnimationKey`). Keyboard: Left and Right arrows, Home and End (ignored while a popup is open). The move list shows every move ("6,1 → 5,2", "×2" for captures, a crown for crowning) and jumps to it when clicked. `previousBoard` was removed from the state: the history now provides the board before the shown move.

## D33. AI reason: the model's words apart from engine checked facts
- Reason: the user wanted to see why the AI played a move. A model's explanation can be wrong or made up, so on its own it would teach false things about the position.
- Consequence: prompt v2 asks for a short `reason` next to the move, and the proxy's JSON schema requires it. `parseReply` keeps it as plain text (whitespace collapsed, cut at 200 characters). A missing or broken reason never rejects a reply, and a reason can never rescue a bad move. The reason is stored on the AI's history entry. The popup shows it under "In its own words", labelled as not checked. Next to it, under "Checked by the game engine", are facts worked out by `src/state/moveFacts.ts` from the board: whether the move wins, how many pieces it captured (and that capturing was mandatory), whether it crowned a King, how many legal moves there were, and whether the moved piece or any other piece can be captured next turn. React renders the reason as text, never as HTML. The note and popup follow the history, so an older AI move can be explained while reviewing.

## D34. Splash, home menu and AI health check
- Reason: the user asked for a home menu and a splash screen. A splash on a fixed timer only makes people wait, so it should last exactly as long as real loading.
- Consequence: `index.html` holds a static splash (inline styles) that shows while the JavaScript downloads. React then renders the same splash (`Splash.tsx`), marks "Game loaded" and waits for one AI health check, then fades out (0.35 s, none for reduced motion). There is no artificial delay. The health check is a `GET` to the existing `ai-move` function: it answers `{ ready: true|false }` (key and model set or not), never calls the provider, costs nothing and is not rate limited. The browser (`src/ai/health.ts`) maps it to ready, offline (not configured) or unreachable (no function, timeout after 4 s, or the dev server's HTML), and never throws. The home menu (`Home.tsx`) offers Play vs AI with a status badge and "Check again", 2 Players, and How to play (`HowToPlay.tsx`, the rules in plain words). Play vs AI stays clickable when the AI is not ready: the in game Retry message already handles that. Games get a Menu button (asks first if a game is in progress). `Root.tsx` switches screens; the dev scenarios open straight on the game. New game and Menu share `ConfirmButton`.

## D35. Learn mode: recorded lessons, checked by the engine
- Reason: the user wanted a teaching mode with two robots. A live LLM game would cost money on every visit, play differently each time and could not promise to show each rule. A recorded script does all three.
- Consequence: `src/learn/lessons.ts` holds four short scenes (first moves and forced capture from the real opening; multi jump, crowning and a win by taking every piece; a King capturing backward; a win by blocking). Each move is written as its path and has a caption. `buildFrames` (`src/learn/frames.ts`) looks every move up in the engine's legal list and throws if one is not there, so a script with an illegal move fails the tests. Each frame also carries the engine facts from `moveFacts` (the same as the AI reason popup) and the pieces that must capture (glowing red). Playback (`useLessonPlayer`, with pure timing in `src/learn/playback.ts`) autoplays with time to read each caption after the move animation. Any control pauses it. Left, Right, Home and End work as in the game, and the lessons can be picked from a list. The robots are Gold Bot (Black) and Cyan Bot (White). `boardFrom` moved from the test helpers into the engine, because the lessons use it in production code; the test helpers reexport it.

## D36. AI difficulty levels with an engine look ahead
- Reason: the user asked for difficulty levels on a bar, and for `gpt-oss-120b` to use every possible future outcome of each move. A language model cannot reliably search game trees itself, but our engine can. Searching the whole game to the end is impossible (far too many positions), so "every possible outcome" means every possible sequence of moves up to a fixed number of turns ahead.
- Consequence: four levels (`src/ai/difficulty.ts`): Beginner (no look ahead), Casual (2 turns), Strong (4), Expert (6). For levels 2 to 4, `src/ai/search.ts` scores every legal move with negamax and alpha beta pruning. Every reply is tried; the pruning only skips lines that cannot change the result, and a test proves the scores equal a plain search without pruning. Scores are material in pieces (man 1.0, King 1.6) after best play by both sides, or a forced win or loss in N turns. While a capture is pending, the search goes on (up to 8 extra turns), so an exchange is never judged half way. Prompt v3 explains the scores and adds one per move line; the model still chooses, and the engine still checks the move is legal. The search runs in a Web Worker (`searchWorker.ts`) so the board never freezes; Expert takes up to about 0.7 s. It never fails a turn: if the worker fails or takes over 10 s, a 2 turn search runs on the page; if the look ahead throws or gives bad scores, the model chooses without scores. The level is a slider (home menu and game sidebar in vs AI). It can change at any time (applies from the next AI turn), is kept by New game, and is remembered in the browser (localStorage, guarded). The "Why this move?" popup adds the engine's score for the chosen move and whether it was a top scored move. The proxy's prompt limit went from 4000 to 8000 characters; a test proves no prompt can exceed it. Depth 8 was measured at up to 6 s and left out.

## D37. Calm, professional look (no neon)
- Reason: the user asked to remove the "vibe coded" neon effects and make the game look more professional. Supersedes D28 (neon restyle).
- Consequence: no glows, pulses, breathing rings, flowing dashes or burst effects anywhere (checked: no `0 0 Npx` glow shadows, glow text shadows or drop shadow filters left in any stylesheet or the splash). The side to move gets a thin accent bar on its card; the selected square a solid ring; destinations a plain dot; captures a solid red ring; the last move a lighter square tint; the route a plain line and arrow with numbered rings and red crosses (`RouteOverlay` no longer uses an SVG blur filter). Accents are muted: gold #d9ab3a for Black, steel blue for White and the AI.

## D38. Level chosen in a popup, shown on the AI's card
- Reason: the user asked to hide the difficulty bar, choose the level in a popup when picking Play vs AI, and see the chosen level during the game.
- Consequence: the slider is gone. "Play vs AI" (home menu, rules page, and the mode switch in a game) opens `LevelDialog`: four options with a signal bar meter and a one line meaning, the last choice preselected (still remembered in the browser), Start game and Cancel. The AI's player card shows the level as a badge next to BOT. The level stays fixed for the game; New game keeps it. To change it, choose Play vs AI again.

## D39. The AI speaks in a speech bubble
- Reason: the user wanted the AI's reasons to look like the AI replying, in a speech bubble (reference: a white rounded box with a tail), and plans AI reactions to the player's moves later.
- Consequence: `SpeechBubble` sits under the AI's card with its tail pointing at the robot. While the AI thinks it shows typing dots; then the model's reason with "Why?" (opens the existing popup) and a close button. It closes itself after a reading time (5 to 12 s), and hides as soon as the player picks up a piece or the result popup opens, so it never blocks a move. The sidebar note now only says what the AI played, with "Why this move?". The bubble is generic (key, text, optional controls), so future reactions can use it as is.

## D40. Speech bubble timing and calm motion
- Reason: user feedback on D37 and D39: the bubble disappeared too soon and should go when the player plays their move (or after a long wait); it should be easier to read and look more like a bubble; and the animations removed with the neon should come back.
- Consequence: the AI's reason now stays until the player plays their move; if the player waits, it leaves after 20 to 40 s (longer text, longer time; `bubbleTimeMs`). While the player holds a piece it turns see through (opacity 0.28) and clicks pass through it to the board (only its buttons catch clicks). Bigger, darker text, an "AI" label, a curved tail joined to the body under one soft shadow. Motion is back without glow: the bubble pops out of its tail, shrinks away when it leaves, and new text fades in; the route line draws itself from start to end, then the landing numbers and capture crosses pop in; a picked up piece lifts; move hints pop in; route choices pulse; the must capture ring breathes; the side to move bar slides in; the result emblem floats; menu cards lift on hover. Everything is off for users who ask for reduced motion.

## D41. Redesign after mockup/mockup_design.png
- Reason: the user asked to copy the mockup as closely as possible without hurting the UI or the user experience.
- Consequence: new top bar (back arrow, serif "Draft" title with a crown and laurels, Menu), a segmented Two Players / Play vs AI switch with "You play Black • AI plays White", richer player cards (robot portrait, BOT and a gold level badge with a crown, a status dot, a "Your turn" pill, a big pieces left number, a stack of captured pieces with "Took: N"), a wooden board frame with A to H and 8 to 1 on all four sides, a slate tint on the last move's squares and a blue ring on the moved piece, a "Black to move" banner with gold lines and diamonds, the AI move card with an info icon and "Why this move?", and ornamental page corners. Styles are in `src/ui/chrome.css`, loaded last. Where the mockup was unclear or would hurt use:
  - Square names follow the board's labels everywhere (move list, AI card, Learn captions, AI prompt v4), e.g. "E3 → G5"; the mockup's "4.7 → 6.5" does not match its own labels.
  - The Menu opens a short list (New game, How to play, Main menu). How to play opens over the game (`RulesDialog`) so reading the rules never ends a game; the back arrow returns to the main menu. Anything that would lose a game asks first (`ConfirmDialog`, "Keep playing" has the focus).
  - On phones held sideways the BOT badge is hidden, so the AI's name fits; the robot portrait and level badge already say it is the AI.
  - In Learn, Gold Bot gets gold eyes so the two robots differ.
- `squareName` moved into the engine, so the AI module does not depend on the UI.

## D42. AI reactions to the player's moves
- Reason: the user asked for the AI to tease bad moves and praise good ones.
- Consequence: before the AI's turn, the engine judges the player's last move (`src/ai/judge.ts`, 4 turns of look ahead, in the background worker): a **blunder** (at least 1.0 piece worse than the best move, or a forced win missed) or a **great move** (a forced win found, a multi jump, or the only good move, at least 1.0 piece better than every other). Ordinary, slightly worse and forced moves get nothing, so reactions stay rare. The verdict and its facts go into the AI's existing prompt (v5), which asks for one short line: gentle, playful teasing (never insulting) or warm praise; otherwise an empty "reaction". No extra model call. A reaction is only kept when the engine asked for one, and is stored on the AI's history entry with the verdict. The speech bubble shows it first (warm red for a tease, green for praise), then the AI's reason; the "Why this move?" popup shows the engine's verdict ("Your previous move: a blunder. ..."). The proxy schema requires `reaction` (empty when not needed). Dev only `?scenario=react` sets up a position where E3 → D4 is a blunder.

## D43. Trash talk: an aggressive rival with a free hand
- Reason: the user asked for more aggressive replies and a free hand for the AI to say what it likes. Supersedes the gentle tone of D42.
- Consequence: prompt v6 gives the AI a cocky, trash talking rival persona and asks for a reaction after every player move (not only engine judged ones): roast mistakes, brag, taunt, mock the plan, grudging respect for good moves; savage and funny; mild swearing allowed. It may still answer "" when it has nothing to say. The only limits keep it about the game: no slurs, no hate, nothing about real world looks, family, identity or sex, no threats. The engine's verdict is still added when it found a blunder or a great move ("Roast them for it" / "grudging respect"), so those reactions are deserved, and it still appears in "Why this move?". To keep it fresh, the prompt quotes the AI's last 3 lines and asks for something new, never opening with "Nice try", and says pieces and kings, never pawns. The bubble shows plain banter in dark bold, a roast after a blunder in warm red, respect after a great move in green.

## D44. Levels Easy, Medium, Hard, Strongest: the engine limits the model's choice
- Reason: the user asked for four levels whose strength comes from the engine, not only the prompt, with the LLM still choosing the move, and for the level to be fixed per game (for the coming leaderboard). Supersedes the level table of D36 and the "change at any time" rule.
- Terms: a **turn** (a **ply**) is one move by one side; a multi jump is one turn. "6 turns ahead" means 3 moves by each side, the AI's own move first. The UI says "turns", never "moves ahead", so it is exact.
- Consequence: `src/ai/difficulty.ts`: Easy looks 1 turn ahead and offers every legal move; on about 3 turns in 10 (random, Easy only) it leaves the scores out so the model chooses on its own (a deliberate slip). Medium 2 turns, the best 5 moves. Hard 4 turns, the best 4. Strongest 6 turns, the best 3. Default Medium. The search is the existing one (negamax with alpha beta, plus up to 8 extra turns while a capture is pending, in a Web Worker). `src/ai/candidates.ts` picks the best N by score, ties broken by the engine's move order, so the list is deterministic and the server can recompute it. The prompt (v7) lists only those moves, numbered from 1 ("the engine's best 3 of your 9 legal moves"); the model's number is checked against that list, with the usual 3 retries and the fallback message. If the look ahead fails at Medium, Hard or Strongest the list cannot be built, so the turn fails with Retry (Easy plays on without scores). The worker's fallback now searches on the page at the **same** depth (previously 2 turns), so the candidates never differ from the server's. A level is fixed for a game: choosing another one starts a new game (asking first during a game). The level is in the game state, on every AI history entry, on the AI card chip and in "Why this move?" ("Hard level: the engine looked 4 turns ahead and offered the AI its best 4 of 9 moves"). The level choice also lives in the game's Menu sheet next to the mode choice (a panel on wide screens, a bottom sheet on phones).
- Measured search time (Node, 919 positions from 8 varied self play games): 1 turn median 0.1 ms (max 1.4); 2 turns 0.3 ms (max 2.6); 4 turns 2.9 ms (p95 12.5, max 28); 6 turns 25 ms (p95 117, max 268). The model's reply (1.5 to 5.6 s in the live check) dominates each AI turn.

## D45. 18+ consent for Strongest, language rules enforced in code, Terms and notices
- Reason: the owner asked for clean language at Easy, Medium and Hard, trash talk only at Strongest behind an 18+ self declaration and a notice, rules enforced by code and not only the prompt, a Terms and notices sheet, and no hyphens or dashes in any text shown to players. Supersedes the "free hand" of D43.
- Consequence (language): prompt v8 has two voices: clean and playful (Easy, Medium, Hard) and a cocky trash talker (Strongest). `src/ai/language.ts` holds every word list and checks every reaction before it is shown: mild swearing (damn, hell, crap, ass, shit and similar) passes only at Strongest and only right after a move the engine verified as a blunder; insults about the play only at Strongest; strong swearing (the f word and stronger), slurs, hate, sexual words, real world traits, family and identity phrases and threats never. Text is normalised first (lower case, accents removed, leetspeak such as sh1t and $hit, masks such as f*ck, stretched letters, dots inside a word, spaced out letters). Words match whole words with the usual endings, so harmless words that contain a listed word (class, assess, shell, Scunthorpe, fatal) pass. A line that breaks a rule is replaced with a clean fallback line chosen by the engine's verdict. The AI's reason is always held to the clean rules. Hyphens and dashes are taken out of the AI's lines. Limit: a word list catches words, not meaning.
- Consequence (consent): choosing Strongest anywhere (level dialog, Menu sheet) first asks "Strongest level is for adults. Are you 18 or older?", then the strong language notice with a link to the Terms. No or Cancel end with a friendly message and nothing changes (the previous level and any game in progress stay). Focus starts on No or Cancel. Acceptance is stored in the browser as `{ version, acceptedAt }` under `draft.strongestConsent`; a new `NOTICE_VERSION` asks again. No age is stored. It is a self declaration and cannot verify age. While playing Strongest the AI card shows "18+ · Strong language" as a label on its top edge (it fits at every screen size from 320 px wide and in landscape).
- Consequence (Terms): `TermsDialog` from the Menu, the home screen and the Strongest notice (and from the nickname form in phase 4). The text is a draft, kept in `docs/02-design/terms-and-notices.md`, not legal advice. Contact: checkvia.games@gmail.com.
- Consequence (no dashes): a test renders every screen and dialog and fails on any hyphen or dash in visible text or screen reader labels. Two old ones were fixed ("top scored", and ", " for no multi jump, now "None").

## D46. No hyphens or dashes in written text (Change 1)
- Reason: the owner asked for no hyphens, em dashes or en dashes in anything a person reads: the AI's replies, the UI, the Terms, and the prose of the README and the docs.
- Consequence: one sanitizer, `withoutDashes` in `src/ai/language.ts`, for all AI text before it is shown or stored: a hyphen between letters becomes a space, a spaced hyphen or any dash becomes a comma (a full stop before a capital letter), number ranges become "3 to 4", a negative number becomes "minus 0.6", move arrows become "→", and a hyphen starting or ending a word, several in a row, or a dash at the start or end of a line are removed. Every hyphen and dash character counts (non breaking hyphen, figure dash, minus sign, soft hyphen). The prompt (v9) asks for no hyphens or dashes and for compound words split or joined. The engine's verdict text uses "→", failure details are cleaned, and two UI strings were reworded. Tests: awkward cases in `language.test.ts`, every screen and dialog in `tests/no-dashes.test.ts`, and the prose of the README and the docs in `tests/docs-no-dashes.test.ts` (code blocks, inline code, paths, URLs and identifiers are left alone; `docs/phases` holds the owner's requests as written). No date is shown to players yet; when one is (the leaderboard), it is written like "13 Nov 2026".

## D47. "Why?" on demand and a chat bubble with a fixed slot (Changes 2 and 3)
- Reason: the owner asked to hide the reasoning until "Why?" is pressed, and for a responsive chat bubble tied to the AI card that never moves the board.
- Consequence (Why?): after an AI move only the compact line ("AI played E3 → D4", in the side panel) and the reaction show. "Why?" (aria expanded, a 44px touch target) shows first the engine's checked facts, then the AI's own words labelled "AI generated, may be wrong"; a part with nothing in it is left out, and with neither there is no button. It closes on every new move and every new game. On phones it opens as a card floating above the page with a close button; on tablets and desktop it opens inline in the side panel. The old popup (`AiReasonDialog`) and the old speech bubble are gone.
- Consequence (bubble): a slot of fixed height is reserved under the AI card in every game against the AI, so the board never moves; the tail points at the avatar. The slot costs 85px on phones (3 lines of 15px text) and 70px on larger screens (2 lines of 16px); on desktop the board shrinks by that much (from 604px to about 534px at 1280x800; squares stay above 54px). To fit the AI card, the bubble, the board, your card and the status line at 375x667, phones lose the header's mode switch (it is in the Menu sheet), the gaps shrink to 6px and the cards to 56px; squares are not made smaller (37.4px at 375 wide, set by the width, as before). Exception: phones held sideways put the bubble at the top of the side panel, next to the card, because a slot under the card would shrink the squares from about 31px to about 23px. Colours: warm red after a blunder (label "Your slip"), green for respect (label "Respect"), a neutral surface for banter. Typing dots while the AI thinks. It clears when the player picks up a piece, and on New game, mode and level change. Plain text only; a polite live region announces each new line once. Lines are capped at 140 characters at a word boundary (prompt v10 asks for it too) and clipped to whole lines.

## D48. More personality, resign, and the end of the game (Change 4)
- Reason: the owner asked for greetings, idle lines, resigning with a hint when the position is lost, a game over panel with the AI's taunt and engine based tips, and better tags on the AI card.
- Consequence (lines): local line banks (`src/ai/lines.ts`, `linesGentle.ts`, `linesFierce.ts`), 10 lines per level for each of 9 contexts: game start, start after a loss, start after a win, idle, resigned, AI won, AI won after a verified blunder, player won, resign hint. No model call. None of the last 3 lines of a context repeats. Voices: Easy warm, Medium playful, Hard cocky, Strongest savage (the only one that insults the play). Laughter: haha, hehe and lol at every level, lmao at Hard and Strongest; the prompt (v11) allows laughter too. Mild swearing only in the Strongest taunt after the engine verified a blunder in that game. Tests run every line through the language rules, the dash rule and the cap. "cocky" was wrongly blocked by the word list ("cock" plus "y"); a short list of harmless words now comes first.
- Consequence (greeting and idle): a fresh greeting whenever a game against the AI starts, from a record of this tab's wins and losses (sessionStorage, no personal data, "Back for round 2, lol"). On the player's turn, an idle line after 30 seconds and one more after 60, at most two per turn; the clock pauses and resets while the page is hidden, a menu, consent, Terms, rules, level, language or Why sheet is open, an earlier move is shown, a piece is picked up, or the game is over. Development only: `?idle=fast` uses 3 and 6 seconds.
- Consequence (resign): a Resign button in the action bar and in the Menu, with a confirmation sheet ("Resign this game? The AI wins."). In two player games the side to move resigns. The result reason says who resigned. Against the AI it counts as a loss in the tab's record and `isSubmittableWin` is false, so it can never reach the leaderboard. The AI never resigns.
- Consequence (resign hint): after every AI move the engine searches the player's position 6 turns ahead (`provenLost` in `src/ai/endgame.ts`). Only when every legal move of the player is a forced loss within that search does the AI say a hint line, once per game, and the Resign button gets a gold outline. A shallower or failed search never counts. In 30 self play games (Black playing loosely, White as Hard) it fired in 22 of the 30 lost games, usually 2 to 6 turns before the end (once 42 turns before, when White did not find the quickest win).
- Consequence (game over): against the AI the result panel shows the AI's line at once in the bubble style, with Play again and Review game (back to the first position). When the AI won, "Tips from the AI" fade in after 5 seconds ("Show tips now" skips the wait; no animation with reduced motion; announced once): the player's move that cost the most (at least half a piece), a missed forced win if any, and one general tip matched to the game (pieces left to be jumped, Kings, the back row, or a default). All from engine searches 4 turns deep; labelled "Checked by the game engine". Captures are compulsory, so a missed capture cannot happen and is not a tip. After a player win: a respectful line, no tips.
- Consequence (tags): on the AI card's top edge, left of the piece count: a voice chip for every level (Friendly, Playful, Competitive, Strongest) and at Strongest a two part badge ("18+" in muted red, "Strong language" on a light surface) that is a button: it opens two sentences on the language rules and a link to the Terms. Under 360px wide and on phones held sideways only "18+" and an info icon show. Contrast at least 7 to 1.

## D49. Owner's review of Changes 1 to 4 (13 Nov 2026)
- Reason: after testing by hand, the owner asked for three changes.
- Idle lines: the AI keeps speaking while the player waits, every 30 seconds, with no limit per turn (replaces "at most two" in D48). The clock still pauses and resets as in D48; after a pause the next line waits a full 30 seconds. Lines come from the local bank, so the last 3 never repeat. Development only: `?idle=fast` speaks every 3 seconds.
- Colours: the bubble is never red. After a blunder it stays neutral and keeps the "Your slip" label; green for respect is unchanged. A line with 18+ words (mild swearing or an insult, only possible at Strongest) shows in red text (#9b1c12 on the neutral bubble, contrast above 6 to 1), in the chat bubble and in the game over panel (`hasAdultWords` in `src/ai/language.ts`).
- "Why?": opens as a floating card on every screen size (a sheet from the bottom on phones, a centred card up to 480px wide on larger screens), instead of inline in the side panel, which grew and showed a scroll bar. If a very long answer does not fit, only the card scrolls, with a thin scroll bar in the theme's colours.
- Screen readers: idle lines are shown every 30 seconds, but only the first idle line of a turn is read out (the bubble's live region keeps it; later ones are marked `announce: false`). Reactions, greetings and hints are read out as before.
- The Why card: Esc closes it wherever focus is (a window listener, not only while focus is inside the card), a tap outside closes it, and on closing keyboard focus goes back to the "Why?" button that opened it (the bubble's or the side panel's; if none was focused, as in Safari after a click, the first one on the page).
- Terms: the leaderboard, its server storage, the device id and the IP address limit do not exist yet, so they sit in one "Leaderboard" section labelled "Coming soon" and written in the future tense. "What is stored" now lists only what is stored today (the level and the Strongest acceptance in the browser, this tab's wins and losses in the tab) and says nothing is stored on our server. A new "Contact" section keeps the email. The Strongest notice did not change, so its version stays 1.
- Production build: `tests/production-build.test.ts` builds the app in production mode into a temporary folder and checks that the `?scenario=` and `?idle=fast` code is not in it.

## D50. One action bar, a phone layout that fits, and the name Checkervia (13 Nov 2026)
- Reason: the owner's phone review (widths 327 to 1245): buttons scattered, in different sizes and places; at 375x667 Resign, New game and the history controls were off screen and the status line was cut off at 650px tall; a duplicate level chip; squares under 44px.
- Action bar: Menu, Previous, Next, Resign (Result after the game) and New game, in this order at every width, each at least 44 x 44. One column: fixed to the bottom of the screen, the page keeps room for it. Two columns (desktop, phones held sideways): the bottom of the side panel, which no longer scrolls itself (it clipped the Menu sheet); the move list scrolls inside. New game and Resign left the Menu; the Menu button left the header; New game asks in a sheet (the inline confirm that replaced the button is gone, so nothing on the bar moves).
- Back arrow: it went back to the main menu, which the Menu's "Main menu" item already did, so the game screen has none. Learn keeps its back arrow, its only way out (its one item Menu went).
- Header: only the "Checkervia" title; on phones without the crown, 24px tall. Menu icon: three lines instead of the dotted grid.
- Cards: one level chip (the voice name; the level name is its tooltip) and the 18+ badge in the name row after the name, 11px text; "18+" with an info icon under 420px. Phones: 48px cards, no BOT badge and no captured stack. Phones held sideways: cards at least 300px wide where there is room, no "Took" line (still in the card's screen reader label).
- Board: the A to H and 8 to 1 labels moved into the corners of the edge squares, drawn above the pieces; the frame is 3px. Phones: 8px gutters and a board size of `min(100vw - 16px, 560px, the height left)`, so squares are 44.1px at 375px wide and everything fits at 375x650 (title 24, card 48, bubble slot 73, board 359, card 48, status 26, bar 48, gaps 4). Tablets (one column, 600px and up) also size the board by the height.
- "Why?": its own box is at least 44 x 44 (it used to rely on a larger invisible area).
- Last move: no blue. A solid gold ring on the moved piece (no glow), the warm square tint, and White's route line in warm ivory. (The request text was cut off after "Replace the blue last move"; this is the assumed meaning, to confirm with the owner.)
- Name: "Draft" became "Checkervia" in the header, the home screen, the splash, the browser tab title, the Terms, the README, the write up and the docs; new meta tags (description, Open Graph title and description) and a title inside the favicon. "Draft" meaning a draft text (the Terms' "DRAFT") and the package name are left alone; there is no share text in the app.
- Checked in headless Edge at 23 sizes (327x650 to 1440x900, and five phones held sideways from 568x320 to 915x412): the bar has five buttons in order and on screen, the status line is on screen and above the bar, one level chip, the badge clear of the title, no collision inside the cards, no clipped labels, no sideways scroll, no back arrow, squares of 44px or more at 375 wide. Tests: `tests/action-bar.test.ts`.

## D51. The splash and the end of game panel after the owner's mockups (13 Nov 2026)
- Reason: the owner added `mockup/splash_screen_mockup.png` and `mockup/winner_screen.png` and asked for them to be copied as closely as possible, for every result (AI Wins, You Win, and both two player wins).
- Owner's choices: the mockups' warm light is copied on these two screens only (an exception to D40's "no glow"; the game screen stays flat). The big titles use one bundled free font, Fraunces Black (latin only, 18 KB, SIL Open Font License, in `public/fonts`, Georgia until it loads; taken from the @fontsource/fraunces package without adding it as a dependency). Two player games keep the names Black and White. Ribbons: red for AI Wins, green for You Win!, dark with gold text for Black Wins, ivory with dark text for White Wins.
- Art: SVG only, no crops of the mockups (they say "Draft"). The pieces and the logo are files in `public/art`, so the static splash in index.html and React show the same drawings without copying them. The board scenery and the font are defined in index.html and shared by the panel. Code: `src/ui/art.tsx` (pieces, scenery, ribbon), `src/ui/Splash.tsx`, `src/ui/ResultDialog.tsx`, `src/ui/result.css` (all the panel's styles, moved out of styles.css and bubble.css), new icons in `src/ui/icons.tsx`.
- Splash: the step list became a progress bar with one line, with the same honest steps (30% from the HTML, 66% while the AI is checked, 100% "Ready"), a real `progressbar` for screen readers.
- Panel: titles in the mockup's title case ("AI Wins", "You Win!", "Black Wins", "White Wins"), "Play Again" and "Review Game", "Game time: 5:32". The tips link keeps the label "Show tips now" (the mockup's "Show tips review" reads as a slip; Change 4 asked for "Show tips now"). The AI's line keeps D49's red text for 18+ words. Focus goes to Play Again without scrolling, so the panel always opens at the result. Also fixed: "1 moves in total" now says "1 move".
- Checked in headless Edge: the splash at 375x667, 327x650, 390x844, 768x1024, 1245x800 and 667x375 (bar and line on screen, title fits, the font loaded, no sideways scroll); the four panels from real game ends at 320x568, 327x650, 360x640, 375x667, 390x844, 667x375 and 1245x800 (title fits and is on screen, no sideways scroll, buttons at least 44px tall, the corner art never over a button, focus on Play Again, Esc closes; no scroll needed from 390x844 up and on desktop, except the extra tips link after an AI win at 800 tall).
