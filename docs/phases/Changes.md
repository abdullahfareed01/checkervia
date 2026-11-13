Part of Change 1 (the hyphen sanitizer and the UI copy scan) already exists from Phase 2, so reuse it and only cover what is still missing. Keep all tests passing and do not change game logic. Stop for my review when all four changes are done, and give me a checklist saying what was done for each change and what was skipped or changed.

CHANGE 1: NO HYPHENS IN WRITTEN TEXT
Scope: all text a person reads, meaning the AI's replies, every UI string (buttons, labels, notices, Terms text, error and fallback messages), and the prose in README.md, the write up and the docs. Do not touch code, identifiers, file and folder names, CSS, URLs, commands, package names, branch names, or anything inside code blocks.

- AI replies: the prompt tells the AI not to use hyphens, em dashes or en dashes, and to write compound words as separate words or one word (for example "brain fart", "stale coffee"). Do not rely on the prompt alone. Every piece of AI generated text passes through one sanitizer before it is shown or stored: a hyphen between letters becomes a space, a spaced hyphen or any em or en dash becomes a comma or a full stop as fits, and number ranges like 3-4 become "3 to 4". Include the special hyphen and dash characters (non breaking hyphen and similar) and add tests for awkward cases (a word that starts or ends with a hyphen, several dashes in a row, a dash at the start of a line).
- UI strings: find every user visible string with a hyphen or dash and reword it. Dates and numbers shown to players must not contain hyphens (for example write "13 Nov 2026"). Keep a test that scans the UI copy and fails if a hyphen or dash appears in it.
- Docs prose: reword hyphenated words and dashes in README.md, the write up and the docs, leaving code blocks, paths and commands untouched.
- Tell me what you changed and anything you left on purpose.

CHANGE 2: HIDE THE REASONING UNTIL I TAP "WHY?"

- After each AI move, show only the compact line ("AI played c5→d4") and the reaction line, if there is one. The reaction keeps its current colors and style.
- Next to that line, show a small "Why?" text button. Do not show the AI's reasoning, the engine verdict or any "No reason given" text until I tap it.
- Tapping "Why?" shows the content directly below it: (1) the engine verdict when one exists, labelled as checked by the game engine, and (2) the AI's own explanation of its move, labelled "AI generated, may be wrong". If the AI gave no explanation, show only the engine part, and if there is neither, do not show the "Why?" button at all.
- Tapping again collapses it. It resets to collapsed on every new move, on New game, and when I change mode or level. The button needs aria-expanded, keyboard support, and a touch target of at least 44px. Use the design tokens, no glow. The expand and collapse animation is short and turned off for reduced motion.
- The reasoning text also goes through the hyphen sanitizer and the language rules before it is shown.
- The collapsed state must add no extra height on phones at 375x667, so the board, both cards and the status line still fit. Change 3 below adjusts how this opens on phones.

CHANGE 3: RESPONSIVE CHAT BUBBLE (also adjusts Change 2)
Show the AI's reaction line in a chat bubble tied to the AI card. Mobile first, following the design tokens, with no glow or neon.

LAYOUT

- The bubble sits directly under the AI card with a small tail pointing to the AI avatar. It uses the same placement on every screen size and only changes width and text size.
- The board must never move when a bubble appears, changes or disappears. Either reserve a fixed slot for it, or position it as an overlay that does not cover any square or piece. Pick one, and tell me why and what it costs in vertical space.
- At 375x667 the opponent card, the bubble slot, the board, my card and the status line must all still be visible without scrolling. If they do not fit, tell me what you removed or shrank, and do not shrink squares below 44px.
- Width: the bubble fills the available width minus a small margin on phones and caps at a comfortable reading width on tablets and desktop.
- Text: at least 15px, high contrast against the bubble color, wraps normally and breaks very long words. On phones show up to 3 lines, on larger screens up to 2. Longer text is cut at a word boundary, never mid word.
- Length limit: AI reaction lines are capped at 140 characters. Enforce it in the prompt and in code, after the hyphen sanitizer, by cutting at a word boundary. No ellipsis with dashes.

BEHAVIOR

- Bubble colors follow the existing meaning: warm red for a roast after a blunder, green for respect, a neutral surface for plain banter. Color is never the only signal, so keep the label or icon as well.
- While the AI is thinking, show a small three dot typing indicator in the same bubble position. When the reply arrives, it changes into the reaction (or disappears if there is none).
- A new bubble fades and slides in over about 150 ms. Turn the animation off for reduced motion.
- The bubble stays until I start my next move (selecting a piece counts), then it clears. It is also cleared on New game, mode change and level change.
- Render AI text as plain text only, never as HTML. Use a polite aria live region so a screen reader announces a new reaction once, without repeating.

"WHY?" ON SMALL SCREENS

- The "Why?" button belongs inside the bubble. On phones, tapping it opens a small card or bottom sheet that floats above the page with a close button, so the board and cards never move. On tablet and desktop it can expand inline in the side panel. The content, labels and rules from Change 2 stay the same.

TESTS AND CHECKS

- Tests: the length cap and word boundary cutting, plain text rendering with a string containing HTML tags, the typing indicator, clearing on my next move, New game and mode change, and the aria live region.
- Check the layout at 320, 360, 375, 390, 430, 768, 1024 and 1440 widths, and landscape phone. Tell me how you verified it, and report any width where the board shifts or the bubble covers a square.

