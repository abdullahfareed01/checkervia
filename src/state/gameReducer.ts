// Game state and its transitions. Pure TypeScript: no React, no DOM, no network.
// All rules come from the engine; this file only tracks what is selected,
// whose turn it is, and where the AI's turn stands.
import {
  applyMove,
  drawReason,
  getLegalMoves,
  getWinner,
  initialBoard,
  opponentOf,
  pieceAt,
  samePosition,
} from "../engine";
import type { Board, DrawReason, Move, Player, Position } from "../engine";
import { DEFAULT_AI_LEVEL } from "../ai/difficulty";
import type { AiLevel } from "../ai/difficulty";
import type { ChosenLookahead } from "../ai/chooseMove";
import type { MoveJudgement } from "../ai/judge";
import { narrowRoutes } from "./routes";

// Running totals for one side, shown in the result popup.
export interface SideStats {
  readonly moves: number;
  readonly captured: number; // opponent pieces taken
  readonly kingsMade: number;
  readonly bestChain: number; // most pieces taken in a single move
}

const NO_STATS: SideStats = { moves: 0, captured: 0, kingsMade: 0, bestChain: 0 };

// Adds one move to a side's totals. `crowned` is true if the move made a King.
function addToStats(stats: SideStats, move: Move, crowned: boolean): SideStats {
  return {
    moves: stats.moves + 1,
    captured: stats.captured + move.captured.length,
    kingsMade: stats.kingsMade + (crowned ? 1 : 0),
    bestChain: Math.max(stats.bestChain, move.captured.length),
  };
}

export type GameMode = "two-player" | "vs-ai";

// In "vs-ai" mode the human plays `humanSide` (chosen at random for every
// new game, D81) and the AI the other colour. Black always moves first, so
// when the human is White the AI opens. In two player games `humanSide` is
// Black and means nothing.

/** The colour the AI plays in this game. */
export const aiSideOf = (state: Pick<GameState, "humanSide">): Player => opponentOf(state.humanSide);

// One position in the game's history and the move that led to it.
export interface HistoryEntry {
  readonly board: Board;
  readonly move: Move | null; // null for the starting position
  readonly player: Player | null; // who made `move`
  // The AI's own explanation of `move`, as the model wrote it (not verified).
  // Absent for human moves, the start position and AI replies without one.
  readonly reason?: string;
  // What the engine's look-ahead said about this AI move.
  readonly lookahead?: ChosenLookahead;
  // The level the AI played this move at (AI moves only).
  readonly level?: AiLevel;
  // The AI's reaction (trash talk) to the player's move just before, and the
  // engine's verdict on that move when it found it remarkable.
  readonly reaction?: string;
  readonly judgement?: MoveJudgement;
  // After this AI move the engine proved the player's position lost: every
  // move of theirs loses by force within its search (Change 4, the resign
  // hint).
  readonly provenLoss?: boolean;
}

// The extra details an AI move can carry into its history entry.
interface AiMoveDetails {
  readonly reason?: string | null | undefined;
  readonly lookahead?: ChosenLookahead | undefined;
  readonly reaction?: string | undefined;
  readonly judgement?: MoveJudgement | undefined;
  readonly level?: AiLevel | undefined;
  readonly provenLoss?: boolean | undefined;
}

// Where to go in the history: one of the four arrows, or a move number.
export type HistoryTarget = "first" | "back" | "forward" | "last" | number;

// idle: nothing pending. thinking: waiting for the AI's move (board locked).
// failed: the AI could not choose a valid move (board locked until Retry).
export type AiPhase = "idle" | "thinking" | "failed";

export interface GameState {
  readonly mode: GameMode;
  readonly board: Board;
  readonly currentPlayer: Player;
  // Every legal move for the current player (empty once the game is over).
  readonly legalMoves: readonly Move[];
  readonly selected: Position | null;
  // While the player is choosing between routes to the same square, the moves
  // still possible. Empty when no choice is pending.
  readonly pendingRoutes: readonly Move[];
  readonly winner: Player | null;
  readonly lastMove: Move | null;
  // Every position of the game: entry 0 is the start, entry n is the board
  // after move n. Used for the history arrows and the move list.
  readonly history: readonly HistoryEntry[];
  // Which history entry is on screen while reviewing, or null for the live
  // position. Reviewing never changes the game; the board is locked.
  readonly viewIndex: number | null;
  readonly movesPlayed: number;
  readonly stats: Readonly<Record<Player, SideStats>>;
  readonly aiPhase: AiPhase;
  // Identifies the current AI request. It changes whenever a request starts
  // and whenever a new game or mode begins, so a late reply to an old request
  // can be recognised and ignored.
  readonly aiRequestId: number;
  readonly aiFailureReasons: readonly string[];
  // How strong the AI plays (see src/ai/difficulty.ts). Fixed for the whole
  // game, so a game (and later a leaderboard win) belongs to one level;
  // choosing another level starts a new game (D44).
  readonly aiLevel: AiLevel;
  // Who resigned, if the game ended that way (Change 4): the player, or
  // since D89 the AI when its position is proven lost.
  readonly resignedBy: Player | null;
  // Why the game was drawn (D89): the same position a third time, or 40
  // moves each without a capture or a new King. Null while it goes on and
  // when someone won. A drawn game is over with no winner.
  readonly drawn: DrawReason | null;
  // The person's colour against the AI (D81); Black in two player games.
  readonly humanSide: Player;
  // The game against the AI was abandoned: the player did not move for a
  // minute (D85). It ends like a resignation (resignedBy is the player).
  readonly abandoned: boolean;
}

