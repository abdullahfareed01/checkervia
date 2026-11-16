# Random colours, idle lines, the record popup and two layout fixes (16 Nov 2026)

These belong in `decisions-log.md` and `progress-log.md` as soon as the other session's changes to those files are committed. The numbers D81 to D84 were free when written.

## D81. Random colours against the AI, like chess.com
- Reason: the owner. The player was always Black and the AI always White.
- Every new game against the AI gives the player Black or White, one chance in two (`randomSide` in `src/state/sides.ts`). The reducer stays pure: Home (`Root.tsx`), New game, Play vs AI and the mode switch pick the colour and pass it in the action (`humanSide`). Games started from a prepared setup (tests, development scenarios, `?testwin=`) are Black. Two player games are unchanged.
- Black always moves first, so as White the AI opens: the game starts with the AI thinking (`aiPhaseFor` now asks whose colour is to move against `humanSide`). The constant `AI_PLAYER` is gone; `aiSideOf(state)` gives the AI's colour everywhere: the cards, the names, the bubble, the robot's face, the Why? sheet, the sounds, the result panel, the tips (the player's own moves and back row), the leaderboard and the session records.
- Your pieces are always at the bottom: with White the board view turns round (`flipped` in `BoardView`; `flipPosition`, `flipMove`, `flipBoard` in `moveGeometry.ts`). Squares keep their own names, so clicks, screen readers, the move list and the notation do not change; the coordinates are drawn in the screen's left column and bottom row (1 to 8 down, H to A along). The move animation and the route line are drawn on the turned board. The win bar puts your colour at its bottom.
- At the start of every game a banner floats over the board for about 3 seconds, or until your first move: "You are White. The AI moves first." or "You are Black. You move first." (`SideIntro.tsx`, `sideIntro.css`). It takes no space and lets taps through, so nothing moves. No greeting when the AI opens (the greetings say "your move first").
- Leaderboard: the browser sends `colour` with a win (queued wins without one were Black). The server replays the whole game from the start for that colour, the AI's first move included for White: every move of both sides must be legal, the game complete and won by that colour, so a forged colour is refused as "notWin"; any other value is a bad request. The move count is the player's own moves for both colours, so the ranking weighs both the same. The duplicate checks are unchanged (game id, and the same moves never count twice). Reports are per game id, so every game counts once for the player and the AI, whatever the colour.
- Tests: `tests/random-colour.test.ts`, `tests/leaderboard/colour.test.ts`. Checked in headless Edge on the owner's `netlify dev` at 320 by 568, 375 by 667 and 390 by 844, as White and as Black: no sideways scroll, the board in the same place in both, the AI's first move shown.

## D82. Idle lines: after 30 seconds, then every 5, escalating, until a move
- Reason: the owner. The AI should keep talking until the player moves (tapping or picking up a piece no longer pauses it), every 5 seconds after the first line, and escalate: first "Hello? Is someone there?", then angry, then warnings that it will report the game. All levels.
- `IDLE_DELAYS_MS` is now 30 seconds, then 5. `idleContext(count)`: lines 1 and 2 from `idle` (rewritten: is someone there?), 3 to 5 from `idleAngry`, 6 and after from the new `idleWarn`. The resign pressure still waits while a piece is picked up (`busy`).

## D83. The AI's record popup: only true lines
- Reason: two owner bugs. After winning, the popup said "After this game there will be one more addition to my wins". With 45% overall it said "Numbers do not lie. I am simply very good at this".
- `aiStatsTaunts(..., gameOver)`: after the game nothing talks about a win still to come; the brag lines need a win rate of half or more, otherwise two self mocking lines take their place.

## D84. Two layout fixes
- The AI card's "Thinking..." dots grew their width, so on narrow phones they wrapped one per line and the board moved up and down. They keep their width now and are revealed by a clip.
- The chat bubble and its tail are one shape: one drop shadow around both, the tail overlapping the bubble's edge.
