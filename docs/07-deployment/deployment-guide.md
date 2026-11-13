# Deployment Guide

Draft is a static Vite site plus one Netlify function (`netlify/functions/ai-move.ts`), which holds the OpenRouter key. Everything is in `netlify.toml`: build command `npm run build`, publish folder `dist`, functions folder `netlify/functions`.

## One-time setup
1. Push the code to a GitHub repository (see the release checklist). `.env` is git-ignored; never commit a key.
2. In Netlify: Add new site, Import an existing project, pick the GitHub repository. Netlify reads `netlify.toml`, so no build settings need typing in.
3. Site configuration, Environment variables, add both (scope: Functions, or All):
   - `OPENROUTER_API_KEY`: the OpenRouter key
   - `LLM_MODEL`: `openai/gpt-oss-120b`
   Never add a `VITE_` prefix: anything with it ends up in the public browser bundle.
4. Deploy (Netlify builds on every push to the main branch).

Alternative without GitHub: `netlify login`, `netlify init` (or `netlify link`), `netlify env:set OPENROUTER_API_KEY ...`, `netlify env:set LLM_MODEL openai/gpt-oss-120b`, then `netlify deploy --build --prod`.

## Check the live site
1. `https://<site>/.netlify/functions/ai-move` in a browser (a GET) must show `{"ready":true}`. `{"ready":false}` means a variable is missing; an error page means the function was not deployed.
2. Open the site: the splash shows "Game loaded", then the home menu badge says "AI online".
3. Play vs AI at any level: typing dots, then the AI's move with its reason in the speech bubble.
4. Play a two-player game and open Learn (neither needs the key).

## Costs and limits
- Each AI turn is one model call (up to 4 with retries). The look-ahead runs in the browser and costs nothing.
- The function limits each visitor to 20 calls a minute, best effort only (per function instance). Set a spending limit on the OpenRouter key.
- Netlify stops a function after 60 s; the function gives up on the model after 55 s and the page offers Retry.

## Local run (for reference)
`netlify dev` (port 8888). Vite must be on port 5173 (`strictPort`): if "Could not proxy request" appears, stop every `npm run dev` / `netlify dev` window and start `netlify dev` again (DEV-008).
