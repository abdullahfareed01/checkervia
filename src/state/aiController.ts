// Runs the AI's turn. Plain TypeScript (no React) so it can be tested with a
// fake model and a fake dispatch.
import { chooseMove, judgeMove } from "../ai";
import { analyze } from "../ai/analyzer";
import { provenLost } from "../ai/endgame";
import type { CallModel, ChooseMoveResult, MoveJudgement } from "../ai";
import { strongLanguage } from "../ai/language";
import type { OpponentMove } from "../ai/prompt";
import { ModelServiceError } from "../ai/serviceError";
import { applyMove, opponentOf, squareName } from "../engine";
import type { GameAction, GameState } from "./gameReducer";

// How many of its own recent lines the AI is shown, to avoid repeating itself.
const RECENT_LINES = 3;
// One budget covers search, model attempts and the post-move proof together.
export const AI_TURN_TIMEOUT_MS = 12_000;

// The opponent's last move and the engine's verdict on it (null when it was
// unremarkable), so the AI can react to it, plus the AI's last few lines.
// Undefined at the start of a game.
async function lastOpponentMove(state: GameState): Promise<OpponentMove | undefined> {
  const last = state.history[state.history.length - 1];
  const before = state.history[state.history.length - 2];
  if (!last?.move || !last.player || !before) return undefined;
  const judgement: MoveJudgement | null = await judgeMove(before.board, last.move, last.player, analyze);
  const recentLines = state.history.flatMap((entry) => (entry.reaction ? [entry.reaction] : [])).slice(-RECENT_LINES);
  return {
    label: [last.move.from, ...last.move.path].map(squareName).join(" -> "),
    judgement,
    recentLines,
    strongLanguage: strongLanguage(state.aiLevel),
  };
}

// Starts asking the model for a move, for a state whose AI phase is
// "thinking". First the engine checks whether the AI's own position is
// proven lost: then it resigns instead of moving (D89), as players may under
// the rules. Otherwise the engine judges the player's last move (for a
// possible reaction); then the model chooses. When the answer arrives it is dispatched
// as `aiMoved` or `aiFailed`, tagged with this request's id so the reducer
// can ignore it if it turns out to be stale. Returns a function that cancels
// the request: after cancelling, nothing is dispatched.
export function startAiTurn(
  state: GameState,
  callModel: CallModel,
  dispatch: (action: GameAction) => void,
  options: { timeoutMs?: number } = {},
): () => void {
  const requestId = state.aiRequestId;
  let cancelled = false;
  const controller = new AbortController();
  let fallback: Extract<ChooseMoveResult, { ok: true }> | undefined;
  const engineFallback = callModel.handlesChain === true;
  const timer = setTimeout(() => controller.abort(new ModelServiceError("timeout", false)), options.timeoutMs ?? AI_TURN_TIMEOUT_MS);
  let onAbort: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });

  const run = async () => {
    // Every legal move loses by force within the proof's depth: resign.
    if (state.mode === "vs-ai" && (await provenLost(state.board, state.currentPlayer, analyze))) return { resign: true as const };
    controller.signal.throwIfAborted();
    const opponent = await lastOpponentMove(state);
    const result = await chooseMove(state.board, state.currentPlayer, callModel, engineFallback ? 0 : 3, {
      engineFallback,
      opening: !state.history.some(entry => entry.player === state.currentPlayer),
      onFallbackReady: result => { fallback = result; },
      level: state.aiLevel,
      lineSeed: requestId,
      analyze,
      signal: controller.signal,
      retryDelayMs: 250,
      ...(opponent ? { opponent } : {}),
    });
    // After the AI's move: is the player's position now proven lost? (The
    // resign hint, Change 4.)
    const provenLoss = result.ok && (await provenLost(applyMove(state.board, result.move), opponentOf(state.currentPlayer), analyze));
    return { resign: false as const, result, judgement: opponent?.judgement ?? null, provenLoss };
  };

  void Promise.race([run(), aborted]).then(
    (answer) => {
      if (cancelled) return;
      if (answer.resign) {
        dispatch({ type: "aiResigned", requestId });
        return;
      }
      const { result, judgement, provenLoss } = answer;
      dispatch(
        result.ok
          ? {
              type: "aiMoved",
              requestId,
              move: result.move,
              reason: result.reason ?? null,
              lookahead: result.lookahead,
              // The AI's trash talk, and the engine's verdict when it had one.
              ...(result.reaction ? { reaction: result.reaction } : {}),
              ...(judgement ? { judgement } : {}),
              ...(provenLoss ? { provenLoss } : {}),
            }
          : { type: "aiFailed", requestId, reasons: result.reasons },
      );
    },
    (error: unknown) => {
      // chooseMove reports model problems as a result, so this is unexpected.
      if (cancelled) return;
      if (engineFallback && fallback) {
        dispatch({ type: "aiMoved", requestId, move: fallback.move, reason: fallback.reason ?? null, lookahead: fallback.lookahead, reaction: fallback.reaction });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: "aiFailed", requestId, reasons: [message] });
    },
  ).finally(() => {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", onAbort);
  });

  return () => {
    cancelled = true;
    controller.abort(new DOMException("The game changed.", "AbortError"));
  };
}