export type GameAction =
  | { type: "click"; position: Position }
  // A new game; `mode` and `level` change them for it (else they are kept).
  // `humanSide` is the person's colour against the AI (Black if left out):
  // the reducer stays pure, so the random pick is made by the caller (D81).
  | { type: "newGame"; mode?: GameMode; level?: AiLevel; humanSide?: Player }
  | { type: "setMode"; mode: GameMode; humanSide?: Player }
  | {
      type: "aiMoved";
      requestId: number;
      move: Move;
      reason?: string | null;
      lookahead?: ChosenLookahead | undefined;
      reaction?: string | undefined;
      judgement?: MoveJudgement | undefined;
      provenLoss?: boolean | undefined;
    }
  | { type: "resign" }
  // The AI gives up (D89): its position is proven lost. Tagged like a move.
  | { type: "aiResigned"; requestId: number }
  // The player left a game against the AI without a move (D85).
  | { type: "abandon" }
  | { type: "aiFailed"; requestId: number; reasons: readonly string[] }
  | { type: "aiRetry" }
  | { type: "history"; to: HistoryTarget };

export interface GameOptions {
  board?: Board;
  currentPlayer?: Player;
  mode?: GameMode;
  aiRequestId?: number;
  aiLevel?: AiLevel;
  humanSide?: Player; // the person's colour against the AI (Black if left out)
  // Moves to play through the reducer before the game is shown (the
  // development only ?testwin= helper, D60). See playRecord.ts.
  record?: readonly Move[];
}

// The AI is "thinking" whenever it is the AI's turn in a game that is not
// over: from the very start when the person is White (D81).
function aiPhaseFor(mode: GameMode, player: Player, over: boolean, humanSide: Player): AiPhase {
  return mode === "vs-ai" && player !== humanSide && !over ? "thinking" : "idle";
}

/** True once the game has ended: someone won (or resigned), or it was drawn (D89). */
export function isGameOver(state: Pick<GameState, "winner" | "drawn">): boolean {
  return state.winner !== null || state.drawn !== null;
}

// A fresh game: standard board, black to move. Options exist so tests can
// start from a prepared position.
export function createGameState(options: GameOptions = {}): GameState {
  const board = options.board ?? initialBoard();
  const currentPlayer = options.currentPlayer ?? "black";
  const mode = options.mode ?? "two-player";
  const winner = getWinner(board, currentPlayer);
  const humanSide = mode === "vs-ai" ? (options.humanSide ?? "black") : "black";

  return {
    mode,
    board,
    currentPlayer,
    legalMoves: getLegalMoves(board, currentPlayer),
    selected: null,
    pendingRoutes: [],
    winner,
    lastMove: null,
    history: [{ board, move: null, player: null }],
    viewIndex: null,
    movesPlayed: 0,
    stats: { black: NO_STATS, white: NO_STATS },
    aiPhase: aiPhaseFor(mode, currentPlayer, winner !== null, humanSide),
    aiRequestId: options.aiRequestId ?? 0,
    aiFailureReasons: [],
    aiLevel: options.aiLevel ?? DEFAULT_AI_LEVEL,
    resignedBy: null,
    drawn: null,
    humanSide,
    abandoned: false,
  };
}

// True when a human click may do anything: the game is not over, we are not
// waiting for (or recovering from) the AI, and the live position is on screen
// (not an older one from the history).
export function canHumanAct(state: GameState): boolean {
  return !isGameOver(state) && state.aiPhase === "idle" && state.viewIndex === null;
}

// The current player's legal moves for the piece on `from`.
function movesFrom(state: GameState, from: Position): Move[] {
  return state.legalMoves.filter((move) => samePosition(move.from, from));
}

