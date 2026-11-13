// Runs the AI's turn. Plain TypeScript (no React) so it can be tested with a
// fake model and a fake dispatch.
import { chooseMove, judgeMove } from "../ai";
import { analyze } from "../ai/analyzer";
import type { CallModel, MoveJudgement } from "../ai";
import { strongLanguage } from "../ai/language";
import type { OpponentMove } from "../ai/prompt";
import { squareName } from "../engine";
import type { GameAction, GameState } from "./gameReducer";

// How many of its own recent lines the AI is shown, to avoid repeating itself.
const RECENT_LINES = 3;

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
// "thinking". First the engine judges the player's last move (for a possible
// reaction); then the model chooses. When the answer arrives it is dispatched
// as `aiMoved` or `aiFailed`, tagged with this request's id so the reducer
// can ignore it if it turns out to be stale. Returns a function that cancels
// the request: after cancelling, nothing is dispatched.
export function startAiTurn(
  state: GameState,
  callModel: CallModel,
  dispatch: (action: GameAction) => void,
): () => void {
  const requestId = state.aiRequestId;
  let cancelled = false;

  const run = async () => {
    const opponent = await lastOpponentMove(state);
    const result = await chooseMove(state.board, state.currentPlayer, callModel, 3, {
      level: state.aiLevel,
      analyze,
      ...(opponent ? { opponent } : {}),
    });
    return { result, judgement: opponent?.judgement ?? null };
  };

  run().then(
    ({ result, judgement }) => {
      if (cancelled) return;
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
            }
          : { type: "aiFailed", requestId, reasons: result.reasons },
      );
    },
    (error: unknown) => {
      // chooseMove reports model problems as a result, so this is unexpected.
      if (cancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: "aiFailed", requestId, reasons: [message] });
    },
  );

  return () => {
    cancelled = true;
  };
}
