# Deployment Guide

Checkervia is a static Vite site plus Netlify functions. `netlify/functions/ai-move.ts` serves the free provider chain and shared cooldown storage; credentials remain in Functions. The leaderboard and online room functions (see Leaderboard setup and Online rooms setup) use the existing Supabase setup. Everything is in `netlify.toml`: build command `npm run build`, publish folder `dist`, functions folder `netlify/functions`. D92's current provider variables, `ai-migration-6.sql` and evaluation instructions are in the [AI chain setup](ai-chain-setup.md).

## One time setup
1. Push the code to a GitHub repository (see the release checklist). `.env` is git ignored; never commit a key.
2. In Netlify: Add new site, Import an existing project, pick the GitHub repository. Netlify reads `netlify.toml`, so no build settings need typing in.
3. Site configuration, Environment variables, add any desired provider keys from the [AI chain setup](ai-chain-setup.md) with Functions scope. No provider key is required for engine play. Never add a `VITE_` prefix: anything with it ends up in the public browser bundle.
4. Deploy (Netlify builds on every push to the main branch).

Alternative without GitHub: `netlify login`, `netlify init` (or `netlify link`), set the desired Functions variables securely, then deploy the reviewed build. `LLM_MODEL` is not used by the new chain.

## Check the live site
1. `https://<site>/.netlify/functions/ai-move` in a browser (a GET) must show `{"ready":true}` because engine play is available regardless of external quota. An error page means the function was not deployed or cannot be reached. Readiness does not promise that an external model will answer.
2. Open the site: the splash shows "Game loaded", then the home menu badge says "AI online".
3. Play vs AI at any level: typing dots, then the AI's move with its reason in the speech bubble.
4. Play a two player game and open Learn (neither needs the key).

## Costs and limits
- Each AI turn is one model call (up to 4 with retries). The look ahead runs in the browser and costs nothing.
- The function limits each visitor to 20 calls a minute, best effort only (per function instance). Set a spending limit on the OpenRouter key.
- The function gives up on the model after 10 seconds, the browser request after 11 seconds, and the complete turn after 12 seconds. The page offers Retry. Readiness uses metadata calls with a 30 second cache and makes no model request.

## Leaderboard setup (Supabase, D56)
For the existing Checkervia project, migrations 1 to 5 are already present as of 17 Nov 2026. Do not repeat the setup migrations below. See `migration-status.md` for the verified schema, migration history and permissions; run `npm run check:migrations` for read only API probes. The instructions below also document a fresh project setup.

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
8. Run migration 3 (D75), once, after migration 2 and before the version with the stats against the AI goes live: SQL Editor, New query, paste all of `docs/07-deployment/leaderboard-migration-3.sql` and Run. It adds `resigned` to `game_results` (only a loss can be a resignation) and the function `ai_record`, the AI's totals over every player (hidden players left out), which only the service role can call. It also remakes `player_level_stats` with a `resigned` count per level, for the profile (D87). Run it only once: a second run stops at its first line with "already exists" and changes nothing. Check: `select * from ai_record();` returns one row per level that has games, and `select * from player_level_stats('<a player id>');` has a `resigned` column. Until it is run, the AI's numbers in the game show as "?" and a resigned game cannot be reported (wins and other losses still are).
8. Run migration 4 (D85), once, after migration 3 and before the version with abandoned games and suspensions goes live: SQL Editor, New query, paste all of `docs/07-deployment/leaderboard-migration-4.sql` and Run. It adds the table `player_reports` (one row per abandoned game the AI reported), the columns `reports_active` and `suspended_until` on `players`, and the functions `add_report` and `player_conduct`, which only the service role can call. Run it only once: a second run stops at its first line with "already exists". Check: `select * from player_conduct('<a player id>');` returns one row. Until it is run, `report-abandon` answers 503 (the browser keeps the reports and sends them again later), every other function reads "no reports, not suspended", and the suspension is enforced on the device only.
8. Run migration 5 (D89), once, after migration 4 and before the version with draws goes live: SQL Editor, New query, paste all of `docs/07-deployment/leaderboard-migration-5.sql` and Run. It lets `game_results.result` be `draw` and adds a `draws` count to the functions `ai_record` and `player_level_stats`. Run it only once: a second run stops at its first line (the old constraint is already gone). Check: `select * from ai_record();` has a `draws` column. Until it is run, a draw report is refused (the browser ignores it) and every count reads 0 draws.
8. Check the live functions: `https://<site>/.netlify/functions/get-leaderboard?level=4&period=week` must return JSON with `"rows":[]` (an error with the code `unavailable` means a variable is missing or the database cannot be reached; the function log says which variable, never its value).

