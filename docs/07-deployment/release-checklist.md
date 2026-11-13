# Release Checklist

## Before release (done 2026-11-12 unless marked)
- [x] `npm test`: 559 tests in 43 files pass
- [x] `npm run typecheck` and `npm run build` clean
- [x] Production build checked in a browser (`vite preview`): no console errors, no failed requests, no long tasks over 40 moves
- [x] Every screen checked at 11 sizes (320x568 to 1920x1080, portrait and landscape): no sideways scrolling, nothing cut off
- [x] Real AI checked at all four levels through `netlify dev` (42 turns, 0 failures)
- [x] `.env` ignored by git; only `.env.example` (no key) is tracked
- [x] No `VITE_`-prefixed secrets; the key is read only inside the function
- [ ] A full game against the AI played by a person in the browser (only scripted games so far)

## Release (needs the owner's accounts)
- [ ] Create the GitHub repository and push (`git init`, first commit, `git remote add origin ...`, `git push -u origin main`)
- [ ] Netlify site connected to the repository, both environment variables set
- [ ] Live checks from the deployment guide pass (health check `{"ready":true}`, AI online, a vs-AI game)
- [ ] OpenRouter spending limit set

## After release
- [ ] Short screen recording of a game (vs AI, showing the level popup, the speech bubble and "Why this move?")
- [ ] Live link and repository link added to the README and the write-up
