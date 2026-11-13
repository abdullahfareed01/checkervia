# Project Overview

**Draft** is a browser checkers game (8x8) for two players on one screen, or one player against an LLM powered AI. Built as a mentor's project; every rule is meant to be explainable line by line.

## Features
- Two player hot seat play: click a piece, then click its destination
- Play vs AI at four levels (Easy, Medium, Hard, Strongest): the engine looks 1 to 6 turns ahead (a turn is one move by one side) and offers the model only its best few moves; the AI explains itself in a speech bubble, and reacts to your moves: clean, playful banter at Easy to Hard; trash talk at Strongest, behind an 18+ notice
- Learn mode (two robots play scripted lessons), How to play, move history, result popup
- A framed board with A to H / 1 to 8 labels; all move names use them (e.g. E3 → G5)
- Full rules: forced capture, multi jumps, Kings, winner announcement
- Play vs AI: you are Black, the AI is White. Our code lists the legal moves, the model picks a number, our code verifies it
- Turn display, pieces left per side, New game button

## Stack
React, TypeScript, Vite, Vitest. Deployed on Netlify. The model is `openai/gpt-oss-120b` through OpenRouter. LLM calls go through a Netlify function so the API key never reaches the browser.

## Getting started (two players only)
- `npm install`
- `npm run dev` : start the dev server. The home menu shows "AI unreachable", because the function is not running; 2 Players works.
- `npm test` : run the Vitest suite
- `npm run build` : production build

## Run locally with the AI (netlify dev)
1. `npm install`
2. Install the Netlify CLI once, as a global tool (it is not a project dependency): `npm install -g netlify-cli`
3. Create a `.env` file in the project root by copying `.env.example`, then fill in both values:
   - `OPENROUTER_API_KEY` : your OpenRouter key
   - `LLM_MODEL` : `openai/gpt-oss-120b`
4. Run `netlify dev` and open the address it prints (usually http://localhost:8888). It starts Vite and the function together.
5. The home menu should show "AI online". Choose "Play vs AI" and make a move as Black.

Notes:
- If the page says "Could not proxy request", Vite is not on port 5173. Stop `netlify dev` (Ctrl+C), make sure no other `npm run dev` is running, and start `netlify dev` again. Vite refuses to start on any other port, so a clash now shows as an error in the terminal.
- `.env` is ignored by git (`.env*` in `.gitignore`); `.env.example` is the only env file that is committed. Never put a key in `.env.example`.
- Do not add a `VITE_` prefix to these names. Anything with that prefix ends up in the browser bundle.
- If `netlify dev` offers to log in or link a site, you can decline; the local `.env` is enough.
- In production, set the same two names in the Netlify site's environment variables.

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
All features are built and tested (812 tests). Left: GitHub push, Netlify deploy (see `docs/07-deployment/deployment-guide.md`), and a screen recording. Progress: `docs/04-production/task-backlog.md`.
