# Task Backlog

## Dashboard continuation and saved progress (19 Nov 2026)
- [x] Save the integrated dashboard and game in checkpoint `fd5aecc`, with `dashboard-handoff.md` as the continuation record. The checkpoint passed all 2047 tests and both production builds.
- [x] D108, phase 2c: Countries, Who is winning, Resigned games and full Audit log. All 2085 tests in 108 files pass; both builds pass. Local browser review: 88 assertions across 24 layouts, including enlarged text, audit filters and cursor pages, sample navigation/reload, empty/error states and response races. No dependency, migration or deployment was added.
- [x] D109: smooth edge to edge charts drawn from the left (owner screenshot), a value and day pill, and a compact layout with 44px tap targets kept.
- [x] D110, phase 3: Reports, Suspensions, Live and moderation actions with mandatory reasons and atomic audit entries. 2145 tests in 109 files, strict TypeScript and both builds pass.
- [x] Browser check `node scripts/check-admin.mjs <port>`: 250 checks across 54 layout states pass, including chart edges, the pill, suspend, delete guard, dismiss and refusal flows.
- [ ] Wire replays of finished or reported games (`admin_replay`, already installed) with a read only board view.
- [ ] Owner review of phase 3 before release (planned stop).
- [ ] Future, owner idea: send rewards from the dashboard to players with the most wins or loyalty perks. Needs, in order: server verified cosmetic ownership (the cosmetics production item below), a reward ledger and one audited `admin_grant_reward` function (a new migration, owner approval first), a notice the player sees in the game, and eligibility lists (top winners exist in Who is winning; loyalty can use days played from `daily_active`, kept about 400 days). Entry points: a Rewards section, and Send reward beside top winners and in player details.

## Live shop previews (19 Nov 2026)
- [x] D106 follow up: effects animate automatically in visible product cards and the large preview, with Pause, Resume and visibility controls. Tags have their own row above complete circles. All 2046 tests in 107 files, strict TypeScript, both production builds, 24 layout states and 109 cosmetic browser assertions pass, including the phone screenshot regression at 200 percent text. No dependency or deployment was added.

## Current avatar correction (19 Nov 2026)
- [x] Preview follow up: add a Sleeping (Zzz) button for the existing sleepy expression. All 35 focused avatar tests pass.
- [x] D95 follow up: one persistent morphing face, continuity during rapid reversals, stable idle clocks and motion settings. All 2045 tests in 107 files, strict typecheck, both production builds and 350 browser assertions pass. Verified at a phone viewport with four times CPU throttling; changes remain local.

## Current AI chat correction (completed 19 Nov 2026)
- [x] D107: stop rapid duplicate/replacement chat, add varied turn cues and a dots transition, correct colour/result wording and enforce a sharp Strongest voice with earned praise only. All 2023 tests in 105 files, strict typecheck and both production builds pass. Browser regression: 39 assertions pass with no real model calls. Changes are local; no deployment or migration was performed for this correction.

## Marketplace owner priority (18 Nov 2026)
- [x] D106: shop usability and contrast audit, replayable effects and separate player appearances and demo inventories. Black uses the owner's dark finish; White uses the light finish in both views. Completed 19 Nov: 2023 tests in 105 files, 24 layout states and 62 cosmetic browser assertions pass; TypeScript and both builds pass. Audit and integration limits: `docs/02-design/marketplace.md`.
- [ ] Cosmetics production integration: connect recoverable accounts, paid fulfillment and server verified appearance to the separate private room branch. Bind loadouts to authenticated participant IDs and the server's assigned colours. Never grant ownership from demo storage or an opponent's displayed look. Real purchases and live appearance sharing remain disabled here.

## Admin dashboard: current owner priority (18 Nov 2026)
- [x] Integrate the previously separate admin foundation, overview and Players into this game checkout while preserving the draw, AI, marketplace and robot work.
- [x] D105: refine the dashboard theme, dotted area charts, exact hover/touch/keyboard values and an explicit removable sample mode. Integrate efficient daily visits and visible game heartbeats. All 1983 tests in 102 files, strict typecheck and both builds pass; 54 latest browser states pass.
- [x] Configure the designated sole admin email and protected public Auth key in Netlify production and deploy preview. Credential values remain out of the browser and artifacts.
- [x] Apply the approved admin migration 7 and verify existing records, summaries and permissions. Recorded as `20261118221817`, `admin_7_dashboard`. The narrow security follow up is `20261118222323`, `admin_8_helper_search_paths`; no security warnings remain. Counts and checksums preserved for 16 players, 19 wins, 77 results, 14 reports and AI cooldowns.
- [x] Verify the owner's confirmed dashboard Auth user and private password, allowlist only the requested admin email, disable public sign ups and open a one hour authenticator setup window. Setup is recorded in the append only audit log.
- [ ] Complete the owner's private authenticator enrollment after the dashboard is available.
- [ ] Upload the verified build as a draft to the existing `checkervia.netlify.app` project after explicit destination approval. Automatic approval review blocked that upload; no files were uploaded and production is unchanged.
- [ ] Continue the remaining analytics sections, reports, suspensions and moderation actions from the admin plan. Visitor and heartbeat code is implemented; live activation remains gated above.


