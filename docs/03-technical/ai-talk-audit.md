# AI talk audit

Audit only, written 21 Nov 2026 on `feature/leaderboard` at `10fa279`. No source file, config, setting or deployment was changed. Every claim below was checked in the code, and every bug was reproduced by a scratch test that is not committed: `artifacts/ai-talk-audit/repro.test.ts` (the `artifacts/` folder is gitignored), run with `npx vitest run --config artifacts/ai-talk-audit/vitest.config.ts --silent=false`. Result: 12 of 12 reproductions pass, and they print the exact values quoted here.

## The short answer

Since D107 almost every line the AI says is first offered to the model, and the local bank line is only the fallback. The model is told very little that is true about the game: it never learns whether the player has moved at all, and for every event it reads `Human move verdict: ordinary`. Nothing in the code checks what the model says about the player's play. It checks only colours, squares, turn words, results, swearing, length and dashes. The coloured chip above the line comes from the engine's verdict, while the text comes from the model, and nothing makes the two agree.

On top of that, in production every AI move carries a turn cue as its `reaction`, including the AI's very first move. So when the AI opens, the bubble treats that move as a reply to a player move that never happened.

## How a line is made

1. **Pick a local line.** `usePersonality` (`src/ui/usePersonality.ts`) picks greetings, idle lines, the resign hint, resign pressure and the end line from the banks in `src/ai/linesGentle.ts` and `src/ai/linesFierce.ts` (`pickLine` in `src/ai/lines.ts`). After an AI move, `useRemoteBubble` picks a fallback from the short lists in `src/ai/chat.ts` (`localChatLine`) and a turn cue (`turnLine`).
2. **Decide what is on screen.** `reactionBubble` (`src/ui/bubble.ts:34`) chooses one message, most recent event first. It checks for thinking dots, then resign pressure, then an idle line, then the hint or the reaction to the AI's move, and finally the greeting.
3. **Ask the model.** `useRemoteBubble` and `useRemoteLine` (`src/ui/useRemoteTaunt.ts:47`) send that event to the model through `requestTaunt` (`src/ai/taunt.ts:22`). The server builds the prompt in `promptForContext` (`src/ai/request.ts:44`) and runs the provider chain (`netlify/ai/chain.ts`). Both the server (`validTaunt` in `netlify/ai/adapter.ts:11`) and the browser (`readTaunt`) accept a line only if `validChatLine` (`src/ai/chat.ts:38`) passes.
4. **Deliver one final line.** `deliverChat` (`src/ui/chatDelivery.ts:7`) shows the turn cue for 1.4 s on move lines, then typing dots for at least 1 s. Then it reveals the model's line, or the local fallback if no valid answer came within 4 s. The final line is sealed for that key, and the voice and screen reader read only the final line.

The resign hint, the resign pressure and idle lines from the sixth on are never sent to the model (`warning` in `src/ui/useRemoteTaunt.ts:49`). The robot record taunt (`aiStatsTaunts` in `src/ui/AiRecordDialog.tsx:42`) is local only.

## 1. Every trigger that makes the AI speak

