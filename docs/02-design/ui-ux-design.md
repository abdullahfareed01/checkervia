# UI and UX Design

## Game screen (after mockup/mockup_design.png, D41)
- Header: only the serif "Checkervia" title with laurels (and a crown above it from 600px up). No back arrow and no Menu here (D50): the Menu is on the action bar and has "Main menu".
- Action bar (D50): Menu (three lines), Previous, Next, Resign (Result once the game is over) and New game, always in this order, each an icon over a short label, at least 44 x 44. Fixed to the bottom of the screen when the page is one column; the bottom of the side panel when it is two. Nothing else on the page offers these actions.
- Segmented Two Players / Play vs AI switch; under it "You play Black • AI plays White" (or "Black moves first • Take turns on one screen").
- Player cards: portrait (robot or person; gold ring for the side to move), name, BOT (from 600px up), and for the AI one level chip (Friendly, Playful, Competitive, Strongest) and at Strongest the 18+ badge, both in the name row after the name (D50), a status dot (green for the side to move), side, and "Your turn" / "To move" / "Thinking..." / "Waiting"; on the right the pieces left as a big number and the captured pieces as a small stack with "Took: N".
- Board: a thin (3px) wooden frame with a gold edge. The coordinates are in the squares' corners (D50): 8 to 1 top left in the left column, A to H bottom right in the bottom row. Square names everywhere follow these labels (e.g. E3 → G5). The last move's squares get a warm tint and the moved piece a solid gold ring, with no glow; White's route line is warm ivory, Black's gold.
- Under the board: a "Black to move" banner (pill with gold lines and diamonds), then the AI move card ("AI played E3 → G5", an info icon and "Why this move?").

## Start and menu
- Splash (D51, after `mockup/splash_screen_mockup.png`): a thin gold frame at the corners, a warm light behind the logo (a cream piece and a gold rimmed king with three sparkles), "Checkervia" in Fraunces Black, a gold line with a small crown, "CHECKERS" widely spaced, a gold progress bar with one line under it, and a checkerboard in perspective along the bottom with a blurred cream piece and king at the corners. The bar shows real steps only: 30% "Loading the game…" from the HTML while the JavaScript downloads, 66% "Checking the AI…" until the health check answers (at most 4 s), 100% "Ready" as it fades out. There is no fixed timer.
- Home menu: logo, title, tagline, and three cards. Play vs AI (cyan robot) has a badge: "AI online" (green), "Checking the AI…", "AI not set up" or "AI unreachable" (orange), with a one line explanation and "Check again". 2 Players (person). How to play (crown). Learn will be added in Phase 6.
- How to play: the rules in short sections (goal, moving, capturing, Kings, controls), "← Menu", and buttons to start either mode.
- Learn (home menu card, and "Watch it played" on the rules page): the game layout with two robot cards, Gold Bot (Black, gold robot) and Cyan Bot (White). The board is view only and shows the same route, animation and red "must capture" glow as a real game. The sidebar shows "Lesson x of 4", "Intro" or "Move x of y", the lesson title, a caption for every move, and "Checked by the game engine" facts. Under it: Previous, Play/Pause ("Watch again" at the end) and Next, plus the list of lessons to jump to. Autoplay waits for the animation plus reading time (3.5 to 10 s); any control pauses it. Keys: Left, Right, Home, End.
- AI level (D44): Easy, Medium (default), Hard, Strongest, each with a signal bar meter and one exact line ("Looks 6 turns ahead (3 moves each) and picks from its best 3 moves."). Choosing Play vs AI opens the level dialog (last choice preselected). The game's Menu is a sheet: Mode (Two Players / Play vs AI) and AI level at the top, then How to play, Terms and notices, Main menu (New game and Resign are on the action bar, D50); a panel above the Menu button on wide screens, a bottom sheet with a dimmed page on phones. A level is fixed for a game: picking another starts a new game, asking first during a game. The AI card shows the level as one chip in its name row; "Why this move?" says what the AI was offered at its level.
- AI reactions (D45): after every player move the AI may say one line: a roast or tease after an engine judged blunder (a "Your slip" label; the bubble is not red since D49), respect after a great move (green), plain banter otherwise (dark bold). Clean at Easy, Medium and Hard; trash talk at Strongest. Lines that break the level's rules are replaced by a clean line.
- 18+ consent (D45): choosing Strongest asks "Are you 18 or older?" (Yes, I am 18 or older / No), then the strong language notice (I understand and accept / Cancel) with a link to the Terms. No or Cancel: "No problem. Strongest stays locked and nothing has changed." Focus starts on No or Cancel. Asked once per browser and notice version. During a Strongest game the AI card carries the "18+ | Strong language" badge in its name row (D50).
- Terms and notices (D45): a sheet with the draft text, from the Menu, the home screen ("Terms and notices" link under the cards) and the Strongest notice.
- Text rule (D45, D46): no hyphens or dashes in anything players see, including the AI's lines, nor in the prose of the docs. Checked by `tests/no-dashes.test.ts` and `tests/docs-no-dashes.test.ts`.
- AI speech bubble: a white rounded bubble with a curved tail under the AI's card, pointing at the robot, with a small "AI" label. Typing dots while it thinks; then its reason (large, dark text) with "Why?" and a close button. It stays until you play your move, or leaves after 20 to 40 s if you wait. While you hold a piece it turns see through and clicks go through it to the board. It pops in from its tail and shrinks away when it leaves.
- Look: calm and flat (D37), with motion but no glow (D40): the route draws itself, picked up pieces lift, hints pop in, the turn bar slides in.

