# Checkervia: Write up

Checkervia is a browser checkers game for two players on one screen, or one player against an AI powered by `openai/gpt-oss-120b` (through OpenRouter and a Netlify function). Built with React, TypeScript and Vite, with automated engine, state, AI, UI and database tests. The latest validation is recorded in the progress log.

## The hardest rule: multi jumps
Forced capture and Kings were simple to state and to test. Multi jumps were not:
- **Captured pieces stay on the board until the move ends.** So a chain can never jump the same piece twice, and can never land on a square where a captured piece still stands. Getting this wrong lets a King loop forever or take a piece twice.
- **Two different chains can start and end on the same squares.** Around a diamond of four enemy pieces, a King can go left then right or right then left and land on the same square, taking different pieces. So a move is its full path, not just start and end. In the game, when two routes reach the clicked square, the player is asked for the next landing square, and the AI's move list shows each route.
- **Crowning during a capture ends the turn.** This turned out to follow on its own: a regular piece only jumps forward, so on its far row it has no jump left. I proved it by deleting the explicit check and seeing every test still pass (`DEV-003`).

To be sure the engine was right, I wrote a second, independent rules implementation and compared them on 300 random games (over 10,000 positions) and 5,000 random boards: zero differences. When a player reported "the AI plays illegal moves" (`BUG-001`), this cross check showed the engine was right; the real problem was that a multi jump was shown only by its start and end, so it looked like a teleport. Drawing the full route and animating each hop fixed it.

## AI quality
The model never chooses freely. Our code lists every legal move with a number, the model answers with a number, and the engine checks it. A bad answer (not JSON, a decimal, a number out of range, two different moves) is rejected with a reason and retried up to 3 times; nothing is ever played at random. Across every live check, the AI never played an illegal move.

- **v1 (numbers only):** 10 live turns, 0 rejected answers, 0 retries, latency 1 to 14 s (median about 3 s). Every move legal; playing strength was not measured.
- **v3 with look ahead:** the engine plays out every possible sequence of moves 2, 4 or 6 turns ahead (Casual, Strong, Expert) and puts a score next to each move. In 42 live turns across all levels there were 0 failures and 2.0 to 5.6 s per turn; at the look ahead levels the model chose a top scored move in 36 of 36 turns, and after 15 turns the Strong and Expert AIs were 3 pieces up on a scripted opponent.
- **Honest reasons:** the model also gives a one line reason, shown in a speech bubble but labelled as unchecked. Next to it, "Why this move?" lists facts the engine proves. The two can disagree: once the model said its piece was "safe from immediate captures" while the engine showed it could be taken next turn, and the engine was right. That is exactly why the model's words are never trusted for anything.

## Prompt changes that helped
| Version | Change | Effect |
|---|---|---|
| v1 | Rules summary, text board, numbered legal moves (with full routes for multi jumps), reply `{"move": n}`, JSON schema structured output, a retry note that says what was wrong | Zero illegal moves; the model only has to pick a number |
| v2 | Reply also carries a short `reason` | Lets the game show the AI "talking"; never used to decide anything |
| v3 | Engine look ahead scores on every move line, plus a short explanation of what the scores mean | The biggest strength gain: the model reliably picks the best scored move |
| v4 | Squares named as on the board (A to H, rows 8 to 1), e.g. `A3 -> B4` | The player and the model now name squares the same way; no change in reliability (8 live turns, 0 failures) |
| v5 | The engine judges the player's last move; after a blunder or a great move the reply also carries a short playful reaction | The AI feels alive (it teases blunders, praises great moves) at no extra cost; the engine decides when, so it is never wrong about the move |
| v6 | A cocky trash talking persona with a free hand, reacting to every move; its last 3 lines are quoted so it stays fresh | Much livelier; the first try repeated "Nice try" every time, which quoting its recent lines fixed |

What helped most was taking work away from the model: the engine finds the legal moves and searches ahead, and the model chooses and explains. What did not need changing: with structured output and a reasoning model at low effort, the answer format was almost never wrong.

## Also built from user feedback
History with arrows, a result popup with stats, a home menu with a splash tied to real loading, a Learn mode where two robots play four scripted lessons (each move checked by the engine), four difficulty levels whose strength comes from the engine, an 18 plus notice for the strongest level with language rules enforced in code, a chat bubble that never moves the board, "Why?" on demand, greetings, idle lines, resigning with an engine proven hint, tips from the engine after a loss, a calm look with simple animations, and a layout that works from small phones (portrait and landscape) to large screens.

## Links
- Live site: https://checkervia.netlify.app
- Repository: https://github.com/abdullahfareed01/checkervia
- Recording: (add after recording)
