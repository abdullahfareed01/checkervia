import { useCallback, useEffect, useReducer } from "react";
import { callModel } from "../ai";
import type { Position } from "../engine";
import { startAiTurn } from "./aiController";
import { createGameState, gameReducer } from "./gameReducer";
import type { AiLevel } from "../ai/difficulty";
import type { GameMode, GameOptions, HistoryTarget } from "./gameReducer";

// Connects the pure game reducer to React. Components get the state plus
// functions to send clicks, start a new game, change mode and retry the AI.
// `initial` sets up the first game only (used by the dev preview scenarios);
// New game always starts from the standard position.
export function useGame(initial?: GameOptions) {
  const [state, dispatch] = useReducer(gameReducer, initial, (options) => createGameState(options));

  // Whenever a new AI request starts, ask the model. The effect re-runs only
  // when the request id changes. Its cleanup cancels the pending request, so a
  // New game, a mode change or leaving the page drops the late reply.
  useEffect(() => {
    if (state.aiPhase !== "thinking") return undefined;
    return startAiTurn(state, callModel, dispatch);
    // `state` is deliberately not a dependency: the request must not restart
    // on unrelated state changes.
  }, [state.aiRequestId, state.aiPhase]);

  const click = useCallback(
    (position: Position) => dispatch({ type: "click", position }),
    [],
  );
  const newGame = useCallback(() => dispatch({ type: "newGame" }), []);
  const setMode = useCallback((mode: GameMode) => dispatch({ type: "setMode", mode }), []);
  const retryAi = useCallback(() => dispatch({ type: "aiRetry" }), []);
  const goHistory = useCallback((to: HistoryTarget) => dispatch({ type: "history", to }), []);
  const setAiLevel = useCallback((level: AiLevel) => dispatch({ type: "setAiLevel", level }), []);

  return { state, click, newGame, setMode, retryAi, goHistory, setAiLevel };
}
