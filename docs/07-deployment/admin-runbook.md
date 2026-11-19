# Admin dashboard: owner runbook

## Current integration status, 19 Nov 2026
The dashboard is included in the current game checkout, `Mentor's Project`, with its separate build under `dist/admin`. All nine sections are built: Overview, Players, Reports, Suspensions, Live, Countries, Who is winning, Resigned games and Audit log, with smooth edge to edge charts and a compact layout (D109) and the moderation actions (D110). All 2145 tests in 109 files and both builds pass. See `docs/04-production/dashboard-handoff.md` for the saved checkpoint and continuation order.

### Moderation actions (D110)
Open a player from Players (or use Suspend in Reports) and choose an action in the Actions panel. Every action opens one dialog: it says what will happen and whether it can be undone, and it needs a reason of at least 3 characters. The reason is saved in the Audit log together with the change, in the same database step.

- Suspend for 1 to 365 days (counted from now), Change suspension, Lift, or Ban permanently. Nothing is deleted while a player is suspended, and an expired suspension lifts by itself.
- Ban device stops the device the profile was made on from making new profiles.
- Hide from public lists keeps the username taken. Hide win removes one win from the ranking but keeps it recorded.
- Rename follows the game's username rules; Reset avatar and Remove flag clear what the player chose.
- Delete player cannot be undone and asks you to type the username first. Only the audit entry remains.
- Reports: mark Reviewed, Dismiss, Actioned (after you acted on the player) or Open again. Live refreshes every 30 seconds and never shows the board of a game in progress.

In sample mode, `&moderation=empty`, `&moderation=error` and `&moderation=refuse` show the empty, failed and refused states. Sample actions change only the page's memory and reset on reload.

For sample data, start the normal Vite server and open `/admin/?demo=app`. The Sample data banner makes the mode explicit; Use game data removes it and returns to the guarded login. Samples stay in `src/admin/dev`, never seed Supabase and are omitted from production. There is no persistent mock switch to clean up.

Phase 2c adds Countries, Who is winning, Resigned games and the full Audit log.
Countries separates current profiles and online devices from period registrations
and games; flags are player choices. Rankings use the public leaderboard's
visibility rules and verified wins, while the AI record uses reported results.
The top 25 winners across all levels always cover all time and label hidden
profiles. Resignations have per level totals and daily charts with missing days
shown as zero; all time charts show the latest 90 days. The chart's level control
does not change the top 25 resigner list, which covers every level in the chosen
period. Abandoned games are always separate.

The Audit log has search, exact action and player UUID filters, 25 entries per
cursor page, reasons and expandable details. Displayed dates follow this device;
details include exact UTC timestamps. It has no edit or delete operation. Sample
mode survives section navigation and reload, and Use game data still removes it.
Repeat the isolated browser review with `node scripts/check-admin.mjs 5190` while
the local Vite preview is running. `&report=empty`, `&report=error`,
`&report=slow` and `&report=race` exercise development states only.

Production and deploy preview have the designated admin email and protected publishable Auth key configured. The owner created the confirmed dashboard Auth user and chose the password privately. The private allowlist contains only that account, public sign ups are disabled and email sign in is enabled. A one hour authenticator setup window was opened and audited. The owner still needs to scan the authenticator after the dashboard is deployed. Do not send the password or codes through chat.

### Live migration review
The exact atomic `leaderboard-migration-7.sql` is tested after the installed draw migration 5 and AI cooldown migration 6. It adds admin/summary/visitor tables, player and report metadata, summary triggers, keyset/search indexes, server only RPC grants and the audited moderation functions. It backfills existing counts, preserving results and AI cooldowns. Before installation the live project had 15 players, 19 wins, 72 results and 12 reports.

Migration 7 is now installed as `20261118221817`, `admin_7_dashboard`, after explicit owner approval and the restored Supabase connection. Approved SHA256: `21a6ced0a0dd1042e2b4449558c6a2db8b64b31b4fc68be60d44d893baaebf93`. The separate helper search path fix is installed as `20261118222323`, `admin_8_helper_search_paths`. Do not rerun either installation.

Counts and checksums match for 16 players, 19 wins, 77 results, 14 reports and AI cooldowns. Browser roles cannot access the tables or admin/traffic functions, and the service role cannot change or empty the audit log. Live rolled back traffic checks passed with no test records left. No security warnings remain; the informational RLS notices match the deliberate server only model. See `migration-status.md` for evidence.

