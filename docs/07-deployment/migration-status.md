# Supabase migration status

Migration 9 (`accounts-migration-9.sql`, D150, saved progress) is prepared on `feature/accounts` and **not applied**. It needs migrations 1 to 8 and explicit owner approval. Its PGlite tests are in `tests/leaderboard/account-migration.test.ts`.

Verified 17 Nov 2026 against the app's configured Checkervia project through authenticated Supabase MCP.

| Migration | Status | Evidence |
|---|---|---|
| 1 | Present | Core tables and ranking function exist |
| 2 | Present | Avatar and rename columns, reservations and ranking avatar exist |
| 3 | Present | Resignation constraint and statistics functions exist |
| 4 | Present | Report table, conduct columns and conduct functions exist |
| 5 | Applied during this handoff | `20261117105444`, `leaderboard_5_draws` |
| 6 | Applied after the owner's explicit instruction | `20261117125608`, `ai_6_provider_cooldowns` |
| 7 | Applied after explicit owner approval and restored MCP login | `20261118221817`, `admin_7_dashboard` |
| 8 | Narrow admin helper security fix, applied and verified | `20261118222323`, `admin_8_helper_search_paths` |

Migrations 1 to 4 were applied manually and were absent from Supabase's migration history. Their schema was inspected directly; an empty history did not mean a fresh database. Never rerun them to fill the history.

Migration 5 ran as one transaction after the complete migration chain passed in PGlite. The permanent tests cover existing data, draws, constraints, ranking, role permissions, repeat application and rollback after a failure during function replacement.

Before and after migration 5: 12 players, 19 wins and 69 game results. Checksums of the wins and results were identical. No player or game record was inserted, changed or deleted by the migration.

The result constraint now permits `win`, `loss` and `draw`. A resignation still requires a loss. Both `ai_record` and `player_level_stats` return `draws`; the service role retains execution access and public API roles remain denied. All six tables retain RLS and deny reads to `anon` and `authenticated`.

The security advisor reported only six informational [RLS without policies notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). This matches the deliberate server only design: no browser database access, no public grants and no public policies. No warning or error was reported by that check.

Run `npm run check:migrations` for read only API probes. It uses local or environment credentials without printing their values. Use SQL or MCP for the constraint, privilege and history checks above. A draw value of zero is expected until a drawn game is reported by the updated application.

The current application update still needs deploying. Migration success alone does not publish the UI or functions.

## Migration 6: AI cooldowns

The owner subsequently explicitly authorized applying `ai-migration-6.sql` through Supabase MCP. It is now recorded as `20261117125608`, `ai_6_provider_cooldowns`; do not rerun it manually.

Live verification confirms RLS on `ai_provider_cooldowns`, no table or RPC access for `anon`/`authenticated`, and the necessary table/RPC grants for `service_role`. The RPC remains security invoker with a fixed public search path. A rollback only service role transaction verified that a shorter cooldown cannot replace a longer one, including preservation of its error code. Zero test rows remain.

Before and after migration 6: 12 players, 19 wins and 69 game results. All three table checksums were identical. No game or leaderboard table was altered. Local PostgreSQL checks additionally cover repeat application and rollback on failed installation. The shared store becomes active when the new AI function code is deployed with its existing Supabase server variables; application deployment remains separate.

Rechecked on 18 Nov 2026: authenticated MCP still records migrations 5 and 6, and all eleven read only API schema probes pass with HTTP 200, including the new AI cooldown table. The AI preview has exercised the shared store and persisted OpenRouter's limit cooldown. Production remains on its earlier application version.


## Admin migrations 7 and 8, verified 19 Nov 2026
The exact approved migration 7 was applied as `20261118221817`, `admin_7_dashboard`. SHA256: `21a6ced0a0dd1042e2b4449558c6a2db8b64b31b4fc68be60d44d893baaebf93`. Do not run it again.

Before and after installation, counts and aggregate checksums match for 16 players, 19 wins, 77 game results, 14 abandonment reports and the AI cooldown table. Existing player and report values were compared without the newly added metadata columns; no existing field changed. The overview backfills 77 games and 16 registered profiles.

All 17 public tables have RLS enabled and deny table access to browser roles. Admin and traffic functions deny execution to `anon` and `authenticated`; the service role can read the required tables but cannot update, delete or truncate the audit log.

Three [mutable search path findings](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) were resolved with the separate `admin-migration-8.sql`, applied as `20261118222323`, `admin_8_helper_search_paths`. This fixes the public path for `utc_day(timestamptz)`, `admin_like(text)` and `admin_has_rooms()` without changing their bodies, signatures or grants. Four regression tests cover paths, existing results, permissions and safe repetition. The approved migration 7 file remains unchanged.

A live service role transaction verified visitor deduplication, a heartbeat appearing in the overview and its rate limited removal. It was rolled back; no test visitor, session or rate row remains, and record checksums still match. The advisor now reports no warning or error, only 17 informational [RLS without policies notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), consistent with the server only model.

Evidence: `artifacts/admin-live-migration-verification.json`. The owner has now created the confirmed dashboard Auth user and private password. It is the sole allowlisted account; public sign ups are disabled. Private authenticator enrollment remains to be completed. Application deployment is separate from database installation.

## Online rooms migration (`leaderboard-migration-6.sql`): not applied
Merged on 20 Nov 2026 (D146). It is a different file from `ai-migration-6.sql` above and has not been run. Until it is, the room functions answer 503 and the rest of the site works. Its `online_matches.reason` check now also allows `repetition` and `noProgress` (online draws). Steps: the Online rooms setup in the deployment guide.
