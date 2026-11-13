# Game Design Document

## Summary
- Draft: browser checkers, 2 players or vs LLM AI. See `docs/01-concept/game-concept.md`.

## Rules
- Full rule set lives in `core-mechanics.md`; this page is the overview.
- Black moves first. Forward only for regular pieces, Kings both ways. Forced capture, any capture choice allowed. Crowning mid chain ends the turn. No draw.

## Modes
- **Two players:** both sides controlled by clicks on one screen.
- **Versus AI:** human plays black (moves first), AI plays white by default; side choice may be added at New game. The AI move is requested automatically when it is the AI's turn.

## Game flow
- Start: standard setup, black to move.
- Each turn: select a piece, destination squares highlight, click one, move applies.
- End: winner banner, board locked, New game button restarts.

## Interaction
- Click own piece to select; click another own piece to change selection.
- Click a highlighted square to move.
- Clicking anything else deselects.
- While the AI thinks, input is locked and an "AI is thinking" indicator shows.

## Information shown
- Current player, pieces left per side, winner banner, AI status or error message.

## Edge cases
- Player has pieces but no legal moves: loses.
- Mid chain: only the chaining piece is selectable and only its continuations are highlighted.
- AI fails after retries: fallback message, game is not corrupted, user can retry or start a new game.

## Testing the design
- Every rule above maps to at least one engine test (see `docs/06-qa/test-cases.md`).