The game traffic code is ready: one visit per device/UTC day, visible game beats every 30 seconds, a 75 second expiry, rate limits, private hashes and failure backoff. The schema is ready; the integrated game still needs deployment to record real traffic. Existing game result writes will feed the dashboard triggers automatically. No application files have been uploaded yet. Automatic approval review blocked the proposed Netlify draft because the destination was not explicitly authorized for that upload. The verified build is ready for a draft upload to the existing Checkervia project after explicit destination approval; production remains unchanged.


## 1. One time setup

Do these in order. Steps a to d are in Supabase, e in Netlify.

**a. Database setup is complete.** Migrations 7 and 8 are applied and verified in the existing Checkervia project. Do not rerun migrations 1 to 8. Continue with the private Auth user and authenticator steps below.

When the online rooms schema is installed and reconciled with the admin queries, run this once after it: `select admin_link_rooms();` (it answers `true`). It adds the report statuses and counts for players' reports in online rooms.

**b. Turn off new sign ups.** Authentication, Sign In / Providers: turn off "Allow new users to sign up". Keep the Email provider on. The dashboard refuses to sign in while sign ups are on, and says so.

**c. Make your admin user.** Authentication, Users, Add user, Create new user: your email and a long password from a password manager (20 characters or more), and tick "Auto Confirm User". Use an email nobody else can read.

**d. Put yourself on the allow list,** with a one hour window to set up your authenticator. In SQL Editor (put your email in both places):

```sql
insert into public.admin_users (user_id, email, enroll_until)
select id, lower(email), now() + interval '1 hour'
from auth.users where lower(email) = lower('you@example.com');
```

It must say "1 row". Multi factor with an authenticator app (TOTP) is on by default in Supabase (Authentication, Multi Factor); leave it on.

**e. Netlify environment variables.** Site configuration, Environment variables (scope: Functions), add:
- `ADMIN_EMAIL`: the same email as in step c.
- `SUPABASE_ANON_KEY`: Project Settings, API Keys, the publishable key (`sb_publishable_...`) or the legacy `anon` key. The dashboard uses it only on the server, to talk to Supabase Auth.

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `LEADERBOARD_HASH_SALT` are already there from the leaderboard. Never add a `VITE_` prefix to any of them. Then deploy again (Deploys, Trigger deploy), because functions read their variables when they are deployed. For `netlify dev`, put the same two in `.env`.

**f. First sign in.** Open `/admin`, type your email and password, then press "Show the QR code" and scan it with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden or similar). Type the six digit code. You are in, and the set up window closes by itself. Save the text key shown under the QR code in your password manager: it can set up the same authenticator on a new phone.

**g. Check.** The Overview shows "Recent admin activity" with "Password accepted" and "Sign in". If the page says "The admin service is not available right now", a variable is missing: the function log (Netlify, Logs, Functions, `admin-auth`) names it, never its value.

## 2. Signing in and out
- Sign in at `/admin`: email, password, then the code from your authenticator app. Codes change every 30 seconds.
- You are signed out after 30 minutes without a click or key press, and after 12 hours in any case. A reload keeps you signed in until then.
- Sign out (bottom of the side bar, or in Menu on a phone) ends every session of your account at once.
- Too many wrong passwords from one address: a 15 minute wait (8 tries). Too many wrong codes: a 15 minute wait (6 tries).

## 3. If you lose your authenticator (or your phone)
1. In Supabase SQL Editor, remove the old authenticator, end every session, and open a 30 minute window to set up a new one:

```sql
delete from auth.mfa_factors where user_id = (select user_id from public.admin_users where email = lower('you@example.com'));
delete from auth.sessions where user_id = (select user_id from public.admin_users where email = lower('you@example.com'));
update public.admin_users set enroll_until = now() + interval '30 minutes' where email = lower('you@example.com');
```

2. Open `/admin`, sign in with your password, and set up the new authenticator as in step 1f.

If you saved the text key (step 1f), you can instead add it to an authenticator app on the new phone and sign in as usual.

**Lost the password too:** Authentication, Users, your user, Send password recovery (needs email sending to work), or in SQL Editor: `update auth.users set encrypted_password = crypt('a new long password', gen_salt('bf')) where email = lower('you@example.com');`.

**Think someone else got in:** change the password as above, run the three lines in step 1 of this section, sign in again, and read the audit log for anything you did not do. Sign ins from other addresses show as separate rows; refused attempts show as "Refused".

