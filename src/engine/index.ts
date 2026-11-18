// Public API of the rules engine.
export { applyMove } from "./apply";
export { BOARD_SIZE, boardFrom, initialBoard, isDarkSquare, opponentOf, pieceAt, samePosition, squareName } from "./board";
export { getLegalMoves } from "./moves";
export { getWinner } from "./status";
export { MOVES_WITHOUT_PROGRESS, REPETITIONS_FOR_DRAW, drawReason, isProgress, positionKey } from "./draw";
export type { DrawReason, GamePosition } from "./draw";
export type { Board, Move, Piece, PieceKind, Player, Position } from "./types";