| Event | Exact condition in the code | Who moved last | Local line (fallback) | Model asked? Event sent | File and function |
|---|---|---|---|---|---|
| Game start, player moves first (player is Black) | `history.length === 1` and `extra.greeting` (`bubble.ts:51`); greeting set when `currentPlayer === humanSide` (`usePersonality.ts:143`) | nobody | `start`, `startAfterLoss` or `startAfterWin` from this tab's last result (`greetingContext`) | yes, `start`, or `rematch` when `gameKey > 1` | `usePersonality` greeting effect, `reactionBubble`, `useRemoteBubble` |
| Game start, AI moves first (player is White) | `aiPhase === "thinking"` from the start (`aiPhaseFor` in `gameReducer.ts`), key `thinking-<id>` | nobody | AI turn cue (`AI_TURNS`, `chat.ts:13`) for 1.4 s, then dots | no | `reactionBubble` line 36, `useDeliveredLine` waiting branch |
| AI's first move (AI opens) | Intended: greeting from the `aiOpens` bank when the AI entry has no `reaction` (`bubble.ts:47`). Actual: `chooseMove` always sets `reaction` to a turn cue (`chooseMove.ts:187` and `:212`), so the key is `move-1` | AI; the player has never moved | turn cue, then `localChatLine` (`PLAIN`, or `FIERCE` at Strongest) | yes, `during`, verdict `null` | `chooseMove`, `reactionBubble`, `useRemoteBubble` |
| After my move | last entry is mine, so `reactionBubble` returns null; `aiPhase` becomes `thinking` | me | AI turn cue for 1.4 s, then dots | no (the move request's own reaction is discarded) | `reactionBubble` line 36, `useDeliveredLine` |
| After the AI's move | `last.player === aiSideOf(state)` and `last.reaction` (always set in production), key `move-<index>` (`bubble.ts:45`) | AI, after my move | cue `turnLine("human")`, then `localChatLine(level, aiRequestId, verdict)`: `RESPECT`, `SLIPS`, `PLAIN` or `FIERCE` | yes, `during`, verdict = the engine's verdict on my previous move; not asked when the engine chose the move (`lookahead.source === "engine"`) | `useRemoteBubble` lines 47 to 58 |
| Tone chip on that line | `judgement.verdict === "great"` gives `respect`, any other judgement gives `roast`, none gives `banter` (`bubble.ts:48`) | | | | `ChatBubble` `TONE_LABELS` (`ChatBubble.tsx:22`) |
| Capture | no trigger of its own; my multi jump of 2 or more pieces that is also the best move is judged `great` (`judge.ts:87`) | | | the prompt forbids mentioning captures; `BOARD_CLAIM` rejects them | `judgeMove` |
| King | no trigger at all | | | the prompt forbids kings; `BOARD_CLAIM` rejects "king" | |
| Resign hint | the engine proved my position lost after the AI's move (`provenLoss`), once per game, key `hint-<index>` | AI | `resignHint` bank | no (local only) | `usePersonality` hint effect, `reactionBubble` line 46 |
| Resign pressure | hint active, my turn, nothing covers the board, no piece picked up; 10 s on, 5 s dots, and so on (D69, D70), key `push-<turn>-<n>` | AI | `resignPush` bank | no | `createPressureTimer`, `pressurePart` |
| Idle | `idleActive`: against the AI, my turn, nothing covers the board, page visible, no resign hint (`usePersonality.ts:181`). First line after 30 s, then every 5 s (`IDLE_DELAYS_MS`, `idleTimer.ts:6`), key `idle-<turn>-<n>` | either side; when the AI opened, I have never moved | `idle` for lines 1 and 2, `idleAngry` for 3 to 5, `idleWarn` from 6 | yes for lines 1 to 5 (`idle`, verdict `null`); no from line 6 | `createIdleTimer`, `idleContext`, `useRemoteBubble` |
| Abandon (60 s without a move, D85) | `state.abandoned` | AI | `abandoned` | yes, `end`, outcome `ai-win` (the model is not told the game was abandoned) | `endContext`, `useRemoteLine` |
| Win (I win) | `winner !== aiSide` | me | `playerWon`, chip `respect` | yes, `end`, outcome `human-win` | `endContext`, `TONES` (`usePersonality.ts:90`) |
| Loss | `winner === aiSide`: `aiWonStubborn` if any entry has `provenLoss`, else `aiWonBlunder` (chip `roast`) if any entry has a `blunder` verdict, else `aiWon`; a laugh is added except at Easy | AI | the matching bank | yes, `end`, outcome `ai-win`, verdict `null` | `endContext`, `withWinLaugh` |
| Draw | `state.drawn` | either | `draw` | yes, `end`, outcome `draw` | `endContext` |
| I resign | `resignedBy === humanSide` | either | `resigned` | yes, `end`, outcome `ai-win` (not told I resigned) | `endContext` |
| AI resigns | `resignedBy === aiSide` (D89) | me | `aiResigned`, chip `respect` | yes, `end`, outcome `human-win` | `endContext` |
| Rematch or new game | a new `history[0]`; event `rematch` when `gameKey > 1`, that is any later game in the same game screen | nobody | `startAfterLoss` or `startAfterWin`, or `aiOpens` when the AI opens (never shown, see bug 1) | yes, `rematch` | `useGameNumber` in `App.tsx`, `tauntEvent` |
| After the game | the end line stays in the robot's bubble (`lastWords`, `App.tsx`) with its chip | | | the same reply as the result panel | `coachMessage` |
| Tapping the robot | the record popup | | `aiStatsTaunts` | no | `AiRecordDialog` |

## 2. The four bugs

### Bug 1. The AI opens, and before I move the bubble says "You barely managed to avoid a disaster with that pathetic attempt"

Reproduced by the test "BUG 1". It runs the real `startAiTurn` with a fake of the production model client (`handlesChain: true`) for a Strongest game with the player as White:

```
history[1].player: black
history[1].reaction (set by chooseMove although nobody moved before): On you. Less staring, more strategy.
history[1].judgement: null
bubble key (the aiOpens greeting is skipped): move-1
event sent to the model: during
verdict sent to the model: null
prompt event line: Event: during. Level: 4. Human move verdict: ordinary. Outcome: game ongoing. Never invent a result.
final bubble text: You barely managed to avoid a disaster with that pathetic attempt
local fallback if the model fails: Make me work for it, amateur.
```

Code path:

1. The player is White, so the AI is thinking from the start (`aiPhaseFor` in `src/state/gameReducer.ts`).
2. `startAiTurn` calls `lastOpponentMove`, which returns nothing because the history has one entry. So there is no judgement, which is correct (`src/state/aiController.ts:21`).
3. The app's model client has `handlesChain: true` (`src/ai/client.ts:83` and `:87`), so `chooseMove` runs with `engineFallback`. In that mode it adds `reaction: turnLine("human", ...)` to every result (`src/ai/chooseMove.ts:212`, and the engine fallback at `:187`). The `wantsReaction` guard (`:197`) only covers the model's own reaction (`:214`), not this cue.
4. The reducer stores that cue as `history[1].reaction`.
5. `reactionBubble` sees an AI move with a reaction and returns key `move-1` (`src/ui/bubble.ts:47` to `:49`). The `aiOpens` greeting is used only when the reaction is empty, which never happens in production, so the D85 behaviour is lost.
6. `useRemoteBubble` treats `move-1` as an ordinary reply. It shows the cue, then dots, and asks the model with `chatContext` (`src/ui/useRemoteTaunt.ts:11`), which sends event `during` and verdict `null`.
7. `promptForContext` writes `Human move verdict: ordinary` (`src/ai/request.ts:51`) and, at Strongest, "give only competitive banter or a cutting taunt" (`:52`). Nothing in it says that the player has not moved.
8. `validChatLine` accepts the roast. "pathetic" is an allowed Strongest insult, and no rule looks at claims about the player's play.
9. `deliverChat` seals the line. It stays until my move (D65), or until the first idle line replaces it after 30 s.

**Cause.** The production move path gives every AI move a reaction, so the AI's opening is handled as a reply to a player move. The taunt context then has no fact like "the player has not moved yet", and it states an "ordinary" human move that does not exist. When the model is down, the fallback is not neutral either: the same test with the model down shows "That stare is not a strategy." after the AI's opening move.

### Bug 2. While I wait without having moved, the bubble rotates lines about my strategy and repeated mistakes

Reproduced by the two "BUG 2" tests:

```
idle lines by 30 s: 1
idle lines by 50 s: [1,2,3,4,5]
idle 1: local line replaced: Hello? Earth to clueless player. Your turn, haha.
idle 2: local line replaced: Ping. Is the noob still awake? Move, lol.
idle 3: local line replaced: This stalling is pathetic. Play already, lol.
```

For each of these idle lines the test confirms that the model is asked, with event `idle` and verdict `null`, and that "You call that a strategy?", "You're falling into the same old trap, again." and "Oh you. Less staring, more strategy." all pass `validChatLine` and become the final text.

Code path: the idle timer fires (`createIdleTimer`, 30 s and then every 5 s). `say(idleContext(n))` picks a sensible local line. `reactionBubble` gives the idle line priority over the move line (`bubble.ts:41`). `useRemoteBubble` does not treat lines 1 to 5 as warnings (`useRemoteTaunt.ts:49`), so every new idle key starts a new model request. The model's line then replaces the local one. The prompt says nothing about the player's play, except the false `Human move verdict: ordinary`, so the model invents a history ("the same old trap, again").

The "rotation" is the cadence. A new key every 5 s means dots for at least 1 s, then a line for the rest of the 5 s, or for only about 1 s if the model takes the full 4 s.

About "Less staring, more strategy": the exact local text "On you. Less staring, more strategy." is the eighth Strongest turn cue (`STRONG_TURNS`, `src/ai/chat.ts:12`). It shows for 1.4 s after any AI move when `aiRequestId` modulo 8 is 7, and the test with `aiRequestId` 7 shows exactly that cue after the AI's opening move. If the line really read "Oh you.", it came from the model and slipped through the turn cue filter: `validChatLine` rejects "On you. Less staring, more strategy." but accepts "Oh you. Less staring, more strategy." (checked). The code cannot tell which one you saw. Both make a claim about play that has not happened.

**Cause.** Idle lines were designed as local lines (Change 4, D73, D82; the header of `usePersonality.ts` still says "no model call"). D107 sends them to the model with no precondition about the player's play, and with a verdict field that reads as "the player made an ordinary move".

### Bug 3. "Your 'move' was predictable." with stray quotes

Reproduced by "BUG 3": `validChatLine` rejects "Your move was predictable." but accepts "Your 'move' was predictable.", "Your ‘turn’ was predictable." and `Your "move" was predictable.`.

Code path: this is a model line. The rule that keeps turn words out of chat is the pattern `\byour (?:move|turn)\b` (`src/ai/chat.ts:43`). A quote between the two words breaks the match. Nothing removes or rejects quotes: `tidyLine` (`src/ai/language.ts:201`) only removes dashes and caps the length, and the quote stripping in `EDGE_PUNCTUATION` is used only to classify swear words. "Predictable" is also an unverified claim about play, made with verdict `null`.

**Cause.** The filters match exact spellings. A scare quote, a changed letter ("Oh you") or another wording gets past them, and there is no check of the line's form (quotes, first letter).

### Bug 4. A green "Respect" chip above "nice try, but your plan is already outdated, stuck in a predictable loop"

Reproduced by "BUG 4". The AI entry carries the verdict `great` on my move, and the model answers with that taunt. The rendered bubble is:

```
<div class="speech speech-respect"><p class="speech-line"><span class="speech-label">Respect</span>nice try, but your plan is already outdated, stuck in a predictable loop</p></div>
```

Code path: `judgeMove` judged my move `great`, because it was a multi jump of 2 or more pieces, a forced win found, or the only good move (`src/ai/judge.ts:83` to `:92`). `reactionBubble` sets the tone to `respect` from that verdict alone (`bubble.ts:48`), and `ChatBubble` prints "Respect" for that tone (`ChatBubble.tsx:22`). The model is asked with verdict `great`. The prompt says "Grudging respect is allowed" (`request.ts:52`), which allows respect but does not require it, while the Strongest persona says "relentless, cocky ... never sweet" (`:47`). `validChatLine` rejects unearned praise but never requires praise when the verdict is great. "nice" is on the praise list, so it is allowed here.

The lowercase start passes because no step checks or fixes capital letters. The move prompt bans opening with "Nice try" (`LIMITS`, `src/ai/prompt.ts:80`), but the taunt prompt does not include `LIMITS`, so the ban never reaches the model that writes the chat.

**Cause.** The chip comes from the engine and the words come from the model, and no rule ties them together. The same test shows the reverse at Easy, Medium and Hard, where there is no praise filter at all: "Great move, well played!" passes after a blunder (under a "Your slip" chip), and "Oops, what a blunder." passes after a great move.

## 3. How "verified mistake" is decided

- **The decision.** `judgeMove` (`src/ai/judge.ts:51`) looks 4 turns ahead. A move is a blunder if it misses a forced win or is at least 1.0 piece worse than the best move. It is great if it is the best move and also finds a forced win, takes 2 or more pieces, or beats every other move by at least 1.0. Otherwise, and for a forced move, there is no verdict.
- **Right side.** `lastOpponentMove` judges the last history entry with its own `player` (`aiController.ts:25`). At the start of an AI turn that entry is always the player's move. The test "Section 3" spies on `judgeMove`: with the player as Black and then as White it judged `["black","white"]`, and when the AI opens it judged nothing. The verdict is stored on the AI's next entry. `reactionBubble`, `chatContext` and `endContext` read it from there, which is correct in both colours.
- **At least one move of mine.** Required for a judgement (no entry, no verdict). It is **not** required for talk. The move bubble and idle lines 1 to 5 go to the model whether I have moved or not, and the prompt then claims an "ordinary" human move.
- **AI first and random colours.** `chatContext` sets the AI side from `aiSideOf`, and the prompt names both colours, so colours are right. The only colour related failure is the opening described in bug 1.
- **Idle precondition.** None about play. `idleActive` checks only the turn, covering sheets, page visibility and the resign hint.

Cases where a line claims something false, all checked against `validChatLine`:

| Case | Example that passes | Where |
|---|---|---|
| Roast with no move at all | "You barely managed to avoid a disaster with that pathetic attempt" after the AI's opening | bug 1 |
| Roast of an ordinary move | any line with verdict `null` at Strongest; the prompt asks for "a cutting taunt", and nothing stops "pathetic", "predictable" or "same old trap" | `request.ts:52`, `chat.ts:38` |
| Invented repeated mistakes while idle | "You're falling into the same old trap, again." | bug 2 |
| Respect chip above a taunt | bug 4 | `bubble.ts:48` |
| Praise after a blunder | "Great move, well played!" at Medium with verdict `blunder`, under "Your slip" | `chat.ts:44` covers Strongest only |
| Blunder claimed in an end line with no blunder | "That blunder sealed it. Next." with outcome `ai-win` | the end context has no verdict |
| End line ignorant of how the game ended | the prompt for an abandoned game mentions neither abandoning nor resigning, so "I outplayed you" fits it | `chatContext` sends only the outcome |
| Local lines about an AI move that has not happened yet | Hard idle "Hello? Did you see my last move and freeze, haha?" (`linesFierce.ts:48`), Strongest idle "Is someone there? Or did my last move scare you off, lmao." (`:262`), when I am Black and still on my first move | local banks |
| Local line implying an earlier game | Hard `start` "New game, same result coming. Prove me wrong." (`linesFierce.ts:13`), used for the first game of a session | local bank |
| Local fallback about my play before I played | "That stare is not a strategy." and "Make me work for it, amateur." after the AI's opening | `FIERCE`, `chat.ts:15` |
| Move prompt says "first move" every turn | the production move prompt always contains "This is the first move of the game", because the server rebuilds it without the opponent's move (`request.ts:60` to `prompt.ts:98`) | move job only; its reaction is discarded, but the model gets a false fact |

## 4. Tone labels and line hygiene

**Labels.** There are three tones (`src/ui/ChatBubble.tsx`): `roast` (chip "Your slip"), `respect` (chip "Respect") and `banter` (no chip). There is no "Taunt" or "Gentle" label in the code. "Gentle" is only the file name of the Easy and Medium banks.

- Live bubble: the tone comes only from the engine verdict on my last move (`bubble.ts:48`). Idle, greeting, hint and pressure are always `banter`. During the cue and the dots the tone is `banter`, and the chip appears with the final text (`useRemoteTaunt.ts:57`).
- End line: `TONES` (`usePersonality.ts:90`) gives `aiWonBlunder` the tone `roast`, and `playerWon` and `aiResigned` the tone `respect`. The chip shows in the after game bubble, and the colour class shows in the result panel.
- Can label and text disagree? For local fallbacks, no: `RESPECT` lines go with great, `SLIPS` with blunder, and `PLAIN` or `FIERCE` with no chip. For model lines, yes, always (bug 4 and the table above). After I win, the "Respect" chip can also sit over a model sneer, because praise is allowed but not required.

**Capital letters.** All 689 local bank lines and all `chat.ts` lines start with a capital (scan in "Section 4"). Model lines are never checked or fixed.

**Quotes.** The local banks have no stray quotes (same scan). Model lines are never checked (bug 3). A whole line wrapped in quotes would show as is.

**140 character cap.** `validChatLine` rejects any model line over 140 characters or 20 words, both on the server (`validTaunt`) and in the browser (`readTaunt`), so long lines are dropped, not cut. The longest local line is 81 characters, even with round 100 filled in. `withWinLaugh` drops the laugh when it would not fit. This works.

**No hyphens.** `validChatLine` rejects the plain hyphen, the en dash and the em dash directly. Every other hyphen or dash character is caught too, because `checkReaction` must return the line unchanged and `withoutDashes` rewrites them. The banks are covered by `src/ai/lines.test.ts`. This works.

**Mild profanity only.** `checkReaction` (`language.ts:220`) allows mild words only at Strongest with verdict `blunder`. Greeting, idle and end requests always carry verdict `null`, so the model can never swear there. Only the local Strongest `aiWonBlunder` bank swears. Strong swearing, slurs and threats are always rejected. Insults are allowed at Strongest in every event, idle and the AI's opening included: that follows D45, but it is how "pathetic attempt" reaches a player who has not moved.

**18+ consent.** A Strongest game starts only through `useStrongestGate` (`ConsentDialog.tsx:93`, used in `Root.tsx` and `App.tsx`). The consent is versioned in local storage. Only the development query paths (`?scenario`, `?testwin`) skip it. Lines with listed words show in red (`hasAdultWords`). The server trusts the level it is sent, but a forged request only affects the sender. This works.

**Variety.**

| Bank | Lines per level (Easy, Medium, Hard, Strongest) |
|---|---|
| `idle` | 12, 11, 11, 11 |
| `idleWarn` | 11 at every level |
| every other bank (15 of them) | 10 at every level |

`pickLine` never repeats one of the last 3 lines of a context in this tab (`NO_REPEAT`, sessionStorage). In production, though, most shown lines are model lines. The taunt prompt has no list of recent lines and no "vary your wording" rule (both exist only in the move prompt, whose reaction is now discarded), so the model can repeat itself freely. The `chat.ts` fallbacks are picked by `aiRequestId` modulo the list length, so they come strictly in order. The cue and the fallback move in lockstep, and `RESPECT` and `SLIPS` (3 lines each) repeat every third time. The `aiOpens` bank is picked and remembered on every AI opening, but never shown.

## 5. When the model is down (no credits, rate limit, errors)

- **Server.** The per IP limiter (20 requests a minute, `netlify/functions/ai-move.ts:13`) answers `{ fallback: true }`. So do no configured provider, every provider cooling after a 402 or 429, and every reply invalid (`netlify/aiMoveHandler.ts:196`, `netlify/ai/chain.ts`). The browser turns that answer into `EngineFallbackError` (`client.ts:76`).
- **Moves.** `chooseMove` plays the engine's best move for the level and marks it `lookahead.source: "engine"`. The move bubble then never asks the model and shows the cue and `localChatLine` (checked in "Section 5").
- **Greeting, idle 1 to 5, end lines.** `requestTaunt` returns null and the local bank line shows after the 1 s of dots, or after up to 4 s if the request hangs.
- **Hint, pressure, idle 6 and later.** Always local.

**Truth while the model is down.** Better than with it. `RESPECT` and `SLIPS` follow the verdict, `PLAIN` is neutral, and the end banks are chosen with the full context (resigned, abandoned, stubborn, blunder). What remains false: the Strongest `FIERCE` fallbacks and turn cues after the AI's opening ("That stare is not a strategy." was the line in the test), and the local idle lines about "my last move" when I opened. Moves and talk share the one limit of 20 a minute: each AI turn costs 2 requests and an idle minute up to 5 more, so a quick game can push moves into engine fallback without anyone noticing.

## 6. Other logical problems, most visible first

1. **The AI's opening line is wrong in about half of all games.** Colours are random (D81), so the AI opens about half the time, and every time it gets a `during` model line instead of its `aiOpens` greeting (bug 1).
2. **Every ordinary move at Strongest invites an invented mistake.** The prompt asks for "a cutting taunt", and nothing grounds what the line claims.
3. **Idle talk changes every 5 s and comes from the model.** It flickers between dots and lines, makes up history, and costs up to 5 requests per idle minute (bug 2).
4. **Chips disagree with text** (bug 4), including "Respect" after I win.
5. **Praise after a blunder, and blunder talk after a great move, at Easy to Hard.**
6. **Form glitches.** Lowercase starts and stray quotes, plus filter evasions by spelling ("Oh you", "Your 'move'").
7. **The model end line loses the context that the local banks use.** It does not know how the game ended (resigned, abandoned, AI resigned, stubborn, blunder), and the D69 laugh is in the fallback only, so it disappears whenever the model answers.
8. **Local lines with false premises.** "my last move" before the AI has moved, and "same result coming" in a first game.
9. **Predictable fallbacks.** The cue and fallback pairs are fixed by `aiRequestId`, and the respect and slip lists have only 3 lines each.
10. **The taunt prompt lacks the variety rules, the "Nice try" ban and recent lines,** so the model repeats itself.
11. **`rematch` fires for any later game in the same game screen,** including after a New game in the middle of a game, so the model may talk of revenge when nothing was decided.
12. **Moves and talk share one rate limit.**
13. **The production move prompt says "This is the first move of the game" on every turn.**
14. **Stale comments.** The headers of `usePersonality.ts` and `lines.ts` still say these lines make no model call, and the `aiOpens` bank is dead code in production.

## 7. Recommended fixes, in order, with tests

Several of these change decided behaviour (D73, D82, D85, D107), so per `AGENTS.md` they need the owner's approval before anyone implements them.

1. **Do not treat the AI's opening as a reply.** Smallest fix: in `chooseMove`, add the turn cue reaction only when `options.opponent` exists (`chooseMove.ts:187` and `:212`). Then `reactionBubble` shows the `aiOpens` greeting at `history[1]`, as D85 intended. Tests: the AI moves first and I have not moved, so the bubble key is `greeting`, the text comes from the `aiOpens` bank, and no request with event `during` is made. The same holds when the model is down.
2. **Tell the model whether the player has moved, and stop claiming an ordinary move.** Add a count of the player's moves (or a `humanMoved` flag) to the taunt context, accepted by `readContext`. Write "The human has not moved yet; do not comment on their play" when it is zero, and leave out the verdict line for events other than `during`. In `validChatLine`, reject lines about the player's play (plan, strategy, attempt, mistake, trap, predictable, again) when the player has not moved. Tests: with zero player moves, "You barely managed to avoid a disaster with that pathetic attempt" and "You're falling into the same old trap, again." are rejected; the prompt says the human has not moved; with one move, an ordinary taunt still passes.
3. **Keep idle talk local, or ask the model once per turn at most.** Smallest fix: treat every `idle-` key as local in `useRemoteBubble` (`useRemoteTaunt.ts:49`), which restores D73 and D82. Rewrite or condition the local lines that mention "my last move". Tests: idle with no moves sends no `requestTaunt`, and only neutral waiting lines from the bank show; a scan of `idle`, `idleAngry` and `idleWarn` at every level finds no claims about past play; lines mentioning the AI's last move are never used before the AI has moved.
4. **Make the chip and the text agree.** Recommended: with verdict `great`, accept a model line only if it reads as respect (a short respect pattern, and no insult or "nice try ... but"), and otherwise use the local `RESPECT` line. Apply the praise rule at every level, so no praise unless the verdict is great or I won. For end lines with a chip, require the same. Tests: for every level and verdict, the final tone and text agree (great means a respect line; blunder means no praise; no verdict means no chip); "Great move, well played!" is rejected after a blunder at Medium; the bug 4 line is rejected with verdict great.
5. **Check and tidy the form of model lines.** Before the rules run, remove quotes around single words and wrapping quotes, and match the turn cue rule on a normalised text. Require, or fix, a capital first letter. Tests: "Your 'move' was predictable.", "Oh you. Less staring, more strategy." and a lowercase start are rejected or fixed, and no shown line starts lowercase.
6. **Bring the move prompt's chat rules into the taunt prompt.** Add the variety rules, the "Nice try" ban and the AI's last 3 shown lines (from the session record). Tests: `promptForContext` for a taunt contains the ban and the recent lines, and a line equal to a recent one is rejected.
7. **Give end lines their real context, or keep them local.** Send the end reason (resigned, abandoned, AI resigned, blunder seen, stubborn) and keep the D69 laugh on the final line. Tests: the prompt for an abandoned game names it; "That blunder sealed it." is rejected when the game had no blunder; the AI's winning line ends with a laugh at every level but Easy.
8. **Make the fallbacks less predictable.** Pick the cue and the fallback independently from a session counter or `Math.random` with `NO_REPEAT`, enlarge `RESPECT` and `SLIPS`, and make the Strongest fallbacks neutral when the player has not moved. Tests: no repeat within 3 turns, and the opening fallback has no claims about play.
9. **Small cleanups.** Use the `opening` flag so the move prompt says "first move" only on the AI's first move. Count `rematch` only after a finished game. Give talk its own rate budget, or skip talk when the limit is near. Update the stale comments. Tests: the move prompt for a later move does not contain "first move of the game"; New game in the middle of a game sends `start`, not `rematch`; a burst of idle talk never makes a move fall back.

## Summary

- **Bug 1, a roast before my first move.** In production every AI move gets a turn cue as its reaction, so the AI's opening move asks the model for a `during` taunt about an "ordinary" human move that never happened. Smallest fix: add that cue only when there was a player move, so the `aiOpens` greeting shows again.
- **Bug 2, idle lines about my strategy.** Since D107 idle lines 1 to 5 go to the model every 5 s, with no fact about whether I have played, so it makes up a history. Smallest fix: keep idle lines local.
- **Bug 3, stray quotes.** A model line with scare quotes slips past an exact spelling filter, and no check looks at quotes. Smallest fix: strip quotes around single words before the rules run, and reject lines that still have them.
- **Bug 4, a Respect chip above a lowercase taunt.** The chip comes from the engine verdict and the text from the model, and no rule ties them; there is also no capital letter check, and the "Nice try" ban never reaches the taunt prompt. Smallest fix: with verdict great, accept only respect lines (otherwise use the local `RESPECT` line), and require a capital first letter.
- **The common root.** The model is the main voice, but it gets almost no true facts and no rule checks what it claims about the player's play. When the model is down, the local lines are mostly truthful. The exceptions are the Strongest fallbacks after the AI's opening and the idle lines about "my last move".