The functions: `check-username` (GET), `claim-username` (POST: username, country code or "none", avatar id; no country is ever taken from the connection), `submit-win` (POST, sent by itself after a qualifying win, D61), `report-game` (POST), `get-leaderboard` (GET), `get-profile` (GET), `update-profile` (POST: any of username, country, avatar; a username once every 7 days). The browser sends a random device id in the `x-checkervia-device` header and, after claiming a username, its token as `Authorization: Bearer`.

Moderation: in Table Editor set `hidden` to true on a row of `players` (the player disappears from every list and their profile is not found; the username stays taken) or of `wins` (that win stops counting). To remove a player on request (the Terms promise this by email), delete their row in `players`: their wins, results and reserved old names go with it. To free a reserved old name early, delete its row in `username_reservations`.

## Testing the leaderboard by hand (development only, D60)
With `netlify dev` running and the three Supabase variables in `.env` (and migration 2 run), open `http://localhost:8888/?testwin=strongest` (or `easy`, `medium`, `hard`). Without a profile on this browser the Profile screen comes first; then the game opens already won and the result panel adds the win by itself through the real `submit-win` function and its replay check, into the real database. Each visit uses the next of 20 recorded games for that level; add `&game=5` to pick one. This works only in development: the production build does not contain it.

## Online rooms setup (D140, D141)
Online play with a friend uses the same Supabase project, the same three variables and the same Netlify functions setup as the leaderboard. Nothing new goes into the browser: no Supabase key, no Realtime. The browser asks the room functions about once a second during a game (D141).

1. Run the online migration 6 (`leaderboard-migration-6.sql`; not `ai-migration-6.sql`, which is already applied), once, before the version with online play goes live. It needs migrations 1 to 4 and works before or after migration 7: SQL Editor, New query, paste all of `docs/07-deployment/leaderboard-migration-6.sql` and Run. It adds six tables (`online_rooms`, `online_members`, `online_matches`, `online_emotes`, `online_reports`, `online_blocks`), their indexes, and the function `online_cleanup`, which only the service role can call. Row Level Security is on for all six with no policies, and `anon` and `authenticated` get no rights. Run it only once: a second run stops at its first line with "already exists".
2. Check: Table Editor shows the six new tables, each with "RLS enabled". `select online_cleanup(now() - interval '30 days', now() - interval '180 days');` runs without an error.
3. No new variables. Until migration 6 is run, the room functions answer 503 and the online screens show "Online play is having a problem"; everything else works.
4. Realtime: nothing to turn on. Leave "Allow public access" as it is; the game does not use Realtime.
5. Watch the Netlify credits (Usage): online play costs about 4 to 7 credits per hour of a game for two (D141). If they run low, raise the numbers in `POLL_MS` in `src/ui/online/roomSync.ts`.

The functions: `room-create` (POST `{}`), `room-join` (POST `{ code }`), `room-state` (GET `?code=&since=&away=1`), `room-move` (POST `{ code, match, ply, move }`), `room-resign` (POST `{ code, match }`), `room-rematch` (POST `{ code, match }`), `room-leave` (POST `{ code }`). All need the profile token.

Moderation: in Table Editor, `online_rooms` and its `online_members` and `online_matches` show who played whom and every move. To end a room at once, set its `closed_at`. Deleting a player in `players` removes their rooms, seats and blocks too.

## Testing online play by hand (development only, D145)
- Without Supabase: stop any server on port 5190, run `npm run dev:online` and open `http://localhost:5190` in a normal window and in a private window. Make a profile in each (any username), then 2 Players, Online with a friend, Create a room in one and Join with a code (or open the shared link) in the other. Both windows talk to the same in memory store inside the dev server; it is emptied when the server stops. The AI is not served in this mode, so its badge says unreachable. A phone on the same Wi Fi can join too, at the Network address Vite prints.
- With the real database: run migration 6, then `netlify dev` and use `http://localhost:8888` the same way, in a normal and a private window.
- Alone: `http://localhost:5173/?online=game` (or `lobby`, `ready`, `disconnected`, `result`) shows the online screens with a scripted friend, in any dev server.

## Local run (for reference)
`netlify dev` (port 8888). Vite must be on port 5173 (`strictPort`): if "Could not proxy request" appears, stop every `npm run dev` / `netlify dev` window and start `netlify dev` again (`DEV-008`).
