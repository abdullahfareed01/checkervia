// Engine facts for the end of the game (Change 4): whether the player's
// position is proven lost (for the resign hint), and tips from the engine
// after the AI wins. Nothing here is invented: every tip comes from a search
// of a position the player actually had.
import { applyMove, getLegalMoves, opponentOf, samePosition, squareName } from "../engine";
import type { Board, Move, Player } from "../engine";
import type { Analyze } from "./analyzer";
import { analyzeHere } from "./analyzer";
import { isForced, turnsToResult } from "./search";

// How far the engine looks to prove a loss: 6 turns (3 moves each side),
// like the Strongest level. A proof holds within that depth only.
export const PROOF_DEPTH = 6;
// How far it looks to grade each of the player's moves for the tips (the
// same depth that judges blunders during the game).
export const TIP_DEPTH = 4;
// A move counts for the "where you lost the most" tip from this loss on
// (hundredths of a piece).
export const TIP_MIN_LOSS = 50;

const isWin = (score: number) => isForced(score) && score > 0;
const isLoss = (score: number) => isForced(score) && score < 0;

/**
 * True only when the search proves that every legal move of `player` loses
 * by force within PROOF_DEPTH turns. Never true by guesswork: a failed or
 * malformed search means false.
 */
export async function provenLost(board: Board, player: Player, analyze: Analyze = analyzeHere): Promise<boolean> {
  try {
    const moves = getLegalMoves(board, player);
    if (moves.length === 0) return false; // the game is over anyway
    const { depth, scores } = await analyze(board, player, PROOF_DEPTH);
    return depth === PROOF_DEPTH && scores.length === moves.length && scores.every(isLoss);
  } catch {
    return false;
  }
}

// One position of the game, as the tips need it.
export interface PlayedPosition {
  readonly board: Board; // before the move
  readonly move: Move;
  readonly player: Player;
  readonly number: number; // move number in the game, from 1
}

export interface GameTip {
  readonly kind: "costliest" | "missedWin" | "general";
  readonly text: string;
}

const label = (move: Move) => [move.from, ...move.path].map(squareName).join(" → ");
const pieces = (score: number) => {
  const amount = (score / 100).toFixed(1);
  return `${amount} ${amount === "1.0" ? "piece" : "pieces"}`;
};

function sameMove(a: Move, b: Move): boolean {
  return samePosition(a.from, b.from) && a.path.length === b.path.length && a.path.every((square, i) => samePosition(square, b.path[i]!));
}

// What the engine says about one of the player's moves.
interface Graded {
  readonly position: PlayedPosition;
  readonly loss: number; // best score minus the played move's score
  readonly best: Move;
  readonly bestScore: number;
  readonly playedScore: number;
  readonly leftPieceHanging: boolean; // the moved piece could be jumped next
}

async function grade(position: PlayedPosition, analyze: Analyze): Promise<Graded | null> {
  const moves = getLegalMoves(position.board, position.player);
  if (moves.length < 2) return null; // forced: nothing to learn
  const { scores } = await analyze(position.board, position.player, TIP_DEPTH);
  const index = moves.findIndex((move) => sameMove(move, position.move));
  if (index < 0 || scores.length !== moves.length) return null;
  const bestScore = Math.max(...scores);
  const after = applyMove(position.board, position.move);
  const replies = getLegalMoves(after, opponentOf(position.player));
  return {
    position,
    loss: bestScore - scores[index]!,
    best: moves[scores.indexOf(bestScore)]!,
    bestScore,
    playedScore: scores[index]!,
    leftPieceHanging: replies.some((reply) => reply.captured.some((square) => samePosition(square, position.move.to))),
  };
}

// The tip that matches how the game went, from engine counts.
function generalTip(graded: readonly Graded[], kingsMade: { player: number; ai: number }, positions: readonly PlayedPosition[]): string {
  const hanging = graded.filter((entry) => entry.leftPieceHanging).length;
  if (hanging >= 2) {
    return `${hanging} of your moves put the piece where it could be jumped next turn. Before you move, check the square behind the landing square.`;
  }
  if (kingsMade.ai > kingsMade.player) {
    return `The AI made ${kingsMade.ai} ${kingsMade.ai === 1 ? "King" : "Kings"} and you made ${kingsMade.player}. Guard your back row and race for the far row.`;
  }
  const early = positions.slice(0, 10);
  const backRow = early.filter((position) => position.player === "black" && position.move.from.row === 7).length;
  if (backRow >= 3) {
    return `You moved ${backRow} pieces off your back row in your first 10 moves. Keeping some there stops the AI from crowning.`;
  }
  return "Trade pieces when you are ahead, and avoid trades when you are behind.";
}

/**
 * Up to three tips for the player after the AI won, all from the engine:
 * the move that cost the most (if any cost at least half a piece), a forced
 * win the player missed (if any), and one general tip matched to the game.
 * Captures are compulsory in this game, so a missed capture cannot happen.
 */
export async function gameTips(
  positions: readonly PlayedPosition[],
  kingsMade: { player: number; ai: number },
  analyze: Analyze = analyzeHere,
): Promise<GameTip[]> {
  const graded: Graded[] = [];
  for (const position of positions) {
    if (position.player !== "black") continue;
    try {
      const entry = await grade(position, analyze);
      if (entry) graded.push(entry);
    } catch {
      // A failed search gives no tip for this move; nothing is made up.
    }
  }

  const tips: GameTip[] = [];
  const costliest = graded.reduce<Graded | null>((worst, entry) => (!worst || entry.loss > worst.loss ? entry : worst), null);
  if (costliest && costliest.loss >= TIP_MIN_LOSS) {
    const { number, move } = costliest.position;
    const cost = isLoss(costliest.playedScore) && !isLoss(costliest.bestScore) ? "it let the AI force a win" : `it cost you about ${pieces(costliest.loss)}`;
    tips.push({ kind: "costliest", text: `Move ${number}: you played ${label(move)}, and ${cost}. ${label(costliest.best)} was better.` });
  }
  const missed = graded.find((entry) => isWin(entry.bestScore) && !isWin(entry.playedScore));
  if (missed) {
    tips.push({
      kind: "missedWin",
      text: `Move ${missed.position.number}: ${label(missed.best)} won by force in ${turnsToResult(missed.bestScore)} turns. You played ${label(missed.position.move)}.`,
    });
  }
  tips.push({ kind: "general", text: generalTip(graded, kingsMade, positions) });
  return tips.slice(0, 3);
}