## Layout
- Desktop (window at least 900x600): two columns that always fit the window, so the page never scrolls. Left: White's player card, the board, Black's player card. Right: title, mode selector, status, controls. The board is as large as the space allows (up to 800px).
- Narrow screens and phones: one column (title, cards and board, status) with the action bar fixed at the bottom; the move list is below and the page may scroll under the bar. Phones (under 600px): 8px gutters, so squares are 44px at 375px wide; the board also shrinks with the height so the title, both cards, the bubble, the board, the status line and the bar fit at 375x650 (D50). Tablets: up to 560px, also limited by the height.
- Player cards (like chess.com): dark glass avatar with a neon ring in the side's colour (gold Black, cyan White); a person icon, or a glowing robot with a BOT badge for the AI; side and status ("To move", "Thinking..." with animated dots, "Winner" with a gold crown); 12 piece markers plus the number left; captured pieces as small discs. The side to move glows softly.
- End of game (D51, after `mockup/winner_screen.png`): a panel after the last move's animation, with a gold edge and the board scenery at its bottom. At the top, the winner in a gold ring under a crown between two laurel branches, with a warm light behind, and a ribbon with the result in Fraunces Black. AI Wins: red ribbon, the robot. You Win!: green ribbon, your portrait, confetti. Black Wins / White Wins (two players): a dark ribbon with gold text or an ivory ribbon with dark text, that side's piece, confetti. Then the AI's line (or a short line in two player games) in a cream pill, the reason between gold lines, both sides' stats with an icon per row and each value in a pill of its side's colour (blue for White and the AI, brown for Black and you), an hourglass with the moves in total and a stopwatch with the game time, a gold Play Again and a brown Review Game (back to the first position). The panel opens at its top with focus on Play Again; on short screens it scrolls inside itself. "Result" on the action bar (in Resign's place) reopens it. Against the AI (D48): the AI's line at once in the bubble style; after an AI win "Tips from the AI" fade in after 5 seconds, with "Show tips now". The sidebar status still says who won.

## AI reason (D47)
- After each AI move the side panel shows only "AI played E3 → D4" and a small "Why?" button; the chat bubble shows the reaction. Nothing about the reasoning shows until "Why?" is pressed.
- "Why?" shows "Checked by the game engine" (facts with a green tick, a red "!" or a dot, including the engine's verdict on your previous move and the look ahead) and then "AI generated, may be wrong" (the AI's own words). A part with nothing in it is left out; with neither there is no button. Pressing again closes it; it starts closed on every new move and every new game.
- A card floating above the page with a close button, on every screen size (D49). "Why?" has a 44 x 44 hit area (D50).
- It follows the history: when an older AI move is on screen, the line explains that move.

