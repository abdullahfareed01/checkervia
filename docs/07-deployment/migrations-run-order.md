# Migrations: the order to run them

Every Supabase migration of Checkervia, in the order to run them. Each one runs once only. Before you run one, run its check in the last column: if it answers `true`, that migration is already in your database, so skip it.

## Two files are both called 6

- `ai-migration-6.sql` (step 6) is the AI cooldowns table.
- `leaderboard-migration-6.sql` (step 9) is online rooms with a friend.

They are different migrations, and both are needed. The rooms file was numbered before the AI file was added, and neither was renamed, so that the history in Supabase stays the same. Where the files live: `leaderboard-migration-6.sql` is on the `merge/online-rooms` branch, and `accounts-migration-9.sql` is on `feature/accounts`. Both arrive in `feature/leaderboard` when those branches are merged. All the others are on every current branch.

## What the repo records say

`migration-status.md` records that steps 1 to 4 were already in your database on 17 Nov 2026 (run by hand earlier), and that steps 5 (draws), 6 (AI), 7 (admin) and 8 (admin fix) were applied to the configured Checkervia project between 17 and 19 Nov 2026. Steps 9, 10 and 11 have never been run. You said 3 and 4 are applied; run the checks to confirm what your project really has. If a check for 5, 6, 7 or 8 answers `true`, do not run that file again.

## The run order

| Step | File | What it changes, in plain words | Needs first | Safe while the live game is running? | Already applied? (read only check, `true` means yes) |
|---|---|---|---|---|---|
| 1 | `leaderboard-migration.sql` | The leaderboard's base: tables for players, wins, game results and rate limits, the ranking function, and locks every table away from the public keys. | Nothing (a new project) | Only on a new, empty project. On yours it already exists and would stop with "already exists". | `select to_regclass('public.players') is not null as applied;` |
| 2 | `leaderboard-migration-2.sql` | Avatars and username changes: two new columns on players, a table of old usernames kept for 30 days, and the ranking with the avatar. | 1 | Yes. Players is locked for a moment while the columns are added. | `select count(*) = 2 as applied from information_schema.columns where table_schema = 'public' and table_name = 'players' and column_name in ('avatar', 'username_changed_at');` |
| 3 | `leaderboard-migration-3.sql` | The AI's record and resignations: a resigned column on game results, the AI totals function, and resignations in the profile counts. | 1, 2 | Yes. Game results is locked for a moment. | `select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'game_results' and column_name = 'resigned') as applied;` |
| 4 | `leaderboard-migration-4.sql` | Reports for abandoned games and the 30 day suspension: a reports table, two columns on players, and two functions. | 1 to 3 | Yes. Players is locked for a moment. | `select to_regclass('public.player_reports') is not null as applied;` |
| 5 | `leaderboard-migration-5.sql` (draws) | A game result may now be a draw, and the AI totals and profile counts include draws. Nothing about wins or the ranking changes. | 1 to 4 | Yes. One transaction; game results is locked for a moment. | `select exists (select 1 from pg_constraint where conname = 'game_results_result_with_draws') as applied;` |
| 6 | `ai-migration-6.sql` (AI) | A small table that remembers when an AI provider must rest after a limit, shared by every function. No game table changes. | Nothing in practice (written to follow 1 to 5) | Yes. A new table only. | `select to_regclass('public.ai_provider_cooldowns') is not null as applied;` |
| 7 | `leaderboard-migration-7.sql` (admin) | The admin dashboard's database: admin list and audit log, banned devices, summary tables for the charts kept up to date by triggers, and the admin functions. Fills the summaries from existing games. | 1 to 4 (tested after 5 and 6) | Mostly. It is one long transaction that locks players, wins, game results and reports until it ends, so saving a game waits a few seconds. Run it at a quiet time. | `select to_regclass('public.admin_audit') is not null as applied;` |
| 8 | `admin-migration-8.sql` (admin fix) | Fixes the search path of three helper functions from step 7. Their behaviour and rights do not change. | 7 | Yes. Instant. | `select count(*) = 3 as applied from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('utc_day', 'admin_like', 'admin_has_rooms') and 'search_path=public' = any (p.proconfig);` |
| 9 | `leaderboard-migration-6.sql` (rooms) | Online rooms with a friend: six new tables (rooms, members, matches, emotes, reports, blocks) and a clean up function. | 1 to 4 (not 5, and before or after 7) | Yes. New tables only; the live game ignores them until the rooms version is deployed. | `select to_regclass('public.online_rooms') is not null as applied;` |
| 10 | No file: in a new tab run `select admin_link_rooms();` | Connects the rooms to the admin dashboard: report statuses and counts for room reports. It should answer `true`. It is safe to run again. | 7 and 9 | Yes. Quick; changes only the room reports table. | `select exists (select 1 from pg_trigger where tgname = 'online_matches_admin_stats') as applied;` |
| 11 | `accounts-migration-9.sql` (saved progress) | Optional email login: tables linking a profile to an email login, extra device keys, saved shop and settings, login code bookkeeping and the clean up queue. Emails themselves stay in Supabase Auth. | 1 and Supabase Auth (written and tested after 1 to 8) | Yes. New tables only, in one transaction; nothing changes for players until `ACCOUNTS_ENABLED=1` is set and deployed. | `select to_regclass('public.player_accounts') is not null as applied;` |

