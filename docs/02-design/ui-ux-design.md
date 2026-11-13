# UI and UX Design

## Game screen (after mockup/mockup_design.png, D41)
- Top bar: back arrow (to the main menu, asks first during a game), the serif "Draft" title with a crown and laurels, and Menu (New game, How to play over the game, Main menu).
- Segmented Two Players / Play vs AI switch; under it "You play Black • AI plays White" (or "Black moves first • Take turns on one screen").
- Player cards: portrait (robot or person; gold ring for the side to move), name, BOT and the level badge with a crown, a status dot (green for the side to move), side, and "Your turn" / "To move" / "Thinking..." / "Waiting"; on the right the pieces left as a big number and the captured pieces as a small stack with "Took: N".
- Board: a wooden frame with a gold edge and A to H / 8 to 1 on all four sides. Square names everywhere follow these labels (e.g. E3 → G5). The last move's squares are tinted slate and the moved piece gets a blue ring.
- Under the board: a "Black to move" banner (pill with gold lines and diamonds), then the AI move card ("AI played E3 → G5", an info icon and "Why this move?").

## Start and menu
- Splash: logo (a white and a crowned black piece), "Draft" and a step list. "Loading the game…" shows from the HTML while the JavaScript downloads. Then "Game loaded" gets a tick and "Checking the AI…" spins until the AI health check answers (at most 4 s). After that the splash fades out. There is no fixed timer.
- Home menu: logo, title, tagline, and three cards. Play vs AI (cyan robot) has a badge: "AI online" (green), "Checking the AI…", "AI not set up" or "AI unreachable" (orange), with a one-line explanation and "Check again". 2 Players (person). How to play (crown). Learn will be added in Phase 6.
- How to play: the rules in short sections (goal, moving, capturing, Kings, controls), "← Menu", and buttons to start either mode.
- Learn (home menu card, and "Watch it played" on the rules page): the game layout with two robot cards, Gold Bot (Black, gold robot) and Cyan Bot (White). The board is view only and shows the same route, animation and red "must capture" glow as a real game. The sidebar shows "Lesson x of 4", "Intro" or "Move x of y", the lesson title, a caption for every move, and "Checked by the game engine" facts. Under it: Previous, Play/Pause ("Watch again" at the end) and Next, plus the list of lessons to jump to. Autoplay waits for the animation plus reading time (3.5 to 10 s); any control pauses it. Keys: Left, Right, Home, End.
- AI level: choosing Play vs AI opens a dialog with four options (Beginner, Casual, Strong, Expert), each with a small signal-bar meter and one line saying what the AI gets. The last choice is preselected. The chosen level is shown as a badge next to BOT on the AI's card. The "Why this move?" popup also shows the engine's look-ahead score for the move.
- AI reactions (trash talk, D43): after every player move the AI may fire off one line: a roast after an engine-judged blunder (warm red), grudging respect after a great move (green), or plain banter otherwise (dark bold). The engine decides when a roast or respect is deserved; the model writes the words. "Why this move?" shows the engine's verdict when there is one.
- AI speech bubble: a white rounded bubble with a curved tail under the AI's card, pointing at the robot, with a small "AI" label. Typing dots while it thinks; then its reason (large, dark text) with "Why?" and a close button. It stays until you play your move, or leaves after 20 to 40 s if you wait. While you hold a piece it turns see-through and clicks go through it to the board. It pops in from its tail and shrinks away when it leaves.
- Look: calm and flat (D37), with motion but no glow (D40): the route draws itself, picked-up pieces lift, hints pop in, the turn bar slides in.
- In a game, a Menu button sits left of the title. It asks first if a game is in progress.

## Layout
- Desktop (window at least 900x600): two columns that always fit the window, so the page never scrolls. Left: White's player card, the board, Black's player card. Right: title, mode selector, status, controls. The board is as large as the space allows (up to 800px).
- Narrow screens and phones: one column (title and mode, cards and board, status and controls); the page may scroll. Board width is the screen width minus 16px gutters, up to 560px.
- Player cards (like chess.com): dark glass avatar with a neon ring in the side's colour (gold Black, cyan White); a person icon, or a glowing robot with a BOT badge for the AI; side and status ("To move", "Thinking..." with animated dots, "Winner" with a gold crown); 12 piece markers plus the number left; captured pieces as small discs. The side to move glows softly.
- End of game: a result popup after the last move's animation. You win: gold theme, trophy, confetti, "You win!". The AI wins: cyan robot theme, "AI wins". Two players: "<side> wins!". It shows the reason, both sides' stats (pieces left, captured, Kings made, best multi jump, moves), total moves and game time, with Play again and View board. "Show result" in the sidebar reopens it. The sidebar status still says who won.

## AI reason
- After each AI move a small cyan card sits in the sidebar under the status: a robot icon, "AI played 3,2 → 4,1" and the start of the model's reason in quotes (or "No reason given."). A "Why this move?" button opens the popup.
- The popup (cyan robot theme, like the AI's result popup) has the move number and move, then two boxes. "In its own words": the model's sentence, with a note that the game does not check it. "Checked by the game engine": short facts with a green tick (good for the AI), a red "!" (a risk) or a dot (neutral), e.g. "It captured 1 piece. Capturing was mandatory.", "It chose 1 of 7 legal moves.", "The moved piece can be captured next turn." Close, Esc or a click outside closes it.
- It follows the history: when an older AI move is on screen, the note explains that move. After a human move, and in two-player mode, there is no note.

## History
- In the sidebar: four arrows (first, back, forward, latest) and "Move x of y". Like chess.com, an arrow that cannot be used stays in place but looks switched off: forward and latest at the live position, first and back at the start.
- Keyboard: Left and Right arrows step; Home and End jump to the start and the latest position.
- Move list below the arrows: number, side, who ("You", "AI", "Black", "White") and the move, e.g. "8,3 → 6,5 → 4,7 ×2" (a crown mark for a move that made a King). Click a move to see the position after it. The move on screen is highlighted; on desktop the list scrolls inside the sidebar.
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
- **Visual style:** neon light, not solid borders. Highlights are soft glows (selected square, last-move squares, capture rings, the card of the side to move).
- **Last move:** a neon trail through every square the piece visited: a soft halo, a thin bright core with an arrow, and white dashes flowing towards the destination. A breathing ring marks the start, numbered hollow rings mark the landings of a multi jump, and each captured piece gets a thin neon-red cross with a burst. Gold for Black's moves, cyan for White's.
- **Move animation:** the piece hops along each landing square, glowing in its side's colour and rising over each captured piece, which fades as it is jumped (about 0.2 s per step, 0.3 s per jump). Users who prefer reduced motion get the trail without movement, flow or pulsing.
- **Locked:** reduced opacity or cursor change during AI turn and after game over.

## Feedback
- Illegal click: no-op, optionally a brief message.
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