// A piece can be selected only if the engine says it has a legal move.
// This is what blocks pieces that cannot capture when capturing is mandatory.
export function canSelect(state: GameState, position: Position): boolean {
  return movesFrom(state, position).length > 0;
}

function clearSelection(state: GameState): GameState {
  return { ...state, selected: null, pendingRoutes: [] };
}

// Plays a move from the legal list, then hands the turn over: recompute the
// other player's legal moves and ask the engine whether the game is won.
// Human and AI moves both go through here. If the AI must move next, the
// state becomes "thinking" with a new request id.
// A move that wins ends the game; otherwise the draw rules (D89) may.
function playMove(state: GameState, move: Move, ai: AiMoveDetails = {}): GameState {
  const board = applyMove(state.board, move);
  const nextPlayer = opponentOf(state.currentPlayer);
  const winner = getWinner(board, nextPlayer);
  const crowned = pieceAt(state.board, move.from)?.kind === "man" && pieceAt(board, move.to)?.kind === "king";
  const mover = state.currentPlayer;
  const history = [
    ...state.history,
    {
      board,
      move,
      player: mover,
      ...(ai.reason ? { reason: ai.reason } : {}),
      ...(ai.lookahead ? { lookahead: ai.lookahead } : {}),
      ...(ai.level ? { level: ai.level } : {}),
      ...(ai.reaction ? { reaction: ai.reaction } : {}),
      ...(ai.judgement ? { judgement: ai.judgement } : {}),
      ...(ai.provenLoss ? { provenLoss: true } : {}),
    },
  ];
  // Who moved first in this game (Black, unless a test started otherwise).
  const firstToMove = history[1]!.player!;
  const drawn = winner === null ? drawReason(history, firstToMove) : null;
  const aiPhase = aiPhaseFor(state.mode, nextPlayer, winner !== null || drawn !== null, state.humanSide);

  return {
    ...state,
    board,
    currentPlayer: nextPlayer,
    legalMoves: drawn ? [] : getLegalMoves(board, nextPlayer),
    selected: null,
    pendingRoutes: [],
    winner,
    drawn,
    lastMove: move,
    // Add the new position. If the player is reviewing (only possible when
    // the AI's reply arrives meanwhile), they stay where they are.
    history,
    movesPlayed: state.movesPlayed + 1,
    stats: { ...state.stats, [mover]: addToStats(state.stats[mover], move, crowned) },
    aiPhase,
    aiRequestId: aiPhase === "thinking" ? state.aiRequestId + 1 : state.aiRequestId,
    aiFailureReasons: [],
  };
}

// The player clicked a square while choosing between routes. If it is one of
// the route choices, narrow down (and play the move once one route is left).
function chooseRoute(state: GameState, position: Position): GameState | null {
  const narrowed = narrowRoutes(state.pendingRoutes, position);
  if (!narrowed) return null;
  return narrowed.length === 1
    ? playMove(state, narrowed[0]!)
    : { ...state, pendingRoutes: narrowed };
}

// The player clicked a square while a piece is selected: play the move that
// ends there, or start a route choice if several moves end there.
function clickDestination(state: GameState, position: Position): GameState | null {
  if (!state.selected) return null;

  const candidates = movesFrom(state, state.selected).filter((move) =>
    samePosition(move.to, position),
  );
  if (candidates.length === 1) return playMove(state, candidates[0]!);
  if (candidates.length > 1) return { ...state, pendingRoutes: candidates };
  return null;
}

// Handles one click on the board.
function handleClick(state: GameState, position: Position): GameState {
  if (!canHumanAct(state)) return state; // game over, or the AI's turn: locked

  if (state.pendingRoutes.length > 0) {
    const chosen = chooseRoute(state, position);
    if (chosen) return chosen;
    // Not a route square: cancel the choice and treat it as a normal click.
  }
  const base = { ...state, pendingRoutes: [] };

  if (canSelect(base, position)) {
    const isSameSquare = base.selected !== null && samePosition(base.selected, position);
    return isSameSquare ? clearSelection(base) : { ...base, selected: position };
  }

  return clickDestination(base, position) ?? clearSelection(base);
}

function sameMove(a: Move, b: Move): boolean {
  const samePath = (x: readonly Position[], y: readonly Position[]) =>
    x.length === y.length && x.every((position, i) => samePosition(position, y[i]!));
  return (
    samePosition(a.from, b.from) &&
    samePosition(a.to, b.to) &&
    samePath(a.path, b.path) &&
    samePath(a.captured, b.captured)
  );
}

