# Test Cases (manual, in the browser)

Run with `netlify dev` and a real key unless noted.

| # | Steps | Expected |
|---|---|---|
| 1 | Open the site | Splash: "Game loaded", then "Checking the AI", then the home menu with "AI online" |
| 2 | Same without `netlify dev` (`npm run dev`) | Badge "AI unreachable" with "Check again"; 2 Players still works |
| 3 | Play vs AI | Level popup with four levels; the last choice preselected |
| 4 | Choose Expert, Start game | AI card shows "BOT" and "Expert" |
| 5 | Make a move | Typing dots in a speech bubble above/below the AI card; then its reason |
| 6 | Pick up a piece while the bubble shows | Bubble turns see through; clicks reach the board |
| 7 | Play your move | Bubble is replaced by typing dots for the AI's next reply |
| 8 | Wait without moving | Bubble leaves after 20 to 40 s |
| 9 | "Why?" | Popup: the model's words (unchecked) and engine facts, incl. "Looking 6 turns ahead" |
| 10 | Play a long game (40+ moves) | No stutter; the board never moves; the move list scrolls by itself only |
| 11 | History arrows / Left, Right, Home, End | View only review; board locked; "Back to the game" |
| 12 | Capture available | Pieces that must capture have a red ring; other pieces cannot be picked |
| 13 | Double jump | Route drawn with numbered landings and crosses; the piece hops |
| 14 | Two routes to one square | Asked to click the next landing square |
| 15 | Reach the far row | Piece becomes a King (crown, gold ring) |
| 16 | Win or lose | Result popup with stats; "Show result" reopens it |
| 17 | Learn | Four lessons autoplay; Pause, Previous, Next, lesson list |
| 18 | How to play | Rules page; "Watch it played" opens Learn |
| 19 | Menu during a game | Asks before leaving |
| 20 | Phone upright (e.g. 390x844) | Bubble above the AI card, board fully visible |
| 21 | Phone sideways (e.g. 844x390) | Two columns; board fits the height; sidebar scrolls |
| 22 | Reduced motion turned on in the OS | No animations; everything still works |