CHANGE 4: MORE PERSONALITY AND END OF GAME FLOW
Apply the existing rules to everything below: the language rules (mild swearing only right after an engine verified blunder at Strongest, never otherwise), no hyphens or dashes in shown text, the 140 character cap, plain text rendering, and the chat bubble from Change 3. Every new line goes through the same sanitizer and language checks. Do not add any new API calls for the lines below: use local line banks, so they are instant and free.

LINE BANKS

- Build one line bank per context and per level (Easy, Medium, Hard, Strongest), with at least 10 lines each for: game start (first game), game start after I lost, game start after I won, idle, I resigned, AI won, and the resign hint. Do not repeat any of the last 3 lines shown in the same context.
- Voices: Easy is warm and encouraging, Medium is playful, Hard is cocky, Strongest is savage and mocking. Only Strongest uses insults about my play. Laughing is allowed: haha, hehe and lol at every level, lmao at Hard and Strongest. Make sure the swear word normalizer does not flag laughter (haha, hahaha, lol, lolll) and that clean lines are never wrongly blocked.
- The AI may also use laughter in its normal reaction lines. Add one sentence to the model prompt allowing it, and keep it inside the 140 character cap.

A. GREETING WHEN A GAME STARTS

- When a game starts in AI mode (after choosing the level, after accepting the Strongest notice, on New game, and on Play again), the AI card shows a greeting bubble right away. Example at Strongest: "Oh, another challenger. Hope you are not as bad as the last one, haha." Treat "the last one" as part of the character, never as a claim about real data.
- Every Play again and New game shows a fresh greeting. Keep a small session record in the tab only (my wins and losses against the AI this session, no personal data, cleared when the tab closes) so a greeting can say things like "Back for round 2, lol" after I lost, or a respectful line after I won.
- The greeting clears when I start my first move, like any other bubble.

B. IDLE TROLL

- If it is my turn in AI mode and I have not moved after 30 seconds, the AI shows an idle line in the bubble. If I still have not moved after 60 seconds, show one more. Maximum two per turn.
- The timer starts when the board becomes interactive on my turn. It pauses and resets whenever the page is hidden, a menu, consent, Terms or Why sheet is open, I am viewing an earlier move, or the game is over. It resets on every new turn.
- Idle lines have no "Why?" button and no reasoning. Mild swearing is never allowed in them.

C. RESIGN (WITHDRAW)

- Add a Resign button in the action bar and the Menu, with a confirmation sheet ("Resign this game? The AI wins."). Available in AI mode and in two player mode. On confirm, the game ends with the other side as the winner, and the result reason says who resigned.
- In AI mode a resignation counts as a loss, is never submitted to the leaderboard, and shows the AI's resign line, then the same loss flow as in part E.
- The AI never resigns.

D. "YOU CAN RESIGN" HINT

- Once per game, if the engine's search proves that my position is lost (a forced loss within the search depth), the AI says one line suggesting I resign, and the Resign button gets a subtle highlight, with no glow. Say this only when the search really proves it, and never otherwise. Tell me how you detect it and how often it fires.

E. GAME OVER WHEN THE AI WINS

- The game over sheet or panel shows the AI's taunt immediately, in the chat bubble style. Play again and Review game buttons are available straight away, so nothing blocks me.
- After about 5 seconds, a second block fades in below it called "Tips from the AI" with up to three suggestions. The tips must be based on engine data and not invented: the move where I lost the most (move number in square notation, what I played, the better move, and the pieces it cost), whether I missed a forced capture or a forced win, and one general tip matched to the pattern. No extra API call. Label these as checked by the game engine.
- Mild swearing is allowed in the taunt only if the engine found at least one verified blunder by me in this game, and the taunt should refer to it. Otherwise the taunt is clean.
- A "Show tips now" link skips the wait. No animation under reduced motion, and the reveal is announced once to screen readers.
- If I win instead, show a short respectful line from the AI and no tips.

F. BETTER TAGS

- Replace the plain "18+ · Strong language" text with a proper badge: a small pill with two parts, a filled "18+" part in a muted red and a "Strong language" part in a neutral surface, on the top edge of the AI card without overlapping "Took" or the piece counts.
- Under 360px wide, show only "18+" with a small info icon. The badge is a real button: tapping it opens a small popover or sheet that explains the language rules in two sentences and links to Terms and notices.
- Add a level chip next to it for every level: Easy "Friendly", Medium "Playful", Hard "Competitive", Strongest "Strongest". Use the design tokens, no neon, contrast at least 4.5 to 1.

TESTS AND CHECKS FOR CHANGE 4

- Tests with fake timers and fake data: each line bank returns lines for every level and context, no repeats of the last 3, every line passes the language and hyphen rules and the 140 character cap, the idle timer at 30 and 60 seconds with its pause, reset and maximum of two, the resign flow in both modes, no leaderboard submission on resign, the resign hint only when the engine proves a loss, the tips content for a known sample game, the 5 second reveal and the skip link, and the badge at several widths.
- Check the layout at 320, 360, 375, 390, 430, 768, 1024 and 1440 widths and landscape phone, with the game over panel and the badge. Tell me how you verified it.
- Update the docs and the decisions log. Run all tests, the typecheck and the build, and tell me how to test each part by hand, including a quick way to trigger the idle timer.