## 4. Actions before phase 3 (SQL Editor)
Each of these does the action and writes its audit row in one step. Your admin id is `(select user_id from public.admin_users where email = lower('you@example.com'))`; below it is written `ME`. Find a player's id with `select id, username from players where username_key = lower('TheName');`.

- Suspend until a date: `select admin_suspend(ME, 'sql editor', '<player id>', '2026-12-31', false, 'player.suspend', 'The reason');`
- Ban for good: `select admin_suspend(ME, 'sql editor', '<player id>', null, true, 'player.ban', 'The reason');`
- Lift a suspension (the AI's or yours): `select admin_unsuspend(ME, 'sql editor', '<player id>', 'The reason');`
- Delete a player completely: `select admin_delete_player(ME, 'sql editor', '<player id>', 'Asked by email on 16 November');`

A suspended player keeps their profile, wins and stats; the game shows them a calm message with the days left. An expired suspension lifts by itself: nothing needs to run. Lifting it early takes effect on their device the next time the game opens.

## 5. What the numbers mean
These are defined in migration 7 and shown from phase 2 on. Days are UTC days. The period includes today: seven days means today and the previous six UTC days. Current registered players, reports, suspensions and online devices do not change with the period. All time selects all history for the headline totals, while daily and weekly charts stay bounded to the latest 90 days. Chart captions explain that boundary. Weekly active counts include only selected days, so edge weeks can be partial; empty weeks are shown as zero. Each chart has an expandable table with exact values. Visitor and heartbeat figures populate after the integrated game is deployed with the approved schema. Expired sessions are excluded from online counts; old daily marks are periodically cleared.
- **Registered players:** profiles now (every new profile minus every deleted one).
- **New registrations:** profiles made per day.
- **Visitors:** different devices that opened the game on a day, counted once per device per day. No personal data: the device is kept as a scrambled mark that changes every day and is deleted after two days; only the number stays. A visitor over several days counts on each day.
- **Players online now:** devices with a game on screen in the last 75 seconds (from the heartbeat, phase 3).
- **Active players:** players with at least one reported game that day, or that week (Monday to Sunday).
- **Games played:** reported game results against the AI (wins, losses, draws), by the day the game ended.
- **Wins and losses by level:** the players' wins and losses at Easy, Medium, Hard and Strongest. The AI's record is the other side of the same games.
- **Resigned games:** losses where the player pressed Resign. **Abandoned games** (no move for a minute, the AI's report) are counted apart and are never resignations (D87).
- **Open reports:** reports nobody has reviewed yet (the AI's reports for abandoned games, and players' reports from online rooms once they exist).
- **Suspended players:** players whose suspension has not ended, including permanent bans.
- **Unique reporters:** how many different people reported a player. The AI counts as one. One person reporting many times still counts once, so it cannot push a player towards a ban alone.

## 6. Player browsing and CSV exports
- Apply filters to search usernames or combine status, country, level and joined or active UTC dates. Clear filters returns to page one. Choose any of the nine sorts and either direction. Date ranges include the whole last UTC day.
- Lists show at most 25 players per page, with Previous page and Next page controls. No exact total is claimed. Verified wins, reported games, draws, resignations, abandoned games and unique reporters remain distinct.
- Select a username to open the audited details. Back to players keeps the filters and page. Games and wins show the latest 50 each; reports and admin history show the latest 100 each. Device and IP markers are shortened; profile tokens are never displayed.
- Export this page downloads just the selected filtered page as CSV. Every export must save its audit entry first; an audit failure refuses the export. The export excludes raw hashes and profile tokens, quotes CSV cells and neutralizes spreadsheet formulas. Exporting every matching player at once is outside this step.
- Preview only: `http://localhost:5187/admin/?demo=app` uses made up records. It does not sign in to the real service or change live players.

## 7. Free plan limits
- Netlify's free plan is 300 credits a month, a hard limit: when it runs out the whole site is paused until the next month. Each function call is a web request (2 credits per 10,000) plus its run time (10 credits per GB hour), and each production deploy costs 15 credits. The dashboard itself is light (a few calls per page); the heartbeat (phase 3) is the part to watch.
- Supabase's free plan: 500 MB of database, 5 GB of data out a month, 50,000 monthly active Auth users (only you here), and the project pauses after a week without use.
