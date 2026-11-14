# Deployment Guide

Checkervia is a static Vite site plus Netlify functions: `netlify/functions/ai-move.ts`, which holds the OpenRouter key, and the leaderboard functions (see Leaderboard setup), which hold the Supabase key. Everything is in `netlify.toml`: build command `npm run build`, publish folder `dist`, functions folder `netlify/functions`.

## One time setup
1. Push the code to a GitHub repository (see the release checklist). `.env` is git ignored; never commit a key.
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
4. Play a two player game and open Learn (neither needs the key).

## Costs and limits
- Each AI turn is one model call (up to 4 with retries). The look ahead runs in the browser and costs nothing.
- The function limits each visitor to 20 calls a minute, best effort only (per function instance). Set a spending limit on the OpenRouter key.
- Netlify stops a function after 60 s; the function gives up on the model after 55 s and the page offers Retry.

## Leaderboard setup (Supabase, D56)
The leaderboard functions store data in Supabase Postgres and use it only from the Netlify functions, with the service role key. Until the three variables below are set, every leaderboard function answers 503 and the game works as before. Nothing goes live before the owner approves phase 4.

1. Create the project: at supabase.com, New project. Pick a region near most players and save the database password somewhere safe (it is not needed by the app).
2. Run the migration: in the project, SQL Editor, New query, paste all of `docs/07-deployment/leaderboard-migration.sql` and Run. It creates four tables (`players`, `wins`, `game_results`, `rate_limits`), their indexes, three functions (`leaderboard_ranked`, `player_level_stats`, `hit_rate_limit`), turns Row Level Security on everywhere with no policies, and takes every right away from the public `anon` and `authenticated` roles. Run it once only; it is not written to be run twice.
3. Check it: Table Editor shows the four tables, each with "RLS enabled". In SQL Editor, `select * from leaderboard_ranked(4, null);` returns no rows and no error.
4. Find the values: Project Settings, API Keys. Copy the Project URL and a secret key: either a new secret key (it starts with `sb_secret_`) or the legacy `service_role` key (a long JWT starting with `eyJ`). Both work (D58). Never use a publishable key or the `anon` key for this, and never put the secret key in the browser: it bypasses Row Level Security.
5. Make the salt: any long random text, for example the output of `node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`. Make it once and keep it: changing it later makes new device and IP hashes differ from the stored ones.
6. In Netlify, Site configuration, Environment variables, add (scope: Functions):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `LEADERBOARD_HASH_SALT`
   No `VITE_` prefix, ever. For `netlify dev`, put the same three in `.env` (git ignored).
7. Run migration 2 (D61, D62), once, after migration 1 and before the version with the Profile screen goes live: SQL Editor, New query, paste all of `docs/07-deployment/leaderboard-migration-2.sql` and Run. It adds `avatar` and `username_changed_at` to `players`, the table `username_reservations` (old usernames kept for their player for 30 days), a trigger that refuses a reserved name, the function `rename_player`, and makes `leaderboard_ranked` again with the avatar. Run it only once: a second run stops at its first line with "already exists" and changes nothing. Check: Table Editor shows five tables, each with "RLS enabled", and `select * from leaderboard_ranked(4, null);` still returns no error. The site's new version needs it: until it is run, claiming a username and the ranking answer 503.
8. Check the live functions: `https://<site>/.netlify/functions/get-leaderboard?level=4&period=week` must return JSON with `"rows":[]` (an error with the code `unavailable` means a variable is missing or the database cannot be reached; the function log says which variable, never its value).

The functions: `check-username` (GET), `claim-username` (POST: username, country code or "none", avatar id; no country is ever taken from the connection), `submit-win` (POST, sent by itself after a qualifying win, D61), `report-game` (POST), `get-leaderboard` (GET), `get-profile` (GET), `update-profile` (POST: any of username, country, avatar; a username once every 7 days). The browser sends a random device id in the `x-checkervia-device` header and, after claiming a username, its token as `Authorization: Bearer`.

Moderation: in Table Editor set `hidden` to true on a row of `players` (the player disappears from every list and their profile is not found; the username stays taken) or of `wins` (that win stops counting). To remove a player on request (the Terms promise this by email), delete their row in `players`: their wins, results and reserved old names go with it. To free a reserved old name early, delete its row in `username_reservations`.

## Testing the leaderboard by hand (development only, D60)
With `netlify dev` running and the three Supabase variables in `.env` (and migration 2 run), open `http://localhost:8888/?testwin=strongest` (or `easy`, `medium`, `hard`). Without a profile on this browser the Profile screen comes first; then the game opens already won and the result panel adds the win by itself through the real `submit-win` function and its replay check, into the real database. Each visit uses the next of 20 recorded games for that level; add `&game=5` to pick one. This works only in development: the production build does not contain it.

## Local run (for reference)
`netlify dev` (port 8888). Vite must be on port 5173 (`strictPort`): if "Could not proxy request" appears, stop every `npm run dev` / `netlify dev` window and start `netlify dev` again (`DEV-008`).
