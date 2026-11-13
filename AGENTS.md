# Agent Instructions and Working Rules

## Stack
- React, TypeScript (strict), Vite, Vitest. Deploy to Netlify.
- Ask before adding any library or dependency.

## Architecture rules
- Four layers: `engine` (rules), `state` (game state), `ui` (React), `ai` (LLM module).
- Dependencies point one way: `ui` -> `state` -> `engine`; `ai` -> `engine`. Never the reverse.
- `src/engine` is pure TypeScript: no React, no DOM, no fetch, no randomness, no time. Same input, same output.
- Engine functions never mutate their input; they return new values.
- The LLM API key lives only in the serverless function. Never in `src/`, never in the browser bundle, never committed.

## Gameplay rules
- Read `docs/02-design/core-mechanics.md` and `docs/03-technical/decisions-log.md` before changing any gameplay.
- Do not change a decided rule silently. Propose the change, get approval, then update the docs and tests together.

## Testing
- Every rule gets at least one test; every bug fix gets a regression test.
- Run `npm test` before calling any task done. Report failures honestly.
- Do not weaken or delete a test to make it pass.

## AI module
- Never trust model output. Verify the chosen move is in the engine's legal list before playing it.
- Max 3 retries, then show the fallback message. Never play an unverified move.

## Code style
- Small functions, clear names, comments that explain why a rule exists. The author must be able to explain all code.
- No dead code, no unused abstractions.

## Workflow
- Work one backlog item at a time, in order (`docs/04-production/task-backlog.md`).
- Tick the checkbox and add a line to `progress-log.md` when a task is done.
- Log new technical decisions in `decisions-log.md`.