## Current completion order (18 Nov 2026)
- [x] D96, owner priority: analyse monetization and implement a fullscreen cosmetic marketplace sample. Twelve entries, preview, explicit demo unlocks, collection and equip work; 1824 tests in 91 files, TypeScript and production build pass. Twenty final browser states pass, including the full purchase simulation and keyboard focus checks. Real checkout remains a separate production item in `docs/02-design/marketplace.md`.
- [x] D95, owner follow up: preserve the robot design; smooth mood transitions, improve laughter, add double and triple capture shock, and sustain sad idle expressions with mobile friendly motion. All 1824 tests in 91 files and 76 browser assertions pass; typecheck and production build pass. Changes are local, not deployed.
- [x] Locate the dashboard handoff: it lives in the separate `Mentor's Project admin` worktree on `feature/admin-dashboard`. Its dedicated active task is continuing phase 2 after the recorded phase 1. Dashboard progress belongs to that worktree's records.
- [x] Reconcile the handoff and release records against the verified repository, live site and database.
- [x] Complete D89: draw displays, Terms, permanent migration tests and migration 5 on Supabase. This is a prerequisite for deploying the current changes.
- [x] Improve AI errors, retry decisions and turn time limits while retaining the existing Retry flow. Automatic engine moves need a separate rule approval.
- [x] Verify affected screens in the browser: 64 checks pass, including landscape and 200 percent text. Full suite: 1547 tests in 85 files pass; typecheck and build pass.
- [x] Prepare and verify a Netlify draft deployment: https://6afc37404f86c30c0d76110f--checkervia.netlify.app
- [x] D92: implement the requested free provider chain, shared cooldowns, verified engine fallback and repeatable model evaluation. This replaces the earlier funding prerequisite; the owner explicitly authorized engine fallback. Validation: 1793 tests in 89 files, typecheck and production build pass. Complete live measurements remain a separate item below.
- [x] Apply migration 6 through authenticated Supabase MCP after the owner's explicit instruction. Recorded as `20261117125608`; live role permissions, rollback only cooldown updates and unchanged player/game checksums verified.
- [x] D93: check Netlify configuration without opening environment files; support newer Supabase secret keys and ordinary network latency; verify an updated AI draft, including live shared cooldown persistence. All 1796 tests in 89 files, typecheck and production build pass.
- [x] After explicit owner authorization, privately read the local AI settings and synchronize six protected Netlify secrets. Preserve existing OpenRouter and Supabase credentials; verify live model moves at every level and a validated taunt on the updated preview. No credential values printed or stored in artifacts.
- [x] Complete the available model comparisons: five full 210 case benchmarks, separate measured move/taunt routing, lightweight quota reservation and a verified updated AI preview. All 1826 tests, typecheck and production build pass. Protected secrets and migration 6 are installed.
- [ ] Resume the incomplete OpenRouter cohort after daily resets: 100 of 210 cases recorded, including today's full 50 request allowance. SambaNova returned 402 and Vercel 403; both remain incomplete without usable account access. These providers are not promoted as measured models.
- [ ] Complete a full human acceptance game in the browser.
- [ ] Publish the verified changes and complete the write up and recording evidence. A full human game remains an owner acceptance check.

Optional follow up after the release: review the state and AI dependency directions and consider splitting the large application bundle. D92 supersedes D91's funding and manual retry assumptions with the owner's approved free provider chain.

## Original feature backlog

- [x] 1. Board rendering
  - [x] Vite + React + TS + Vitest project set up
  - [x] Board types and initial setup in engine
  - [x] Board and pieces rendered
- [x] 2. Basic moves and turns
  - [x] Forward diagonal moves for regular pieces (engine)
  - [x] Select piece, click destination, turn alternates (black first)
- [x] 3. Captures with forced capture (engine)
  - [x] Single jump removes piece
  - [x] If any capture exists, only captures are legal
- [x] 4. Multi jumps (engine)
  - [x] Chain continues in the same turn
  - [x] No re jumping the same piece; any branch may be chosen
- [x] 5. Kings (engine)
  - [x] Crowning on far row
  - [x] Backward moves and captures for Kings
  - [x] Crowning during a capture ends the turn
- [x] 6. Win detection
  - [x] No pieces left
  - [x] No legal moves
  - [x] Winner announced, board locked
