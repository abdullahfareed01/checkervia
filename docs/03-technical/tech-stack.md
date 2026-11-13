# Tech Stack and Engine Decisions

## Stack
| Area | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Types model board and moves; catches rule bugs early |
| UI | React | Component per board part; state driven rendering |
| Build | Vite | Fast dev server, simple config |
| Tests | Vitest | Same config as Vite, fast, TS native |
| Hosting | Netlify | Static hosting plus serverless functions in one place |
| AI proxy | Netlify Function (Node/TS) | Keeps API key off the browser |
| LLM | OpenRouter chat completions, model `openai/gpt-oss-120b`, model name from env var | Can swap model without code change |

## Environment variables (server only)
- `OPENROUTER_API_KEY` and `LLM_MODEL`. Never prefixed `VITE_`, since that would expose them.
- `.env.example` lists the names with empty values. `.env` is never committed.

## Tooling
- ESLint and Prettier are optional; ask before adding.
- No state libraries (use React `useReducer`); no UI kits.

## Performance targets
- Legal move generation for any position: under 5 ms.
- Click to updated board on screen: under 100 ms (human mode).
- AI turn: median under 5 s, 95th percentile under 15 s (to be measured with the real model).
- Timeouts: Netlify stops a synchronous function after 60 s (fixed, per current Netlify docs), the provider call gives up at 55 s, the browser waits 65 s. These are ceilings, not targets.
- Initial JS bundle: under 200 KB gzipped.
- First load on broadband: under 2 s; Lighthouse performance 90 or higher.
- Full Vitest suite: under 10 s.
- Zero illegal moves played in any AI game.

## Browser support
- Latest Chrome, Firefox, Safari, Edge.
