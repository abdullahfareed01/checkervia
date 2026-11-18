# Dashboard handoff

## Where to continue

The integrated source of truth is this game checkout on `feature/leaderboard`.
The older `feature/admin-dashboard` worktree predates the integration. Continue
here so the dashboard retains the current game, AI, marketplace and avatar work.

## Saved foundation

- Separate admin entry and production bundle under `dist/admin`.
- Guarded password and authenticator sign in, sole administrator allowlist,
  server side authorization, rate limits and append only auditing.
- Overview with UTC periods, dotted fading charts and exact pointer, touch and
  keyboard values, plus accessible data tables.
- Players with filters, sorting, cursor pages, audited details and page exports.
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

1. Phase 2c: Countries, Who is winning, Resigned games and full Audit log.
2. Phase 3: Reports, Suspensions, Live and guarded moderation actions with
   reasons and atomic audit entries. Traffic collection is already implemented.
3. Release: approved Netlify draft upload, real authentication, private owner
   authenticator enrollment and acceptance checks before production publication.

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