// An AI reply only counts if it answers the request we are waiting for.
// Otherwise it is stale (new game, new mode, retry) and must change nothing.
function isCurrentAiRequest(state: GameState, requestId: number): boolean {
  return state.aiPhase === "thinking" && requestId === state.aiRequestId;
}

// The AI's chosen move goes through the same playMove as a human move, but
// only if it is one of the legal moves in the state. The reducer never plays a
// move on the AI's behalf.
function handleAiMoved(state: GameState, requestId: number, move: Move, ai: AiMoveDetails): GameState {
  if (!isCurrentAiRequest(state, requestId)) return state;

  const legal = state.legalMoves.find((candidate) => sameMove(candidate, move));
  if (!legal) {
    return {
      ...state,
      aiPhase: "failed",
      aiFailureReasons: ["The AI chose a move that is not legal."],
    };
  }
  return playMove(state, legal, { ...ai, level: state.aiLevel });
}

// The side giving up: the player in a game against the AI (the AI resigns
// through aiResigned), otherwise the side to move. The other side wins; a
// pending AI reply is dropped (new request id). Only while the game goes on.
function handleResign(state: GameState, resignedBy: Player = state.mode === "vs-ai" ? state.humanSide : state.currentPlayer): GameState {
  if (isGameOver(state)) return state;
  return {
    ...state,
    winner: opponentOf(resignedBy),
    resignedBy,
    legalMoves: [],
    selected: null,
    pendingRoutes: [],
    viewIndex: null,
    aiPhase: "idle",
    aiRequestId: state.aiRequestId + 1,
    aiFailureReasons: [],
  };
}

// A game against the AI the player left without a move (D85): it ends like
// the player's resignation, marked as abandoned. Only while it goes on.
function handleAbandon(state: GameState): GameState {
  if (state.mode !== "vs-ai" || isGameOver(state)) return state;
  return { ...handleResign(state), abandoned: true };
}

// The AI resigns (D89): only in answer to the request it was asked, like a
// move. The player wins.
function handleAiResigned(state: GameState, requestId: number): GameState {
  if (state.mode !== "vs-ai" || !isCurrentAiRequest(state, requestId)) return state;
  return handleResign(state, aiSideOf(state));
}

function handleAiFailed(
  state: GameState,
  requestId: number,
  reasons: readonly string[],
): GameState {
  if (!isCurrentAiRequest(state, requestId)) return state;
  return { ...state, aiPhase: "failed", aiFailureReasons: reasons };
}

// Retry after a failure: ask again, under a new request id.
function handleAiRetry(state: GameState): GameState {
  if (state.aiPhase !== "failed") return state;
  return {
    ...state,
    aiPhase: "thinking",
    aiRequestId: state.aiRequestId + 1,
    aiFailureReasons: [],
  };
}

// The history entry on screen: the one being reviewed, or the latest.
export function displayedIndex(state: GameState): number {
  return state.viewIndex ?? state.history.length - 1;
}

// Moves through the history, like the arrows on chess.com. Only changes what
// is on screen; the game itself is untouched. Going to the latest entry means
// "live" again (viewIndex null). Any selection is dropped.
function handleHistory(state: GameState, to: HistoryTarget): GameState {
  const last = state.history.length - 1;
  const current = displayedIndex(state);
  const wanted =
    to === "first" ? 0 : to === "back" ? current - 1 : to === "forward" ? current + 1 : to === "last" ? last : to;
  const target = Math.min(Math.max(Math.trunc(wanted), 0), last);

  const viewIndex = target === last ? null : target;
  if (viewIndex === state.viewIndex) return state;
  return { ...state, viewIndex, selected: null, pendingRoutes: [] };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "history":
      return handleHistory(state, action.to);
    case "click":
      return handleClick(state, action.position);
    case "newGame":
      return createGameState({
        mode: action.mode ?? state.mode,
        aiRequestId: state.aiRequestId + 1,
        aiLevel: action.level ?? state.aiLevel,
        ...(action.humanSide ? { humanSide: action.humanSide } : {}),
      });
    case "setMode":
      return action.mode === state.mode
        ? state
        : createGameState({
            mode: action.mode,
            aiRequestId: state.aiRequestId + 1,
            aiLevel: state.aiLevel,
            ...(action.humanSide ? { humanSide: action.humanSide } : {}),
          });
    case "aiMoved":
      return handleAiMoved(state, action.requestId, action.move, action);
    case "aiFailed":
      return handleAiFailed(state, action.requestId, action.reasons);
    case "aiRetry":
      return handleAiRetry(state);
    case "resign":
      return handleResign(state);
    case "aiResigned":
      return handleAiResigned(state, action.requestId);
    case "abandon":
      return handleAbandon(state);
  }
}
