// Read-only facts about the game history, for the arrows and the move list.
import type { ChosenLookahead } from "../ai/chooseMove";
import type { MoveJudgement } from "../ai/judge";
import type { Board, Move, Player } from "../engine";
import { displayedIndex } from "./gameReducer";
import type { GameState, HistoryEntry } from "./gameReducer";

// What is on screen: the board, the move that led to it and the board before
// that move (for the route and the animation).
export interface DisplayedPosition {
  readonly index: number; // 0 = start, n = after move n
  readonly total: number; // number of moves played
  readonly board: Board;
  readonly move: Move | null;
  readonly player: Player | null;
  readonly previousBoard: Board | null;
  readonly reason: string | null; // the AI's explanation of `move`, if any
  readonly lookahead: ChosenLookahead | null; // engine look-ahead for `move`, if any
  readonly reaction: string | null; // the AI's reaction to the move before, if any
  readonly judgement: MoveJudgement | null; // the engine's verdict on that move
  readonly live: boolean; // true when this is the current position
}

export function displayedPosition(state: GameState): DisplayedPosition {
  const index = displayedIndex(state);
  const entry = state.history[index]!;
  return {
    index,
    total: state.history.length - 1,
    board: entry.board,
    move: entry.move,
    player: entry.player,
    previousBoard: index > 0 ? state.history[index - 1]!.board : null,
    reason: entry.reason ?? null,
    lookahead: entry.lookahead ?? null,
    reaction: entry.reaction ?? null,
    judgement: entry.judgement ?? null,
    live: state.viewIndex === null,
  };
}

// Back and first are possible unless the start position is on screen.
export function canGoBack(state: GameState): boolean {
  return displayedIndex(state) > 0;
}

// Forward and last are possible only while reviewing an older position.
// At the live position the forward arrow is disabled.
export function canGoForward(state: GameState): boolean {
  return state.viewIndex !== null;
}

export interface MoveListItem {
  readonly number: number; // move number, from 1
  readonly player: Player;
  readonly move: Move;
  readonly crowned: boolean; // this move made a King
}

// One list item per history entry, made once and then reused. History
// entries never change, so a long game does not rebuild every item on each
// move, and the list rows can skip re-drawing (see HistoryControls).
const itemCache = new WeakMap<HistoryEntry, MoveListItem>();

// Every move played so far, in order.
export function moveList(state: GameState): MoveListItem[] {
  return state.history.slice(1).map((entry, i) => {
    const cached = itemCache.get(entry);
    if (cached && cached.number === i + 1) return cached;
    const before = state.history[i]!.board;
    const move = entry.move!;
    const wasMan = before[move.from.row]?.[move.from.col]?.kind === "man";
    const isKing = entry.board[move.to.row]?.[move.to.col]?.kind === "king";
    const item = { number: i + 1, player: entry.player!, move, crowned: wasMan && isKing };
    itemCache.set(entry, item);
    return item;
  });
}
