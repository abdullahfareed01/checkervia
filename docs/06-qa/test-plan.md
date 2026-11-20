# Test Plan

## Principles
- The rules engine is the single source of truth; every rule has unit tests, and a second, independent rules implementation cross checks it.
- The model is never trusted: tests use fake models to prove that no reply, however bad, can play an illegal move.
- Every bug fix gets a regression test (AGENTS.md); see the bug tracker.

## Automated (Vitest, `npm test`)
| Area | Files | What they prove |
|---|---|---|
| Engine | `src/engine/*.test.ts` | Setup, moves, forced capture, multi jumps, Kings, crowning ends a capture, win detection |
| Engine cross check | `tests/engine-crosscheck.test.ts` | Independent implementation agrees on 300 random games and 5,000 boards; 100 vs AI games all legal |
| State | `src/state/*.test.ts` | Clicks, route choice, AI phases, stale replies ignored, history review, stats, AI level |
| AI module | `src/ai/*.test.ts` | Prompt, reply parsing, retries, every level, look ahead fallbacks, prompt size limit, health check |
| Look ahead | `src/ai/search.test.ts` | Same scores as a plain search without pruning; wins, forced losses, recaptures; speed |
| Proxy | `tests/aiMoveHandler.test.ts` | Key never leaked, request limits, rate limit, structured output fallback, health check |
| Provider readiness | `tests/ai-health.test.ts` | Key and account balances, metadata failures, cache expiry and concurrent checks; no model request |
| Draw migration | `tests/leaderboard/draw-migration.test.ts` | Existing data preserved, draw counts, constraints, ranking, permissions, repeat refusal and rollback |
| Learn | `src/learn/*.test.ts` | Every scripted move legal; each lesson shows what its caption says |
| UI (render) | `tests/*.test.ts` | Menu, level dialog, speech bubble, popups, cards, history, CSS guards |
| Performance guards | `tests/long-game-perf.test.ts` | Move list items reused; the list never scrolls the page |
| Robot reactions | `tests/robot-alive.test.ts`, `tests/robot-defeated.test.ts`, `tests/robot-morph.test.ts` | Capture reactions for both colours, result priority, continuing sad idle, compatible geometry for every mood pair, mirrored eye winding and interrupted morph continuity |

## Browser checks (headless Edge over the DevTools protocol)
Done during development (see the progress log): real AI at all levels, the speech bubble's timing and click through, long game smoothness, and every screen at 11 viewport sizes. To repeat by hand, follow `test-cases.md`.

Layout check (D78): `node scripts/check-layout.mjs` with the dev server on port 5180 opens every screen and state at 16 sizes and three text and animation settings and reports overflow, cut off content, extra scrolls, scrollbars, small text and targets, overlaps and console errors. It exits with 1 when it finds anything; `--sizes`, `--screens`, `--part` and `--shots` make smaller runs.

Since D80 it also checks, on the game screen at every portrait phone size, that the board, both cards, the turn pill, the AI's bubble and the action bar are on screen together without scrolling; that no text can be selected outside text fields, the Terms and the rules (which stay selectable); that no tap highlight shows; and that every pressable thing has a pressed state.

Robot check (D95 follow up): with Vite on port 5180, run `node scripts/check-robot.mjs`. It measures the actual animated SVG outlines at the start, middle and end of each change, checks a single persistent face and seven persistent paths, and tests 24 interrupted reversals. It verifies unchanged idle clocks, smooth entry and exit from sadness, and motion being disabled both before and during a morph. It uses a 360 by 640 viewport and four times CPU throttling, saves a short frame timing sample and captures four expressions. Throttling on this computer does not replace testing on a physical low end phone. Browser artifacts are saved under `artifacts/avatar-review`.

The wink checks also measure one eye closing and reopening while the other stays round, the repeating rest, continuity when interrupted, a recognizable static wink with motion off, and resuming the cycle when motion is restored. A fifth screenshot captures the closed wink.

Marketplace (D96): `tests/marketplace.test.ts` covers validated saved data, immutable changes, bundle contents, ownership checks, storage failure and rendering. The `shop`, `shop-pieces`, `shop-unlock`, `shop-game` and `shop-journey` states in `scripts/check-layout.mjs` cover the full screen and demo flow. The journey checks cancellation, confirmation, preview without equipping, actual board colours, original finishes, saved collection, keyboard focus and an unchanged game position. Use `--debug-port` to keep a separate browser port when other tasks are checking UI concurrently.


Cosmetic ownership (D106): `tests/cosmetic-ownership.test.ts` checks both assigned colours, each player's own inventory, unchanged rival cosmetics, personal boards, stable profile namespaces and preview orientation. With Vite on port 5180, `node scripts/check-cosmetics.mjs` checks two actual boards and their movement ghosts, all five effects, separate profiles, replay, cleanup and reduced motion under four times CPU throttling. It uses synthetic inventories only; no purchase, room or backend request is made. Evidence goes under `artifacts/cosmetics`. The `shop-effects` and `shop-friend` states supplement the marketplace layout matrix, including 200 percent text. Live room sharing and server verified paid ownership remain separate integration work.



Live shop previews (D106 follow up): the cosmetic browser script also checks automatic card and large preview animation, pause and resume, offscreen and hidden page suspension, reduced motion and the supplied tag/circle screenshot regression. It saves phone card crops at 390px and at 320px with 200 percent text. The layout matrix includes `shop-live-paused` alongside effects, friend perspective and the full marketplace journey.


Shop replay and inspector (D106 follow up): the cosmetic browser script checks that repeated Replay clicks create a new finite animation timeline with actual movement, then return to autoplay where permitted. Play once in Off and Reduced animates only the selected preview, returns to stillness and never changes saved settings or game effects. Expanded bundle details and enlarged text must release a tall inspector from sticky positioning. Title and price bounds are checked on phones. Include `shop-more-details`, `shop-effects`, `shop-live-paused` and `shop-journey` in the layout matrix at normal and 200 percent text; inspect screenshots as well as the automated result.

## Not automated

- Looks (checked from screenshots)
- A full human game against the live AI
