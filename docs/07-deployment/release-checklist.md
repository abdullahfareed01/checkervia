# Release Checklist

## Before release (done 12 Nov 2026 unless marked)
Current AI validation (18 Nov 2026): all 1826 tests in 91 files pass with the thread pool, strict typecheck and production build pass. The JavaScript bundle size warning remains. The earlier draft's 64 focused browser checks describe D91. The final AI preview passes live readiness, invalid input, six legal moves across quality/fast routes and a taunt. Earlier checks cover all four engine fallback levels and live shared cooldown persistence. Five full model benchmarks are complete; quota/access limited rows remain incomplete. Human acceptance remains open. Engine fallback removes the funding prerequisite.

- [x] `npm test`: the complete suite passes; the latest count is recorded in the progress log
- [x] `npm run typecheck` and `npm run build` clean
- [x] Production build checked in a browser (`vite preview`): no console errors, no failed requests, no long tasks over 40 moves
- [x] Every screen checked at 11 sizes (320x568 to 1920x1080, portrait and landscape): no sideways scrolling, nothing cut off
- [x] Real AI checked at all four levels through `netlify dev` (42 turns, 0 failures)
- [x] `.env` ignored by git; only `.env.example` (no key) is tracked
- [x] No `VITE_` prefixed secrets; the key is read only inside the function
- [ ] A full game against the AI played by a person in the browser (only scripted games so far)

## Release (needs the owner's accounts)
- [x] Earlier version pushed to https://github.com/abdullahfareed01/checkervia
- [x] Existing Netlify site and configured functions verified at https://checkervia.netlify.app
- [x] Supabase migrations 1 to 5 verified; migration 5 applied through MCP on 17 Nov 2026 (see `migration-status.md`)
- [x] Current draft deployed and read only function checks pass: https://6afc37404f86c30c0d76110f--checkervia.netlify.app
- [x] Updated AI draft verified: https://6afcc8651024774be5219e31--checkervia.netlify.app. Quota exhaustion returns verified engine moves and persists the shared cooldown. Production is unchanged.
- [x] Final measured AI preview verified: https://6afd79a4badc3fe12806e8e5--checkervia.netlify.app. Protected secrets, separate measured routes, six legal model moves and a validated taunt pass. Entry asset hashes match the earlier verified static version; production is unchanged.
- [x] Migration 6 applied through authenticated Supabase MCP after owner authorization; live permissions, cooldown behavior and data preservation verified
- [x] Verify the deployed chain with model success at all four levels and a valid taunt; prior draft checks cover quota exhaustion, engine fallback and live shared cooldown persistence
- [x] Synchronize six selected provider settings as protected Netlify secrets after explicit authorization; verify a fresh preview deployment receives them
- [x] Five models complete all 210 benchmark cases; remaining providers stop at quota/access failures and stay unranked. OpenRouter records 100 cases and resumes after the next UTC reset.
- [ ] Publish the current tested changes and verify their deployed version
- [ ] Live checks from the deployment guide pass (health check `{"ready":true}`, AI online, a vs AI game)
- [ ] OpenRouter spending limit set

## After release
- [ ] Short screen recording of a game (vs AI, showing the level popup, the speech bubble and "Why this move?")
- [x] Live link and repository link added to the README and the write up