## All the checks at once

This only reads. It lists each step with `true` (applied) or `false` (not yet).

```sql
select step, applied from (values
  ('1 leaderboard-migration.sql', to_regclass('public.players') is not null),
  ('2 leaderboard-migration-2.sql', (select count(*) = 2 from information_schema.columns where table_schema = 'public' and table_name = 'players' and column_name in ('avatar', 'username_changed_at'))),
  ('3 leaderboard-migration-3.sql', (select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'game_results' and column_name = 'resigned'))),
  ('4 leaderboard-migration-4.sql', to_regclass('public.player_reports') is not null),
  ('5 leaderboard-migration-5.sql (draws)', (select exists (select 1 from pg_constraint where conname = 'game_results_result_with_draws'))),
  ('6 ai-migration-6.sql (AI)', to_regclass('public.ai_provider_cooldowns') is not null),
  ('7 leaderboard-migration-7.sql (admin)', to_regclass('public.admin_audit') is not null),
  ('8 admin-migration-8.sql', (select count(*) = 3 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('utc_day', 'admin_like', 'admin_has_rooms') and 'search_path=public' = any (p.proconfig))),
  ('9 leaderboard-migration-6.sql (rooms)', to_regclass('public.online_rooms') is not null),
  ('10 select admin_link_rooms()', (select exists (select 1 from pg_trigger where tgname = 'online_matches_admin_stats'))),
  ('11 accounts-migration-9.sql (saved progress)', to_regclass('public.player_accounts') is not null)
) as checks (step, applied);
```

Steps 1 to 4 never appear in Supabase's migration history, because they were run by hand. Trust these checks, not the history, and never rerun 1 to 4 to fill it.

## How I run them

1. In Supabase, open SQL Editor and run the "All the checks at once" query above in its own new tab. Note the first step that answers `false`.
2. For that step, open a new SQL Editor tab (New query), paste the whole file, from its first line to its last, and press Run once. One file per tab, and never two files in one tab.
3. Wait for "Success". If it shows an error, stop and do not run it again: the files that start with `begin;` leave nothing behind when they fail, and a second run of any file stops with "already exists". Send me the error text.
4. Run the checks again. That step should now answer `true`. Then go to the next step that answers `false`, in a new tab.
5. Run each migration once only, in the order of the table. Step 10 is the one exception: it is a single line, and running it again does no harm.
6. Step 11 (saved progress) is still waiting for your approval. Run it only after you have decided to switch saving progress on (see `accounts-setup.md`).
7. A migration only changes the database. The game changes when the matching version of the site is deployed on Netlify.
