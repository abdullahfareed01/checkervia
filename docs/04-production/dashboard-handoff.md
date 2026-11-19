# Dashboard handoff

## Where to continue

The integrated source of truth is this game checkout on `feature/leaderboard`.
The older `feature/admin-dashboard` worktree predates the integration. Continue
here so the dashboard retains the current game, AI, marketplace and avatar work.

## Saved foundation

- Separate admin entry and production bundle under `dist/admin`.
- Guarded password and authenticator sign in, sole administrator allowlist,
  server side authorization, rate limits and append only auditing.
- Overview with UTC periods, smooth edge to edge charts that draw in from the
  left (D109), a value and day pill on pointer, touch and keyboard, and data tables.
- A compact layout (D109): dense tables that stack into cards under 900px, and
  44px tap targets kept behind 36px looking buttons.
- Players with filters, sorting, cursor pages, audited details and page exports.
- Countries, Who is winning and Resigned games reports with bounded UTC
  periods, level controls, reported results and verified rankings kept distinct.
- Full Audit log with search, exact action and player filters, cursor pages and
  escaped entry details. Entries cannot be edited or deleted.
- Phase 3 (D110): Reports, Suspensions, Live, and an Actions panel in player
  details. Every action asks for a reason in one dialog and is saved with its
  audit row in one database step.
- Development samples under `src/admin/dev`, excluded from production and never
  inserted into Supabase.
- Efficient game visits and visible session heartbeats, with existing game
  reports feeding the summary tables.
- Approved migrations 7 and 8 installed and verified. See
  `docs/07-deployment/migration-status.md`; do not rerun installed migrations.

## Review locally

Run `npm run dev -- --host 127.0.0.1 --port 5190 --strictPort`, then open
`http://localhost:5190/admin/?demo=app`. No password is needed for sample mode.
The sample banner's Use game data link returns to real authentication.

## Remaining work, in order

1. The owner's review of phase 3. The browser check passes 250 checks across
   54 layout states (`node scripts/check-admin.mjs <port>`).
2. Replays of finished or reported games (`admin_replay` is installed).
3. Release: approved Netlify draft upload, real authentication, private owner
   authenticator enrollment and acceptance checks before production publication.
4. Future, owner idea: rewards for the players with the most wins and loyalty
   perks, sent from the dashboard. See the backlog item for its prerequisites
   (server verified ownership, a reward ledger migration with approval, a
   notice in the game).

The confirmed dashboard account is `checkervia.games@gmail.com`. Never record
passwords, authenticator keys or tokens here. The earlier enrollment window was
temporary; check it before the owner's first real sign in.

## Git recovery

A commit is a local version snapshot. Find dashboard checkpoints with
`git log --oneline --grep=checkpoint` and inspect one with `git show <commit>`.
Restore into a separate worktree for review instead of discarding current work.
A push to the existing GitHub repository provides a remote copy; a local commit
alone does not protect against loss of this computer. Build output, dependencies,
credentials and local browser artifacts are ignored and must stay out of Git.

The checkpoint includes the combined game changes because the dashboard shares
their entry points, server adapters and production build. No application upload
or production deployment is part of saving this checkpoint.

Foundation checkpoint: `fd5aecc`. Phase 2c is saved in the following analytics
commit. Phase 3 and the compact layout (D109, D110) are in the next commit; their
full suite passes 2145 tests in 109 files, both production builds pass and the
browser check passes 250 checks across 54 layout states.
Repeat checks with `npm test -- --maxWorkers=2 --pool=threads`, `npm run build`
and `node scripts/check-admin.mjs 5190`. Local evidence is under
`artifacts/admin-phase3`; screenshots and logs stay ignored by Git.
