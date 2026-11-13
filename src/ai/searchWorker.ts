// Runs the look-ahead in a background thread, so a deep search never freezes
// the board or its animations. Receives { board, player, depth } and answers
// with one score per legal move, in the engine's move order.
import type { Board, Player } from "../engine";
import { analyzeMoves } from "./search";

interface WorkerScope {
  onmessage: ((event: MessageEvent<{ board: Board; player: Player; depth: number }>) => void) | null;
  postMessage(data: unknown): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { board, player, depth } = event.data;
  scope.postMessage(analyzeMoves(board, player, depth).map((analysis) => analysis.score));
};
