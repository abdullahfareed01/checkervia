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
| Learn | `src/learn/*.test.ts` | Every scripted move legal; each lesson shows what its caption says |
| UI (render) | `tests/*.test.ts` | Menu, level dialog, speech bubble, popups, cards, history, CSS guards |
| Performance guards | `tests/long-game-perf.test.ts` | Move list items reused; the list never scrolls the page |

## Browser checks (headless Edge over the DevTools protocol)
Done during development (see the progress log): real AI at all levels, the speech bubble's timing and click through, long game smoothness, and every screen at 11 viewport sizes. To repeat by hand, follow `test-cases.md`.

Layout check (D78): `node scripts/check-layout.mjs` with the dev server on port 5180 opens every screen and state at 16 sizes and three text and animation settings and reports overflow, cut off content, extra scrolls, scrollbars, small text and targets, overlaps and console errors. It exits with 1 when it finds anything; `--sizes`, `--screens`, `--part` and `--shots` make smaller runs.

Since D80 it also checks, on the game screen at every portrait phone size, that the board, both cards, the turn pill, the AI's bubble and the action bar are on screen together without scrolling; that no text can be selected outside text fields, the Terms and the rules (which stay selectable); that no tap highlight shows; and that every pressable thing has a pressed state.

## Not automated
- Looks (checked from screenshots)
- A full human game against the live AI