- [x] 7. Turn display, piece counts and New game (with confirmation mid game)
- [x] 8. AI mode (built and tested with fakes; still to be tried once by hand with a real key)
  - [x] Serverless proxy function with env key (`netlify/`, OpenRouter, `OPENROUTER_API_KEY` and `LLM_MODEL`)
  - [x] Prompt builder and move numbers (`src/ai`, tested with fake models)
  - [x] Reply parsing, validation and 3 retries (`chooseMove`, tested with fake models)
  - [x] Real model client (`src/ai/client.ts`, calls the proxy)
  - [x] Fallback message in the UI when `chooseMove` fails, with Retry
  - [x] Mode toggle and AI turn UI lock
  - [x] Stale replies ignored after New game or a mode change
  - [x] `.env.example`, README steps for `netlify dev`
  - [x] Live check with a real key through `netlify dev` (10 AI turns, scripted Black, v1 row filled in). Still worth one human game in the browser.
- [ ] 10. User feedback round 1 (started 12 Nov 2026 with the recommended defaults: view only history, model reason plus verified facts, SVG robot, recorded Learn game, desktop fit from about 1024x640, health check for the splash)
  - [x] Phase 0: investigate `BUG-001`. Engine cross checked (0 differences); a display issue fixed in Phase 2. User reviewed; closed.
  - [x] Phase 1: responsive layout, no page scroll on desktop, player cards with human and robot icons (needs a look in the browser)
  - [x] Phase 2: move animation and highlighted route (needs a look in the browser)
  - [x] Feedback: neon style for the route, animation and highlights, no solid borders
  - [x] Feedback: result popup with stats (You win / AI wins / two players), replacing the green winner glow
  - [x] Feedback: redesigned player cards (AI card especially)
  - [x] Bug `DEV-005`: huge yellow crown on the winner's card (fixed, regression test)
  - [x] Phase 3: history arrows (forward disabled at the latest position), move list, keyboard arrows (needs a look in the browser)
  - [x] Phase 4: AI reason popup, plus engine verified facts (prompt v2; needs a look in the browser and one live run)
  - [x] Phase 5: home menu (Play vs AI, 2 Players, How to play) and splash screen tied to real loading (health check). Learn is added to the menu in Phase 6. Needs a look in the browser.
  - [x] Phase 6: Learn mode, a two robot teaching game (4 recorded lessons, every move engine checked; needs a look in the browser)
  - [x] Difficulty levels (user request): Beginner / Casual / Strong / Expert bar; engine look ahead of 0, 2, 4, 6 turns for the model; checked live (42 turns, 0 failures)
  - [x] User feedback round 2: calm professional look (no neon), level popup instead of the bar, level badge on the AI card, AI speech bubble, long game jank fixed (`DEV-009`)
  - [x] AI reactions to the player's moves in the speech bubble (engine judged blunders and great moves; teasing and praise; D42)
  - [x] Phase 7: mobile polish; every screen checked at 11 sizes (phones portrait and landscape, tablets, desktops); bubble above the AI card on phones; two column layout for phones held sideways
- [ ] 9. Deploy, GitHub, recording, write up
  - [x] Release prep: deployment guide, release checklist, test plan and cases, submission checklist, browser tab icon, production build checked
  - [x] Write up drafted (`docs/08-submission/writeup.md`); links to add after release
  - [x] GitHub repository exists and the earlier version is pushed: https://github.com/abdullahfareed01/checkervia. Current working changes still need publishing.
  - [x] Earlier version deployed with working leaderboard endpoints: https://checkervia.netlify.app. The current draw update is not deployed.
  - [ ] Short screen recording of a game (needs the owner)
- [ ] 11. Leaderboard (D56; earlier version live, current draw update pending)
  - [x] Phase 3: server side. Migration, handlers, replay check of wins, rate limits, storage interface with Supabase and in memory adapters, tests and setup steps. Earlier version is live.
  - [x] Supabase project and the three variables configured; the live leaderboard responds successfully.
  - [x] Phase 4: leaderboard, profile screens and links. Earlier version is live.
  - [x] Profile first and automatic wins (D61): the Profile screen before the first AI game, the custom country picker, automatic wins with a retry queue, renames.
  - [x] Redesign after the mockups, avatars and the profile icon (D62).
  - [x] Migration 2 schema verified on Supabase (avatars and reserved names); do not rerun.
  - [x] Migration 3 schema verified on Supabase (resignations and AI record); do not rerun.
  - [x] Migration 4 schema verified on Supabase (reports and suspension); do not rerun.
  - [x] Apply migration 5 once and verify draw counts, data preservation and permissions. Recorded as `20261117105444`, `leaderboard_5_draws`.
  - [ ] Deploy the completed D89 application changes and verify a reported draw and an AI resignation on the live site.
