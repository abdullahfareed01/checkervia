# Scope and Constraints

## In scope
- 8x8 board, 12 pieces each, hot-seat play
- Forced capture, multi jumps, Kings, win detection
- AI mode via LLM with legal move list, validation, retries
- Turn display, piece counts, New game
- Netlify deploy, GitHub repo, screen recording, short write up

## Out of scope
(Some items moved into scope later at the user's request: move history (view only), animations, and AI difficulty levels. See the decisions log.)
- Draw rules, undo/redo, timers
- Online play, accounts, saved games
- Sound, animation beyond simple CSS transitions
- Multiple AI difficulty levels
- Mobile app (responsive layout only)

## Constraints
- Stack fixed: React, TypeScript, Vite, Vitest, Netlify
- API key never in the browser; serverless proxy required
- No new libraries without approval
- Author must be able to explain all code
- Rules and move checking get the most care

## Definition of done
- Two people can play a full game, all rules working
- Full game vs AI with no illegal move played
- Short write up: hardest rule, AI quality, prompt changes that helped
- Code on GitHub, short screen recording of a game
