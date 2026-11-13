# Core Mechanics and Gameplay Loop

## Board
- 8x8, pieces live on dark squares only (where `row + col` is odd). Row 0 is the top of the screen.
- White starts on rows 0 to 2 and moves down; black starts on rows 5 to 7 and moves up. 12 pieces each.
- Black moves first.

## Pieces
- **Regular piece:** moves one step diagonally forward onto an empty dark square; captures forward only.
- **King:** moves and captures diagonally forward and backward, one step (or one jump).

## Capture
- Jump diagonally over an adjacent opponent piece into the empty square directly behind it. The jumped piece is removed.
- After a jump, if the same piece can jump again, it must continue in the same turn (multi jump).
- Each jump in a chain can pick any available direction.
- Captured pieces stay on the board until the move ends. So a chain cannot jump the same piece twice, and cannot land on a square a captured piece stands on.
- The moving piece's own starting square counts as empty, so a King may loop around and land back where it started.

## Forced capture
- If any piece of the current player has a capture, the player must capture; plain moves are illegal.
- If several captures exist, the player may choose any of them, including a shorter chain than the longest.
- A started chain must be completed until no further jump exists.

## Kings
- A regular piece reaching the far row becomes a King (black: row 0, white: row 7).
- If crowning happens during a capture chain, the turn ends immediately. This follows by itself: a regular piece only jumps forward, so on its far row it has no jump left.

## Turn loop
1. Compute all legal moves for the current player (captures only if any exist).
2. Player (or AI) picks one.
3. Apply move: relocate piece, remove captured pieces, crown if needed.
4. Check win: if the next player has no legal moves (this includes having no pieces), the mover wins.
5. Otherwise switch player.

## Win and draw
- Win: opponent has no pieces or no legal moves.
- No draw rule.

## Move representation
- A move has `from` (start square), `to` (final square), `path` (every square landed on, in order) and `captured` (positions of jumped pieces, in order).
- A simple step has a one square path and no captures.
- One Move is produced per complete chain, never for a partial chain.