## AI chat bubble (D47, D48)
- A slot of fixed height under the AI card (73px on phones, 70px on larger screens) holds the bubble, so the board never moves. Phones held sideways: at the top of the side panel.
- Shows typing dots, then the reaction (a neutral bubble with a "Your slip" label after a blunder, green with "Respect", neutral for banter; a line with 18+ words in red text, D49), a greeting at the start of a game, idle lines (every 30 seconds while you wait, D49), and the resign hint. "Why?" opens a floating card on every screen size (D49). At least 15px text, 3 lines on phones and 2 on larger screens, 140 characters at most. Fades in over 150 ms (off with reduced motion). Clears when you pick up a piece, and on New game, mode or level change.
- Resign: on the action bar only, with a confirmation sheet. The button gets a gold outline while the resign hint is up.
- AI card chips (D50): one level chip (Friendly, Playful, Competitive, Strongest) and at Strongest the "18+ | Strong language" badge, 11px text, in the name row after the name; the badge is a button that explains the language rules (only "18+" and an info icon under 420px and on phones held sideways).

## History
- Previous and Next are on the action bar (D50); a button that cannot be used stays in place but looks switched off. The side panel shows "Move x of y" and the move list, which starts with a "Start" row (the first position).
- Keyboard: Left and Right arrows step; Home and End jump to the start and the latest position.
- Move list: number, side, who ("You", "AI", "Black", "White") and the move, e.g. "8,3 → 6,5 → 4,7 ×2" (a crown mark for a move that made a King). Click a move to see the position after it. The move on screen is highlighted; on desktop the list scrolls inside the sidebar.
- Reviewing is view only: the board is locked, shows no hints, and the panel glows cyan with "Reviewing an earlier position. Back to the game". The route of the shown move is drawn, and stepping forward animates it. If the AI moves while you review, you stay where you are and can step forward to it.

## Board
- 8x8 grid, alternating light and dark squares, high contrast.
- Pieces: black and white discs; Kings show a crown mark or inner ring (not color alone).
- Only dark squares are interactive.

## Interaction states
- **Selected piece:** thick outline.
- **Legal destination:** dot or ring on the square.
- **Capture destination:** distinct marker (e.g. red ring).
- **Mandatory capture:** pieces that must capture glow red; other pieces cannot be selected.
- **Route choice:** when two routes end on the same square, the squares to pick from get a dashed blue ring and the status bar explains what to click.
- **Visual style:** neon light, not solid borders. Highlights are soft glows (selected square, last move squares, capture rings, the card of the side to move).
- **Last move:** a neon trail through every square the piece visited: a soft halo, a thin bright core with an arrow, and white dashes flowing towards the destination. A breathing ring marks the start, numbered hollow rings mark the landings of a multi jump, and each captured piece gets a thin neon red cross with a burst. Gold for Black's moves, cyan for White's.
- **Move animation:** the piece hops along each landing square, glowing in its side's colour and rising over each captured piece, which fades as it is jumped (about 0.2 s per step, 0.3 s per jump). Users who prefer reduced motion get the trail without movement, flow or pulsing.
- **Locked:** reduced opacity or cursor change during AI turn and after game over.

## Feedback
- Illegal click: no op, optionally a brief message.
- Forced capture: status text "Capture is mandatory".
- AI thinking: spinner and text.
- AI failure: clear message with a Retry button.

## Accessibility
- Pieces and squares are buttons with `aria-label` (e.g. "Black king, row 3 column 4").
- Keyboard: Tab to focus, Enter or Space to select and move.
- Do not rely on color alone for King or capture markers.
- Contrast ratio at least 4.5:1 for text.

## Responsive
- Works from 360px wide up. Board scales with viewport width.

## Controls
- New game button always visible. It asks for confirmation (inline panel) only while a game is in progress: at least one move played and no winner yet.
- Mode toggle: Two players / Versus AI.

## Sound and haptics (D52)
- Restrained and tactile: short wooden clacks for moves, a heavier clack and a low thud for captures, rising clacks for each hop of a multi jump, a soft chime for a King, a dull thud for a tap that does nothing (softer when a capture is mandatory), a soft pop for the AI's lines, a settle of pieces for a new game, a warm rising two note motif for a win and a soft falling one for a loss, very soft clicks for buttons and toggles, an air whoosh for sheets. Nothing for turn changes or the AI thinking.
- Vibrations match: 8 ms to pick up, 12 ms to land, 25 ms to capture, a pattern for a King, a win and an error; none on phones that cannot vibrate (iPhone).
- Every sound is synthesized; tune them in `src/ui/sound/soundConfig.ts` and listen at `?sounds` in development.
