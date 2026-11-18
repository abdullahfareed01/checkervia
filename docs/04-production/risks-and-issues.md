# Risks and Issues

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Multi jump logic is wrong (rejumps, missed branches) | High | High | Build incrementally, many small tests, document in core mechanics |
| Forced capture applied inconsistently across pieces | Medium | High | Single legal move function; filter to captures only if any exist |
| LLM picks illegal or malformed moves | High | Medium | Verify against legal list, 3 retries, fallback message |
| LLM latency or timeouts make play feel slow | Medium | Medium | Timeout, loading indicator, concise prompt |
| API key leaks to the browser or repo | Low | High | Serverless proxy, no `VITE_` prefix, `.env` in `.gitignore`, review before push |
| Rule engine tangled with UI | Medium | High | Keep engine pure; no React imports in `src/engine` |
| Author cannot explain generated code | Medium | High | Small functions, comments, walk through each task |
| Repeated King positions prevent a game ending | Low | Low | D89 applies repetition and no progress draws; migration 5 is applied |
| Cost or rate limits on the LLM | Low | Medium | Small prompts, one call per move, cheap model |
| Someone abuses the public AI endpoint and runs up the OpenRouter bill | Medium | Medium | Size and shape limits, best effort per instance rate limit, and a spending cap on the OpenRouter key itself (the only hard limit). Consider Netlify's code based rate limiting at deploy time |
| Reasoning uses up max_tokens and the answer comes back empty | Medium | Low | max_tokens 1500, reasoning effort low, empty answer counts as a failed attempt and is retried |
| No OpenRouter provider supports response_format together with the other parameters | Medium | Low | Proxy asks again without response_format; `parseReply` checks the answer either way |
| Netlify function timeout differs from the docs (older forum posts mention 10 s or 26 s) | Low | Medium | Check the first real slow call in the logs; a timeout shows the fallback message, never a bad move |
| Scope creep | Medium | Medium | Stick to the scope doc; park ideas |

## Open issues
- Current release work: publish the tested draw update, improve AI failure handling, then complete human acceptance and the recording. See the task backlog.

## Issue log
| # | Date | Description | Status |
|---|---|---|---|
| 1 | 12 Nov 2026 | `BUG-001` reported by the user after playing vs AI in the browser | Closed after the route display fix and user review; see the bug tracker |
| 2 | 12 Nov 2026 | User feedback: 8 feature requests (history, AI reasons, animation, no scroll, splash, menu and Learn mode, mobile, player icons) | Implemented; human acceptance remains separate |
