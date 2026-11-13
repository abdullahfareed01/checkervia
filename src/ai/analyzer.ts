// Gets look-ahead scores for the AI's legal moves, in the background when the
// browser allows it. Built never to fail a turn: if the worker breaks or is
// stuck, the same search runs on the page instead.
import type { Board, Player } from "../engine";
import { analyzeMoves } from "./search";

export interface Lookahead {
  readonly depth: number; // turns actually searched (may be less than asked)
  readonly scores: readonly number[]; // one per legal move, engine move order
}

export type Analyze = (board: Board, player: Player, depth: number) => Promise<Lookahead>;

// A 6-turn search takes at most about 0.3 s; this only catches a stuck worker.
export const WORKER_TIMEOUT_MS = 10_000;

/** The search on the page itself (tests, and the fallback). */
export const analyzeHere: Analyze = async (board, player, depth) => ({
  depth,
  scores: analyzeMoves(board, player, depth).map((analysis) => analysis.score),
});

// One search in a fresh worker, which is closed afterwards.
function analyzeInWorker(board: Board, player: Player, depth: number): Promise<Lookahead> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./searchWorker.ts", import.meta.url), { type: "module" });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("look-ahead timed out"));
    }, WORKER_TIMEOUT_MS);
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      finish();
      const scores = event.data;
      if (Array.isArray(scores) && scores.every((score) => typeof score === "number")) resolve({ depth, scores });
      else reject(new Error("look-ahead sent an unreadable answer"));
    };
    worker.onerror = () => {
      finish();
      reject(new Error("look-ahead worker failed"));
    };
    worker.postMessage({ board, player, depth });
  });
}

/**
 * The analyzer the app uses: a background worker where available, otherwise
 * (or if the worker fails) the same search on the page. Always the full depth:
 * the level's candidate moves must be the same as the server would work out
 * (D44), and even 6 turns takes at most about 0.3 s on the page.
 */
export const analyze: Analyze = async (board, player, depth) => {
  if (typeof Worker === "undefined") return analyzeHere(board, player, depth);
  try {
    return await analyzeInWorker(board, player, depth);
  } catch {
    return analyzeHere(board, player, depth);
  }
};
