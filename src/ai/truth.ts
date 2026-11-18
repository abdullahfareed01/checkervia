// A deliberately narrow truth check: only exact engine-grounded statements
// pass. Free-form prose is unverified, never silently labelled true.
import { applyMove, getLegalMoves, getWinner, opponentOf, pieceAt, samePosition } from "../engine";
import type { Board, Move, Player } from "../engine";

export function checkedReasons(board: Board, move: Move, player: Player, legalCount: number, score?: number, best?: number): string[] {
  const after = applyMove(board, move);
  const facts: string[] = [];
  if (legalCount === 1) facts.push("This was the only legal move.");
  if (move.captured.length) facts.push(`It captured ${move.captured.length} ${move.captured.length === 1 ? "piece" : "pieces"}.`);
  if (pieceAt(board, move.from)?.kind === "man" && pieceAt(after, move.to)?.kind === "king") facts.push("The piece became a king.");
  if (getWinner(after, opponentOf(player)) === player) facts.push("This move wins the game.");
  const atRisk = getLegalMoves(after, opponentOf(player)).some(reply => reply.captured.some(square => samePosition(square, move.to)));
  facts.push(atRisk ? "The moved piece can be captured next turn." : "The moved piece cannot be captured next turn.");
  if (score !== undefined && best !== undefined && score >= best) facts.push("It has the highest engine score at this level.");
  return facts;
}
export function reasonPasses(reason: string | undefined, facts: readonly string[]): boolean {
  const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return Boolean(reason && facts.some(fact => normalize(fact) === normalize(reason)));
}
