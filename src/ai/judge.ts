// Judges the player's move with the engine's look-ahead, so the AI can react
// to it: a gentle tease for a blunder, praise for a great move, and nothing
// for ordinary or forced moves (so reactions stay rare and meaningful).
// The verdict is the engine's, never the model's.
import { getLegalMoves, samePosition, squareName } from "../engine";
import type { Board, Move, Player } from "../engine";
import { analyzeHere } from "./analyzer";
import type { Analyze } from "./analyzer";
import { isForced, turnsToResult } from "./search";

// How far ahead the engine looks to judge a move (independent of AI level).
export const JUDGE_DEPTH = 4;
// Losing at least this much material (in hundredths of a piece) compared
// with the best move is a blunder.
export const BLUNDER_LOSS = 100;
// The best move is "the only good move" when every other move is at least
// this much worse.
export const ONLY_MOVE_GAP = 100;

export type Verdict = "blunder" | "great";

export interface MoveJudgement {
  readonly verdict: Verdict;
  // One plain sentence of engine facts, for the AI's prompt and the popup.
  readonly detail: string;
}

function sameMove(a: Move, b: Move): boolean {
  return (
    samePosition(a.from, b.from) &&
    a.path.length === b.path.length &&
    a.path.every((square, i) => samePosition(square, b.path[i]!))
  );
}

// Shown to players (in "Why?") and sent to the model: an arrow, no hyphens.
const label = (move: Move) => [move.from, ...move.path].map(squareName).join(" → ");

function piecesText(score: number): string {
  const amount = (Math.abs(score) / 100).toFixed(1);
  return `${amount} ${amount === "1.0" ? "piece" : "pieces"}`;
}

const isWin = (score: number) => isForced(score) && score > 0;
const isLoss = (score: number) => isForced(score) && score < 0;

/**
 * The engine's verdict on `move`, played by `player` on `before`, or null if
 * it is not worth a reaction. Never throws: any problem means no reaction.
 */
export async function judgeMove(
  before: Board,
  move: Move,
  player: Player,
  analyze: Analyze = analyzeHere,
): Promise<MoveJudgement | null> {
  try {
    const moves = getLegalMoves(before, player);
    if (moves.length < 2) return null; // forced: nothing to judge
    const { scores } = await analyze(before, player, JUDGE_DEPTH);
    if (scores.length !== moves.length || !scores.every(Number.isFinite)) return null;

    const index = moves.findIndex((candidate) => sameMove(candidate, move));
    if (index < 0) return null;
    const played = scores[index]!;
    const best = Math.max(...scores);
    const bestMove = moves[scores.indexOf(best)]!;
    const nextBest = Math.max(...scores.filter((_, i) => i !== index));

    // Blunders: a forced win thrown away, or material given up.
    if (isWin(best) && !isWin(played)) {
      return { verdict: "blunder", detail: `It missed a forced win: ${label(bestMove)} wins in ${turnsToResult(best)} turns.` };
    }
    if (best - played >= BLUNDER_LOSS) {
      const what = isLoss(played)
        ? "It now loses by force"
        : `It loses about ${piecesText(best - played)} compared with the best move`;
      return { verdict: "blunder", detail: `${what} (${label(bestMove)}).` };
    }

    // Praise only what stands out: a forced win found, a multi jump, or the
    // only good move in the position.
    if (played < best) return null;
    if (isWin(played)) {
      return { verdict: "great", detail: `It finds a forced win in ${turnsToResult(played)} turns.` };
    }
    if (move.captured.length >= 2) {
      return { verdict: "great", detail: `It is a multi jump that takes ${move.captured.length} pieces.` };
    }
    if (played - nextBest >= ONLY_MOVE_GAP) {
      return { verdict: "great", detail: `It is the only good move: every other move is at least ${piecesText(played - nextBest)} worse.` };
    }
    return null;
  } catch {
    return null;
  }
}
