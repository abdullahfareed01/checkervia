# Project Overview

**Checkervia** is a browser checkers game (8x8) for two players on one screen, or one player against an LLM powered AI. Built as a mentor's project; every rule is meant to be explainable line by line.

## Features
- Two player hot seat play: click a piece, then click its destination
- Play vs AI at four levels (Easy, Medium, Hard, Strongest): the engine looks 1 to 6 turns ahead (a turn is one move by one side) and offers the model only its best few moves; the AI explains itself in a speech bubble, and reacts to your moves: clean, playful banter at Easy to Hard; trash talk at Strongest, behind an 18+ notice
- Learn mode (two robots play scripted lessons), How to play, move history, result popup
- A framed board with A to H / 1 to 8 labels; all move names use them (e.g. E3 → G5)
- Full rules: forced capture, multi jumps, Kings, winner announcement
- Play vs AI: your colour is random each game and your pieces stay at the bottom. Black moves first. Our code lists the legal moves, the model picks a number, our code verifies it
- Turn display, pieces left per side, New game button

## Stack
React, TypeScript, Vite, Vitest. Deployed on Netlify. A configurable chain of free AI providers runs inside a Netlify function; keys never reach the browser. The existing engine plays when providers are absent, busy or exhausted.

## Getting started (two players only)
- `npm install`
- `npm run dev` : start the dev server. The home menu shows "AI unreachable", because the function is not running; 2 Players works.
- `npm test` : run the Vitest suite
- `npm run build` : production build

## Run locally with the AI (netlify dev)
1. `npm install`
2. Install the Netlify CLI once, as a global tool (it is not a project dependency): `npm install -g netlify-cli`
3. Set any desired provider variables in the server environment using the names in the [AI chain setup](docs/07-deployment/ai-chain-setup.md). With no provider keys, the engine still plays. Migration 6 is already installed in the configured Supabase project; shared storage needs its server variables.
4. Run `netlify dev` and open the address it prints (usually http://localhost:8888). It starts Vite and the function together.
5. The home menu should show "AI online" because engine play is available. Choose "Play vs AI"; your colour is chosen for the game.

Notes:
- If the page says "Could not proxy request", Vite is not on port 5173. Stop `netlify dev` (Ctrl+C), make sure no other `npm run dev` is running, and start `netlify dev` again. Vite refuses to start on any other port, so a clash now shows as an error in the terminal.
- `.env` is ignored by git (`.env*` in `.gitignore`); `.env.example` is the only env file that is committed. Never put a key in `.env.example`.
- Do not add a `VITE_` prefix to these names. Anything with that prefix ends up in the browser bundle.
- If `netlify dev` offers to log in or link a site, you can decline; the local `.env` is enough.
- In production, set the desired server variable names in the Netlify site's Functions environment.

## Layout
- `src/engine` rules (pure TS), `src/state` game state, `src/ui` React, `src/ai` AI module
- `netlify/functions/ai-move.ts` the LLM proxy (a thin wrapper); `netlify/aiMoveHandler.ts` its request handling
- `docs/` all planning and design docs; start with `docs/02-design/gdd.md`

## Docs
- Rules: `docs/02-design/core-mechanics.md`
- Architecture: `docs/03-technical/architecture.md`
- AI opponent and prompt log: `docs/03-technical/ai-opponent.md`
- Progress: `docs/04-production/task-backlog.md`

## Status
The D107 chat correction is implemented locally: varied turn cues, animated dots, one final remark, explicit colour/outcome guards and a sharper Strongest voice. All 2023 tests and 39 mocked browser assertions pass, plus strict typecheck and both builds. This chat correction has not been deployed; see the progress log for its verification record.

The earlier version is live at [Checkervia](https://checkervia.netlify.app), with code on [GitHub](https://github.com/abdullahfareed01/checkervia). The new free provider chain, draw update and verified engine fallback are available in the [latest tested draft](https://6afd79a4badc3fe12806e8e5--checkervia.netlify.app). Migrations 5 and 6 are applied and verified on Supabase. Production is unchanged. Provider settings are synchronized as protected Netlify secrets. Five full model benchmarks now drive the separate quality and lightweight routes, and live opening/midgame moves and taunts pass validation. Quota/access limited providers remain explicitly incomplete. All 1826 tests, strict typecheck and production build pass. Human acceptance, publishing and recording remain open. See `docs/04-production/task-backlog.md` and `docs/04-production/progress-log.md`.

Run `npm run check:migrations` to check the configured Supabase API schema without changing any records. Migration history, constraints and permissions are recorded in `docs/07-deployment/migration-status.md`.


## Admin dashboard preview
Run `npm run dev` and open `/admin/?demo=app` to explore the dashboard with sample data. The Sample data banner's Use game data button removes demo mode and opens the guarded real sign in. Samples live only in `src/admin/dev`, are never written to Supabase and are excluded from the production build. No environment switch or database cleanup is needed to remove them.

The admin page is now part of this game checkout and the normal build, in its own bundle under `dist/admin`. It has a slate theme, dotted area charts with exact values on hover, touch and keyboard navigation, player filters and audited page exports. The game sends bounded visitor and visible game events through its own server function; existing game result writes update the dashboard summary tables through migration 7's triggers.

The owner approved the database installation: admin migrations 7 and 8 are now applied and verified, with existing game data preserved. The confirmed dashboard Auth user and private password are now set up and allowlisted. Private authenticator enrollment and a reviewed application deployment remain. The draft upload awaits explicit approval of the Netlify destination. Production and preview server settings for the designated admin and the Supabase Auth key are configured. See the [admin runbook](docs/07-deployment/admin-runbook.md).
