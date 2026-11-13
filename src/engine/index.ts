// Public API of the rules engine.
export { applyMove } from "./apply";
export { BOARD_SIZE, boardFrom, initialBoard, isDarkSquare, opponentOf, pieceAt, samePosition, squareName } from "./board";
export { getLegalMoves } from "./moves";
export { getWinner } from "./status";
export type { Board, Move, Piece, PieceKind, Player, Position } from "./types";
